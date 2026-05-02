import { createContext, useContext, useState, useCallback, useEffect, useMemo, type ReactNode } from 'react'

export type ChatMessage = {
  id: string
  conversationId: string
  sender: string
  text: string
  timestamp: string
  status?: 'sending' | 'sent' | 'delivered' | 'seen'
}

const DELIVERY_RANK: Record<NonNullable<ChatMessage['status']>, number> = {
  sending: 0,
  sent: 1,
  delivered: 2,
  seen: 3,
}

/** Get a stable conversation id for two participants (order-independent). */
export function getConversationId(participantA: string, participantB: string): string {
  return [participantA, participantB].sort().join('-')
}

type ChatContextValue = {
  messages: ChatMessage[]
  getMessagesForConversation: (conversationId: string) => ChatMessage[]
  getLastMessageForConversation: (conversationId: string) => ChatMessage | undefined
  addMessage: (
    conversationId: string,
    sender: string,
    text: string,
    options?: { status?: ChatMessage['status'] }
  ) => string | null
  upsertMessages: (entries: ChatMessage[]) => void
  setMessageStatus: (messageId: string, status: NonNullable<ChatMessage['status']>) => void
  markLatestOwnMessageSeen: (conversationId: string, sender: string) => void
  getUnreadCount: (conversationId: string, currentUsers: string | string[]) => number
  markConversationRead: (conversationId: string) => void
  panelOpen: boolean
  setPanelOpen: (open: boolean) => void
  /** True while ChatPage is mounted and polling — SidebarLayout skips its own poll to avoid double requests. */
  chatPollingActive: boolean
  setChatPollingActive: (active: boolean) => void
}

const ChatContext = createContext<ChatContextValue | null>(null)

const MAX_MESSAGES = 1000
const LAST_READ_STORAGE_KEY = 'aa2000_chat_last_read'

function normalizeIdentity(value: string): string {
  return String(value ?? '').trim().toLowerCase()
}

function normalizeCurrentUsers(currentUsers: string | string[]): Set<string> {
  const values = Array.isArray(currentUsers) ? currentUsers : [currentUsers]
  return new Set(values.map((v) => normalizeIdentity(v)).filter(Boolean))
}

function messageFingerprint(m: Pick<ChatMessage, 'conversationId' | 'text' | 'timestamp'>): string {
  const conversationId = String(m.conversationId ?? '').trim().toLowerCase()
  const text = String(m.text ?? '').trim().toLowerCase()
  // Normalize to second precision to collapse duplicate deliveries
  // from optimistic UI, websocket echo, and periodic history sync.
  const timestamp = String(m.timestamp ?? '').trim().slice(0, 19)
  return `${conversationId}|${text}|${timestamp}`
}

function parseTimestampMs(v: string): number {
  const ms = Date.parse(v)
  return Number.isFinite(ms) ? ms : NaN
}

/** Merge optimistic `chat-*` rows with server echo — same conv, same text, ~same time. Sender may differ (DB full name vs display). */
function mergeOptimisticWithEchoes(messages: ChatMessage[]): ChatMessage[] {
  const sorted = [...messages].sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  const out: ChatMessage[] = []
  const WINDOW = 6

  for (const m of sorted) {
    let handled = false
    for (let k = out.length - 1; k >= 0 && k >= out.length - WINDOW; k--) {
      const p = out[k]
      if (p.conversationId !== m.conversationId) continue
      if (p.text.trim().toLowerCase() !== m.text.trim().toLowerCase()) continue
      const pt = parseTimestampMs(p.timestamp)
      const mt = parseTimestampMs(m.timestamp)
      if (!Number.isFinite(pt) || !Number.isFinite(mt) || Math.abs(pt - mt) > 35_000) continue

      const pOpt = p.id.startsWith('chat-')
      const mOpt = m.id.startsWith('chat-')
      const sameSender = normalizeIdentity(p.sender) === normalizeIdentity(m.sender)
      const echoPair = pOpt !== mOpt

      // Own message: optimistic + server may use different display strings — still one bubble.
      if (echoPair && !sameSender) {
        if (pOpt && !mOpt) {
          const rankP = DELIVERY_RANK[p.status ?? 'sent']
          const rankM = DELIVERY_RANK[m.status ?? 'sent']
          out[k] = rankM >= rankP ? m : { ...m, status: p.status }
          handled = true
          break
        }
        if (!pOpt && mOpt) {
          handled = true
          break
        }
      }

      if (!sameSender && !echoPair) continue

      // Duplicate server deliveries (poll + socket): drop the later one.
      if (!pOpt && !mOpt) {
        handled = true
        break
      }
      // Replace optimistic with server row (canonical id + timestamp).
      if (pOpt && !mOpt) {
        const rankP = DELIVERY_RANK[p.status ?? 'sent']
        const rankM = DELIVERY_RANK[m.status ?? 'sent']
        out[k] = rankM >= rankP ? m : { ...m, status: p.status }
        handled = true
        break
      }
      // Server already stored; drop trailing optimistic echo.
      if (!pOpt && mOpt) {
        handled = true
        break
      }
    }
    if (!handled) out.push(m)
  }
  return out
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [lastReadAt, setLastReadAt] = useState<Record<string, string>>(() => {
    try {
      const raw = localStorage.getItem(LAST_READ_STORAGE_KEY)
      if (!raw) return {}
      const parsed = JSON.parse(raw) as Record<string, string>
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      return {}
    }
  })
  const [panelOpen, setPanelOpen] = useState(false)
  const [chatPollingActive, setChatPollingActive] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem(LAST_READ_STORAGE_KEY, JSON.stringify(lastReadAt))
    } catch {
      // ignore
    }
  }, [lastReadAt])

  const getUnreadCount = useCallback(
    (conversationId: string, currentUsers: string | string[]) => {
      const currentUserSet = normalizeCurrentUsers(currentUsers)
      const readBefore = lastReadAt[conversationId] ?? ''
      return messages.filter(
        (m) =>
          m.conversationId === conversationId &&
          !currentUserSet.has(normalizeIdentity(m.sender)) &&
          m.timestamp > readBefore
      ).length
    },
    [messages, lastReadAt]
  )

  const markConversationRead = useCallback((conversationId: string) => {
    const latestTimestamp = messages
      .filter((m) => m.conversationId === conversationId)
      .map((m) => m.timestamp)
      .sort()
      .at(-1) || new Date().toISOString()

    setLastReadAt((prev) => ({ ...prev, [conversationId]: latestTimestamp }))
  }, [messages])

  const getMessagesForConversation = useCallback(
    (conversationId: string) => {
      return messages.filter((m) => m.conversationId === conversationId)
    },
    [messages]
  )

  const getLastMessageForConversation = useCallback(
    (conversationId: string) => {
      const conv = messages.filter((m) => m.conversationId === conversationId)
      return conv.length > 0 ? conv[conv.length - 1] : undefined
    },
    [messages]
  )

  const addMessage = useCallback((conversationId: string, sender: string, text: string, options?: { status?: ChatMessage['status'] }) => {
    const trimmed = text.trim()
    if (!trimmed) return null
    const nextId = `chat-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    const entry: ChatMessage = {
      id: nextId,
      conversationId,
      sender,
      text: trimmed,
      timestamp: new Date().toISOString(),
      status: options?.status ?? 'sent',
    }
    setMessages((prev) => [...prev.slice(-(MAX_MESSAGES - 1)), entry])
    return nextId
  }, [])

  const setMessageStatus = useCallback((messageId: string, status: NonNullable<ChatMessage['status']>) => {
    if (!messageId) return
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId) return m
        const currentRank = DELIVERY_RANK[m.status ?? 'sent']
        const nextRank = DELIVERY_RANK[status]
        return nextRank >= currentRank ? { ...m, status } : m
      })
    )
  }, [])

  const markLatestOwnMessageSeen = useCallback((conversationId: string, sender: string) => {
    setMessages((prev) => {
      let updated = false
      const next = [...prev]
      for (let i = next.length - 1; i >= 0; i -= 1) {
        const m = next[i]
        if (m.conversationId !== conversationId || m.sender !== sender) continue
        const rank = DELIVERY_RANK[m.status ?? 'sent']
        if (rank >= DELIVERY_RANK.seen) break
        next[i] = { ...m, status: 'seen' }
        updated = true
        break
      }
      return updated ? next : prev
    })
  }, [])

  const upsertMessages = useCallback((entries: ChatMessage[]) => {
    if (!Array.isArray(entries) || entries.length === 0) return
    setMessages((prev) => {
      const byKey = new Map<string, ChatMessage>()
      const put = (m: ChatMessage) => {
        if (!m || !m.id || !m.conversationId || !m.sender || !m.text || !m.timestamp) return
        const key = messageFingerprint(m)
        const existing = byKey.get(key)
        if (!existing) {
          byKey.set(key, m)
          return
        }
        const existingRank = DELIVERY_RANK[existing.status ?? 'sent']
        const nextRank = DELIVERY_RANK[m.status ?? 'sent']
        // Prefer non-optimistic ids when available.
        if (existing.id.startsWith('chat-') && !m.id.startsWith('chat-')) {
          byKey.set(key, nextRank >= existingRank ? m : { ...m, status: existing.status })
          return
        }
        if (nextRank > existingRank) byKey.set(key, { ...existing, status: m.status })
      }

      for (const m of prev) put(m)
      for (const m of entries) put(m)

      const deduped = Array.from(byKey.values())
      const merged = mergeOptimisticWithEchoes(deduped)

      return merged
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
        .slice(-MAX_MESSAGES)
    })
  }, [])

  const value = useMemo(
    () => ({
      messages,
      getMessagesForConversation,
      getLastMessageForConversation,
      addMessage,
      upsertMessages,
      setMessageStatus,
      markLatestOwnMessageSeen,
      getUnreadCount,
      markConversationRead,
      panelOpen,
      setPanelOpen,
      chatPollingActive,
      setChatPollingActive,
    }),
    [messages, getMessagesForConversation, getLastMessageForConversation, addMessage, upsertMessages, setMessageStatus, markLatestOwnMessageSeen, getUnreadCount, markConversationRead, panelOpen, chatPollingActive]
  )

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
}

export function useChat() {
  const ctx = useContext(ChatContext)
  if (!ctx) {
    throw new Error('useChat must be used within ChatProvider')
  }
  return ctx
}
