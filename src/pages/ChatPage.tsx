import { useState, useRef, useEffect, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { useChat, getConversationId } from '../contexts/ChatContext'
import { useEmployees } from '../contexts/EmployeesContext'
import { getPortalUsername } from '../api/client'

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  marketing: 'Marketing',
  finance: 'Finance',
  financial: 'Financial',
  accounting: 'Accounting',
  engineering: 'Engineering',
  technical: 'Technical',
  sale: 'Sale',
  purchasing: 'Purchasing',
  customer: 'Customer',
  supplier: 'Supplier',
  operations: 'Operations',
  ceo: 'CEO',
  'co-ceo': 'CO-CEO',
  'general-manager': 'General Manager',
}

/** All org chat identities (stable order for member list). */
const ALL_USERS = [
  'Admin',
  'General Manager',
  'CEO',
  'CO-CEO',
  'Marketing',
  'Sale',
  'Purchasing',
  'Customer',
  'Supplier',
  'Operations',
  'Finance',
  'Financial',
  'Accounting',
  'Engineering',
  'Technical',
]

type ChatUser = {
  id: string
  label: string
  search: string
}

function humanizeSegment(seg: string): string {
  return seg
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function formatChatTime(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  if (sameDay) return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function getInitials(name: string) {
  if (name === 'General Manager') return 'GM'
  return name.slice(0, 2).toUpperCase() || '?'
}

export default function ChatPage() {
  const location = useLocation()
  const path = location.pathname.replace(/^\//, '').split('/')[0] || 'admin'
  const { employees } = useEmployees()
  const signedUsername = String(getPortalUsername() ?? '').trim()
  const roleLabel = ROLE_LABELS[path] ?? humanizeSegment(path)
  const currentSender = signedUsername || roleLabel
  const currentSenderId = signedUsername
    ? `user:${signedUsername.toLowerCase()}`
    : `role:${roleLabel.toLowerCase()}`

  const { getMessagesForConversation, getLastMessageForConversation, addMessage, getUnreadCount, markConversationRead } = useChat()
  const [inputValue, setInputValue] = useState('')
  const [searchUser, setSearchUser] = useState('')
  const [selectedUser, setSelectedUser] = useState<string | null>(null)
  const [newChatOpen, setNewChatOpen] = useState(false)
  const [newChatQuery, setNewChatQuery] = useState('')
  const [tab, setTab] = useState<'all' | 'unread'>('all')
  const [detailsOpen, setDetailsOpen] = useState<string | null>('info')
  const listRef = useRef<HTMLDivElement>(null)
  const newChatRef = useRef<HTMLDivElement>(null)

  const allChatUsers = useMemo<ChatUser[]>(() => {
    const fromEmployees = employees
      .map((e) => {
        const name = String(e.name ?? '').trim()
        const email = String(e.email ?? '').trim()
        const label = name || email
        if (!label) return null
        const id = email ? `emp:${email.toLowerCase()}` : `emp-id:${e.id}`
        const search = `${label} ${email} ${e.role}`.toLowerCase()
        return { id, label, search }
      })
      .filter((u): u is ChatUser => Boolean(u))

    if (fromEmployees.length > 0) {
      const dedup = new Map<string, ChatUser>()
      for (const u of fromEmployees) {
        if (!dedup.has(u.id)) dedup.set(u.id, u)
      }
      return Array.from(dedup.values())
    }

    return ALL_USERS.map((label) => ({
      id: `role:${label.toLowerCase()}`,
      label,
      search: label.toLowerCase(),
    }))
  }, [employees])

  const otherUsers = useMemo(
    () => allChatUsers.filter((u) => u.id !== currentSenderId && u.label.toLowerCase() !== currentSender.toLowerCase()),
    [allChatUsers, currentSenderId, currentSender],
  )

  const usersWithMessages = useMemo(
    () =>
      otherUsers.filter((user) => {
        const cid = getConversationId(currentSenderId, user.id)
        return Boolean(getLastMessageForConversation(cid))
      }),
    [otherUsers, currentSenderId, getLastMessageForConversation],
  )

  const usersWithUnread = useMemo(
    () =>
      usersWithMessages.filter((user) => getUnreadCount(getConversationId(currentSenderId, user.id), currentSender) > 0),
    [usersWithMessages, currentSenderId, currentSender, getUnreadCount]
  )

  const totalUnread = useMemo(
    () => usersWithUnread.reduce((sum, user) => sum + getUnreadCount(getConversationId(currentSenderId, user.id), currentSender), 0),
    [usersWithUnread, currentSenderId, currentSender, getUnreadCount]
  )

  const filteredUsers = useMemo(() => {
    const base = tab === 'unread' ? usersWithUnread : usersWithMessages
    const q = searchUser.trim().toLowerCase()
    if (!q) return base
    return base.filter((user) => user.search.includes(q))
  }, [tab, usersWithUnread, usersWithMessages, searchUser])

  const newChatUsers = useMemo(() => {
    const q = newChatQuery.trim().toLowerCase()
    if (!q) return otherUsers
    return otherUsers.filter((user) => user.search.includes(q))
  }, [otherUsers, newChatQuery])

  const selectedUserObj = useMemo(
    () => otherUsers.find((u) => u.id === selectedUser) ?? null,
    [otherUsers, selectedUser],
  )
  const conversationId = selectedUser ? getConversationId(currentSenderId, selectedUser) : null
  const messages = useMemo(
    () => (conversationId ? getMessagesForConversation(conversationId) : []),
    [conversationId, getMessagesForConversation]
  )

  useEffect(() => {
    if (conversationId) markConversationRead(conversationId)
  }, [conversationId, markConversationRead])

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages])

  useEffect(() => {
    if (!newChatOpen) return
    const onDown = (ev: MouseEvent) => {
      const target = ev.target
      if (!(target instanceof Node)) return
      if (newChatRef.current && !newChatRef.current.contains(target)) {
        setNewChatOpen(false)
      }
    }
    const onEsc = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setNewChatOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onEsc)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onEsc)
    }
  }, [newChatOpen])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const text = inputValue.trim()
    if (!text || !conversationId) return
    addMessage(conversationId, currentSender, text)
    setInputValue('')
  }

  const lastMessagePreview = (otherUserId: string) => {
    const cid = getConversationId(currentSenderId, otherUserId)
    const last = getLastMessageForConversation(cid)
    if (!last) return 'No messages yet'
    const prefix = last.sender === currentSender ? 'You: ' : ''
    const t = last.text.length > 35 ? last.text.slice(0, 35) + '…' : last.text
    return prefix + t
  }

  const otherUserLabels = useMemo(() => otherUsers.map((u) => u.label), [otherUsers])

  return (
    <div className={`messenger ${selectedUser ? 'messenger-mobile-thread' : ''}`}>
      <aside className="messenger-list" aria-hidden={!!selectedUser}>
        <div className="messenger-list-header">
          <h2 className="messenger-list-title">Chats</h2>
          <div className="messenger-list-actions" ref={newChatRef} style={{ position: 'relative' }}>
            <button
              type="button"
              className="messenger-icon-btn"
              aria-label="New chat"
              aria-expanded={newChatOpen}
              onClick={() => {
                setNewChatOpen((v) => !v)
                setNewChatQuery('')
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>
            </button>
            <button type="button" className="messenger-icon-btn" aria-label="Chat options">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="1.5" /><circle cx="6" cy="12" r="1.5" /><circle cx="18" cy="12" r="1.5" /></svg>
            </button>
            {newChatOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  right: 0,
                  width: 280,
                  maxWidth: 'min(88vw, 280px)',
                  background: 'var(--aa-content-bg)',
                  border: '1px solid var(--aa-content-border)',
                  borderRadius: 10,
                  boxShadow: '0 12px 28px rgba(0,0,0,0.28)',
                  zIndex: 20,
                  padding: '0.625rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <svg className="messenger-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.35-4.35" />
                  </svg>
                  <input
                    type="search"
                    className="messenger-search"
                    placeholder="Search all users"
                    value={newChatQuery}
                    onChange={(e) => setNewChatQuery(e.target.value)}
                    aria-label="Search all users"
                    autoFocus
                  />
                </div>
                <div className="messenger-conversations" style={{ maxHeight: 240 }}>
                  {newChatUsers.length === 0 ? (
                    <p className="messenger-conv-empty">No users found.</p>
                  ) : (
                    newChatUsers.map((user) => (
                      <button
                        key={`new-${user.id}`}
                        type="button"
                        className="messenger-conv-item"
                        onClick={() => {
                          setSelectedUser(user.id)
                          setNewChatOpen(false)
                          setNewChatQuery('')
                        }}
                      >
                        <span className="messenger-conv-avatar" aria-hidden>{getInitials(user.label)}</span>
                        <div className="messenger-conv-body">
                          <span className="messenger-conv-name">{user.label}</span>
                          <span className="messenger-conv-preview">Start conversation</span>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="messenger-search-wrap">
          <svg className="messenger-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
          <input
            type="search"
            className="messenger-search"
            placeholder="Search users"
            value={searchUser}
            onChange={(e) => setSearchUser(e.target.value)}
            aria-label="Search users"
          />
        </div>
        <div className="messenger-tabs">
          <button type="button" className={`messenger-tab ${tab === 'all' ? 'active' : ''}`} onClick={() => setTab('all')}>
            All
          </button>
          <button type="button" className={`messenger-tab ${tab === 'unread' ? 'active' : ''}`} onClick={() => setTab('unread')}>
            Unread
            {totalUnread > 0 && (
              <span className="messenger-tab-badge" aria-label={`${totalUnread} unread`}>
                {totalUnread > 99 ? '99+' : totalUnread}
              </span>
            )}
          </button>
        </div>
        <div className="messenger-conversations">
          {filteredUsers.length === 0 ? (
            <p className="messenger-conv-empty">
              {tab === 'unread'
                ? 'No unread messages.'
                : searchUser.trim()
                  ? 'No chats match your search.'
                  : 'No chats yet. Click + to start a new chat.'}
            </p>
          ) : (
            filteredUsers.map((user) => {
              const cid = getConversationId(currentSenderId, user.id)
              const last = getLastMessageForConversation(cid)
              const isActive = selectedUser === user.id
              const unread = getUnreadCount(cid, currentSender)
              return (
                <button
                  key={user.id}
                  type="button"
                  className={`messenger-conv-item ${isActive ? 'active' : ''} ${unread > 0 ? 'has-unread' : ''}`}
                  onClick={() => setSelectedUser(user.id)}
                  aria-current={isActive ? 'true' : undefined}
                >
                  <span className="messenger-conv-avatar" aria-hidden>{getInitials(user.label)}</span>
                  <div className="messenger-conv-body">
                    <span className="messenger-conv-name">{user.label}</span>
                    <span className="messenger-conv-preview">{lastMessagePreview(user.id)}</span>
                  </div>
                  {unread > 0 && (
                    <span className="messenger-conv-unread" aria-label={`${unread} unread`}>
                      {unread > 99 ? '99+' : unread}
                    </span>
                  )}
                  {last && unread === 0 && (
                    <span className="messenger-conv-time">{formatChatTime(last.timestamp)}</span>
                  )}
                </button>
              )
            })
          )}
        </div>
      </aside>

      <main className="messenger-thread" aria-hidden={!selectedUser}>
        {selectedUser ? (
          <>
            <header className="messenger-thread-header">
              <button type="button" className="messenger-thread-back" onClick={() => setSelectedUser(null)} aria-label="Back to chats">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
              <span className="messenger-thread-avatar" aria-hidden>{getInitials(selectedUserObj?.label ?? '')}</span>
              <span className="messenger-thread-name">{selectedUserObj?.label ?? 'Unknown user'}</span>
              <div className="messenger-thread-actions">
                <button type="button" className="messenger-icon-btn" aria-label="Video call">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 7l-7 5 7 5V7z" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></svg>
                </button>
                <button type="button" className="messenger-icon-btn" aria-label="Voice call">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
                </button>
                <button type="button" className="messenger-icon-btn" aria-label="Chat info">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
                </button>
              </div>
            </header>
            <div ref={listRef} className="messenger-messages">
              {messages.length === 0 ? (
                <p className="messenger-empty">No messages yet. Say hello!</p>
              ) : (
                messages.map((m) => {
                  const isOwn = m.sender === currentSender
                  return (
                    <div key={m.id} className={`messenger-msg ${isOwn ? 'messenger-msg-own' : ''}`}>
                      <span className="messenger-msg-avatar" aria-hidden>{getInitials(m.sender)}</span>
                      <div className="messenger-msg-bubble">
                        <span className="messenger-msg-sender">{m.sender}</span>
                        <p className="messenger-msg-text">{m.text}</p>
                        <span className="messenger-msg-time">{formatChatTime(m.timestamp)}</span>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
            <form onSubmit={handleSubmit} className="messenger-composer">
              <button type="button" className="messenger-composer-btn" aria-label="Emoji">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" /></svg>
              </button>
              <button type="button" className="messenger-composer-btn" aria-label="Attach">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
              </button>
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Aa"
                className="messenger-composer-input"
                aria-label="Message"
                autoComplete="off"
                maxLength={2000}
              />
              <button type="button" className="messenger-composer-btn" aria-label="GIF">GIF</button>
              <button type="submit" className="messenger-composer-send" aria-label="Send" disabled={!inputValue.trim()}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>
              </button>
            </form>
          </>
        ) : (
          <div className="messenger-thread-placeholder">
            <p className="messenger-thread-placeholder-text">Select a user to start chatting</p>
            <p className="messenger-thread-placeholder-hint">Search and choose from the list, or start a new conversation.</p>
          </div>
        )}
      </main>

      <aside className="messenger-details">
        <div className="messenger-details-header">
          <span className="messenger-details-avatar" aria-hidden>
            {selectedUser ? getInitials(selectedUser) : getInitials(currentSender)}
          </span>
        </div>
        <div className="messenger-details-actions">
          <button type="button" className="messenger-details-action">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
            <span>Mute</span>
          </button>
          <button type="button" className="messenger-details-action">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
            <span>Search</span>
          </button>
        </div>
        <nav className="messenger-details-sections">
          <button type="button" className={`messenger-details-section ${detailsOpen === 'info' ? 'open' : ''}`} onClick={() => setDetailsOpen(detailsOpen === 'info' ? null : 'info')}>
            Chat info
          </button>
          <button type="button" className={`messenger-details-section ${detailsOpen === 'members' ? 'open' : ''}`} onClick={() => setDetailsOpen(detailsOpen === 'members' ? null : 'members')}>
            Chat members
          </button>
        </nav>
        {detailsOpen === 'members' && (
          <div className="messenger-details-panel">
            <p className="messenger-details-panel-title">Members</p>
            <ul className="messenger-details-members">
              {[currentSender, ...otherUserLabels].map((user) => (
                <li key={user} className="messenger-details-member">
                  <span className="messenger-conv-avatar">{getInitials(user)}</span>
                  <span>
                    {user}
                    {user === currentSender ? ' (you)' : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {detailsOpen === 'info' && (
          <div className="messenger-details-panel">
            <p className="messenger-details-panel-title">Chat info</p>
            <p className="messenger-details-panel-text">
              You are signed in as <strong>{currentSender}</strong> (from the URL path: <code className="messenger-path-code">/{path}</code>). Existing
              conversations appear on the left. Click <strong>+</strong> to search all users and start a new chat.
            </p>
          </div>
        )}
      </aside>
    </div>
  )
}
