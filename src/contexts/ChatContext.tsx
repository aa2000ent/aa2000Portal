import { createContext, useContext, useState, useCallback, useEffect, useMemo, type ReactNode } from 'react'

export type ChatMessage = {
  id: string
  conversationId: string
  sender: string
  text: string
  timestamp: string
}

/** Get a stable conversation id for two participants (order-independent). */
export function getConversationId(participantA: string, participantB: string): string {
  return [participantA, participantB].sort().join('-')
}

type ChatContextValue = {
  messages: ChatMessage[]
  getMessagesForConversation: (conversationId: string) => ChatMessage[]
  getLastMessageForConversation: (conversationId: string) => ChatMessage | undefined
  addMessage: (conversationId: string, sender: string, text: string) => void
  upsertMessages: (entries: ChatMessage[]) => void
  getUnreadCount: (conversationId: string, currentUsers: string | string[]) => number
  markConversationRead: (conversationId: string) => void
  panelOpen: boolean
  setPanelOpen: (open: boolean) => void
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

  const addMessage = useCallback((conversationId: string, sender: string, text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return
    const entry: ChatMessage = {
      id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      conversationId,
      sender,
      text: trimmed,
      timestamp: new Date().toISOString(),
    }
    setMessages((prev) => [...prev.slice(-(MAX_MESSAGES - 1)), entry])
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
        // Prefer non-optimistic ids when available.
        if (existing.id.startsWith('chat-') && !m.id.startsWith('chat-')) {
          byKey.set(key, m)
        }
      }

      for (const m of prev) put(m)
      for (const m of entries) put(m)

      const deduped = Array.from(byKey.values())
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp))

      // Secondary collapse: same conversation+text within 10s window.
      // Handles cases where optimistic and server timestamps differ slightly.
      const collapsed: ChatMessage[] = []
      for (const msg of deduped) {
        const last = collapsed[collapsed.length - 1]
        if (!last) {
          collapsed.push(msg)
          continue
        }
        const sameConversation = last.conversationId === msg.conversationId
        const sameText = last.text.trim().toLowerCase() === msg.text.trim().toLowerCase()
        const lastMs = parseTimestampMs(last.timestamp)
        const msgMs = parseTimestampMs(msg.timestamp)
        const closeInTime =
          Number.isFinite(lastMs) &&
          Number.isFinite(msgMs) &&
          Math.abs(msgMs - lastMs) <= 10_000
        if (sameConversation && sameText && closeInTime) {
          if (last.id.startsWith('chat-') && !msg.id.startsWith('chat-')) {
            collapsed[collapsed.length - 1] = msg
          }
          continue
        }
        collapsed.push(msg)
      }

      return collapsed
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
      getUnreadCount,
      markConversationRead,
      panelOpen,
      setPanelOpen,
    }),
    [messages, getMessagesForConversation, getLastMessageForConversation, addMessage, upsertMessages, getUnreadCount, markConversationRead, panelOpen]
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
