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
  getUnreadCount: (conversationId: string, currentUser: string) => number
  markConversationRead: (conversationId: string) => void
  panelOpen: boolean
  setPanelOpen: (open: boolean) => void
}

const ChatContext = createContext<ChatContextValue | null>(null)

const MAX_MESSAGES = 1000

export function ChatProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [lastReadAt, setLastReadAt] = useState<Record<string, string>>({})
  const [panelOpen, setPanelOpen] = useState(false)

  useEffect(() => {
    // Ensure previous chat persistence is removed.
    try {
      localStorage.removeItem('aa2000_chat_messages')
      localStorage.removeItem('aa2000_chat_last_read')
    } catch {
      // ignore
    }
  }, [])

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

  const upsertMessages = useCallback((entries: ChatMessage[]) => {
    if (!Array.isArray(entries) || entries.length === 0) return
    setMessages((prev) => {
      const byId = new Map<string, ChatMessage>()
      for (const m of prev) byId.set(m.id, m)
      for (const m of entries) {
        if (!m || !m.id || !m.conversationId || !m.sender || !m.text || !m.timestamp) continue
        byId.set(m.id, m)
      }
      return Array.from(byId.values())
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
