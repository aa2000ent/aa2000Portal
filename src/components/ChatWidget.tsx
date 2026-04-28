import { useState, useRef, useEffect, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { useChat } from '../contexts/ChatContext'

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  marketing: 'Marketing',
  finance: 'Finance',
  engineering: 'Engineering',
  'general-manager': 'General Manager',
}

function formatChatTime(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  if (sameDay) {
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

type ChatWidgetProps = {
  /** When 'nav', trigger is in side nav; panel uses context open state. */
  variant?: 'floating' | 'nav'
}

export default function ChatWidget({ variant = 'floating' }: ChatWidgetProps) {
  const location = useLocation()
  const path = location.pathname.replace(/^\//, '').split('/')[0] || 'admin'
  const currentSender = ROLE_LABELS[path] ?? path

  const { messages, addMessage, getUnreadCount, panelOpen, setPanelOpen } = useChat()
  const unreadTotal = useMemo(() => {
    const conversationIds = Array.from(new Set(messages.map((m) => m.conversationId)))
    return conversationIds.reduce((sum, cid) => sum + getUnreadCount(cid, currentSender), 0)
  }, [messages, getUnreadCount, currentSender])

  const [internalOpen, setInternalOpen] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const isNav = variant === 'nav'
  const open = isNav ? panelOpen : internalOpen
  const setOpen = isNav ? setPanelOpen : setInternalOpen

  useEffect(() => {
    if (open && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [open, messages])

  useEffect(() => {
    if (!isNav || !open) return
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current?.contains(e.target as Node)) return
      setPanelOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isNav, open, setPanelOpen])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const text = inputValue.trim()
    if (!text) return
    addMessage(path, currentSender, text)
    setInputValue('')
  }

  return (
    <>
      {!isNav && (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="chat-widget-trigger"
          aria-label={open ? 'Close chat' : 'Open chat'}
          aria-expanded={open}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          {unreadTotal > 0 && (
            <span className="chat-widget-badge" aria-hidden>
              {unreadTotal > 99 ? '99+' : unreadTotal}
            </span>
          )}
        </button>
      )}

      {open && (
        <div ref={panelRef} className={`chat-widget-panel ${isNav ? 'chat-widget-panel-nav' : ''}`} role="dialog" aria-label="Chat with all user levels">
          <div className="chat-widget-header">
            <h2 className="chat-widget-title">Chat</h2>
            <p className="chat-widget-subtitle">All user levels • You are {currentSender}</p>
          </div>
          <div ref={listRef} className="chat-widget-list">
            {messages.length === 0 ? (
              <p className="chat-widget-empty">No messages yet. Say hello!</p>
            ) : (
              messages.map((m) => {
                const isOwn = m.sender === currentSender
                return (
                  <div key={m.id} className={`chat-widget-message ${isOwn ? 'chat-widget-message-own' : ''}`}>
                    <span className="chat-widget-message-sender">{m.sender}</span>
                    <p className="chat-widget-message-text">{m.text}</p>
                    <span className="chat-widget-message-time">{formatChatTime(m.timestamp)}</span>
                  </div>
                )
              })
            )}
          </div>
          <form onSubmit={handleSubmit} className="chat-widget-form">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Type a message..."
              className="chat-widget-input"
              aria-label="Message"
              autoComplete="off"
              maxLength={2000}
            />
            <button type="submit" className="chat-widget-send" aria-label="Send message" disabled={!inputValue.trim()}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </form>
        </div>
      )}
    </>
  )
}
