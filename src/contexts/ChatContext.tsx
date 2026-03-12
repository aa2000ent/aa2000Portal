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
  getUnreadCount: (conversationId: string, currentUser: string) => number
  markConversationRead: (conversationId: string) => void
  panelOpen: boolean
  setPanelOpen: (open: boolean) => void
}

const ChatContext = createContext<ChatContextValue | null>(null)

const STORAGE_KEY = 'aa2000_chat_messages'
const LAST_READ_KEY = 'aa2000_chat_last_read'
const MAX_MESSAGES = 1000

function loadFromStorage(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (m: unknown): m is ChatMessage =>
        typeof m === 'object' &&
        m !== null &&
        typeof (m as ChatMessage).id === 'string' &&
        typeof (m as ChatMessage).conversationId === 'string' &&
        typeof (m as ChatMessage).sender === 'string' &&
        typeof (m as ChatMessage).text === 'string' &&
        typeof (m as ChatMessage).timestamp === 'string'
    )
  } catch {
    return []
  }
}

function loadLastRead(): Record<string, string> {
  try {
    const raw = localStorage.getItem(LAST_READ_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return {}
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof k === 'string' && typeof v === 'string') out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

function saveToStorage(messages: ChatMessage[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_MESSAGES)))
  } catch {
    // ignore
  }
}

function saveLastRead(lastRead: Record<string, string>) {
  try {
    localStorage.setItem(LAST_READ_KEY, JSON.stringify(lastRead))
  } catch {
    // ignore
  }
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ChatMessage[]>(loadFromStorage)
  const [lastReadAt, setLastReadAt] = useState<Record<string, string>>(loadLastRead)
  const [panelOpen, setPanelOpen] = useState(false)

  useEffect(() => {
    saveToStorage(messages)
  }, [messages])

  useEffect(() => {
    saveLastRead(lastReadAt)
  }, [lastReadAt])

  const getUnreadCount = useCallback(
    (conversationId: string, currentUser: string) => {
      const readBefore = lastReadAt[conversationId] ?? ''
      return messages.filter(
        (m) =>
          m.conversationId === conversationId &&
          m.sender !== currentUser &&
          m.timestamp > readBefore
      ).length
    },
    [messages, lastReadAt]
  )

  const markConversationRead = useCallback((conversationId: string) => {
    setLastReadAt((prev) => ({ ...prev, [conversationId]: new Date().toISOString() }))
  }, [])

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

  const value = useMemo(
    () => ({
      messages,
      getMessagesForConversation,
      getLastMessageForConversation,
      addMessage,
      getUnreadCount,
      markConversationRead,
      panelOpen,
      setPanelOpen,
    }),
    [messages, getMessagesForConversation, getLastMessageForConversation, addMessage, getUnreadCount, markConversationRead, panelOpen]
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
