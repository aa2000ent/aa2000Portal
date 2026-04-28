import { useState, useRef, useEffect, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { io, type Socket } from 'socket.io-client'
import { useChat, getConversationId } from '../contexts/ChatContext'
import { useEmployees } from '../contexts/EmployeesContext'
import { apiRequest, getPortalUsername } from '../api/client'
import { getBaseUrl } from '../api/config'

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
  name: string
  role: string
  photoUrl?: string
  search: string
}

type WebhookConversationResponse = {
  success?: boolean
  employeeName?: string
  employeeRole?: string | number
  employeeImage?: string
  data?: Array<string | { employeeID?: string | number; sender?: string; message?: string; timestamp?: string }>
}

const AI_SERVICE_USER: ChatUser = {
  id: 'role:ai-service',
  name: 'AI Service',
  role: 'Assistant',
  search: 'ai service assistant',
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

function getEmployeeIdFromChatUserId(id: string): number | null {
  if (id.startsWith('emp-id:')) {
    const n = Number(id.slice('emp-id:'.length))
    return Number.isFinite(n) && n > 0 ? n : null
  }
  return null
}

function isEmpId(id: string | undefined): boolean {
  return typeof id === 'string' && /^emp-id:\d+$/i.test(id.trim())
}

function toStableNonEmpId(rawId: string | undefined, rawName: string | undefined): string {
  const id = String(rawId ?? '').trim().toLowerCase()
  if (id) return id.startsWith('user:') || id.startsWith('role:') ? id : `user:${id}`
  const name = String(rawName ?? '').trim().toLowerCase()
  if (!name) return AI_SERVICE_USER.id
  return `user:${name.replace(/\s+/g, '-')}`
}

function escapeMetaValue(v: string): string {
  return v.replace(/[|;]/g, ' ').trim()
}

function buildWebhookSenderMeta(params: {
  fromId: string
  fromName: string
  toId: string
  toName: string
}): string {
  return `from=${escapeMetaValue(params.fromId)};fromName=${escapeMetaValue(params.fromName)};to=${escapeMetaValue(params.toId)};toName=${escapeMetaValue(params.toName)}`
}

function parseWebhookSenderMeta(rawSender: string): { fromId?: string; fromName?: string; toId?: string; toName?: string } {
  const out: { fromId?: string; fromName?: string; toId?: string; toName?: string } = {}
  const parts = rawSender.split(';').map((p) => p.trim()).filter(Boolean)
  for (const part of parts) {
    const idx = part.indexOf('=')
    if (idx < 1) continue
    const k = part.slice(0, idx).trim()
    const v = part.slice(idx + 1).trim()
    if (!v) continue
    if (k === 'from') out.fromId = v
    if (k === 'fromName') out.fromName = v
    if (k === 'to') out.toId = v
    if (k === 'toName') out.toName = v
  }
  return out
}

function normalizeParticipantId(rawId: string | undefined, rawName: string | undefined, employees: Array<{ id: number; name?: string; email?: string }>): string | undefined {
  const id = String(rawId ?? '').trim()
  const name = String(rawName ?? '').trim().toLowerCase()
  if (!id && !name) return undefined

  if (id.startsWith('emp-id:')) return id

  if (id.startsWith('emp:')) {
    const email = id.slice('emp:'.length).trim().toLowerCase()
    if (email) {
      const byEmail = employees.find((e) => String(e.email ?? '').trim().toLowerCase() === email)
      if (byEmail?.id) return `emp-id:${byEmail.id}`
    }
  }

  if (id.startsWith('user:')) {
    const userKey = id.slice('user:'.length).trim().toLowerCase()
    if (userKey) {
      const byEmail = employees.find((e) => String(e.email ?? '').trim().toLowerCase() === userKey)
      if (byEmail?.id) return `emp-id:${byEmail.id}`
      const byName = employees.find((e) => String(e.name ?? '').trim().toLowerCase() === userKey)
      if (byName?.id) return `emp-id:${byName.id}`
    }
  }

  if (name) {
    const byName = employees.find((e) => String(e.name ?? '').trim().toLowerCase() === name)
    if (byName?.id) return `emp-id:${byName.id}`
    const byEmail = employees.find((e) => String(e.email ?? '').trim().toLowerCase() === name)
    if (byEmail?.id) return `emp-id:${byEmail.id}`
  }

  return id || undefined
}

function getCanonicalUserId(user: ChatUser, employees: Array<{ id: number; name?: string; email?: string }>): string {
  return normalizeParticipantId(user.id, user.name, employees) || user.id
}

function toImageSrc(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const s = raw.trim()
  if (!s) return undefined
  if (s.startsWith('data:image')) return s
  if (s.startsWith('http://') || s.startsWith('https://')) return s
  return `data:image/jpeg;base64,${s}`
}

function buildMessageId(employeeId: number, timestamp: string, sender: string, text: string): string {
  return `webhook-${employeeId}-${timestamp}-${sender}-${text}`.slice(0, 220)
}

function buildSocketBaseUrl(): string {
  const raw = String(import.meta.env.VITE_SOCKET_BASE_URL ?? import.meta.env.VITE_API_BASE_URL ?? '').trim()
  if (/^https?:\/\//i.test(raw)) return raw.replace(/\/$/, '')
  try {
    const base = getBaseUrl()
    if (/^https?:\/\//i.test(base)) return base.replace(/\/$/, '')
  } catch {
    // ignore
  }
  return window.location.origin
}

export default function ChatPage() {
  const location = useLocation()
  const path = location.pathname.replace(/^\//, '').split('/')[0] || 'admin'
  const { employees } = useEmployees()
  const signedUsername = String(getPortalUsername() ?? '').trim()
  const roleLabel = ROLE_LABELS[path] ?? humanizeSegment(path)
  const currentSender = signedUsername || roleLabel
  const signedKey = signedUsername.toLowerCase()
  const signedEmployee = useMemo(
    () =>
      employees.find((emp) => String(emp.email ?? '').trim().toLowerCase() === signedKey) ??
      employees.find((emp) => String(emp.name ?? '').trim().toLowerCase() === signedKey),
    [employees, signedKey],
  )
  const currentSenderId = signedEmployee?.id
    ? `emp-id:${signedEmployee.id}`
    : signedUsername
      ? `user:${signedUsername.toLowerCase()}`
      : `role:${roleLabel.toLowerCase()}`

  const { getMessagesForConversation, getLastMessageForConversation, upsertMessages, getUnreadCount, markConversationRead } = useChat()
  const [inputValue, setInputValue] = useState('')
  const [searchUser, setSearchUser] = useState('')
  const [selectedUser, setSelectedUser] = useState<string | null>(null)
  const [newChatOpen, setNewChatOpen] = useState(false)
  const [newChatQuery, setNewChatQuery] = useState('')
  const [tab, setTab] = useState<'all' | 'unread'>('all')
  const [webhookUsers, setWebhookUsers] = useState<ChatUser[]>([])
  const listRef = useRef<HTMLDivElement>(null)
  const newChatRef = useRef<HTMLDivElement>(null)
  const initialWebhookLoadedRef = useRef(false)
  const socketRef = useRef<Socket | null>(null)

  const allChatUsers = useMemo<ChatUser[]>(() => {
    const fromEmployees = employees
      .map((e): ChatUser | null => {
        const name = String(e.name ?? '').trim()
        const email = String(e.email ?? '').trim()
        const displayName = name || email
        if (!displayName) return null
        const id = Number(e.id) > 0 ? `emp-id:${e.id}` : (email ? `emp:${email.toLowerCase()}` : `emp-id:${e.id}`)
        const role = String(e.role ?? '').trim() || 'Employee'
        const photoUrl = typeof e.photoUrl === 'string' && e.photoUrl.trim() ? e.photoUrl.trim() : undefined
        const search = `${displayName} ${email} ${role}`.toLowerCase()
        return photoUrl
          ? { id, name: displayName, role, photoUrl, search }
          : { id, name: displayName, role, search }
      })
      .filter((u): u is ChatUser => u !== null)

    const fallbackUsers = ALL_USERS.map((label) => ({
      id: `role:${label.toLowerCase()}`,
      name: label,
      role: label,
      search: label.toLowerCase(),
    }))
    const dedup = new Map<string, ChatUser>()
    for (const u of [...fromEmployees, ...fallbackUsers, ...webhookUsers, AI_SERVICE_USER]) {
      const canonicalId = getCanonicalUserId(u, employees)
      if (!dedup.has(canonicalId)) dedup.set(canonicalId, { ...u, id: canonicalId })
    }
    return Array.from(dedup.values())
  }, [employees, webhookUsers])

  const otherUsers = useMemo(
    () => allChatUsers.filter((u) => u.id !== currentSenderId && u.name.toLowerCase() !== currentSender.toLowerCase()),
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

  useEffect(() => {
    const roleFallbackEmployeeIds = employees
      .map((e) => Number(e.id))
      .filter((id) => Number.isFinite(id) && id > 0)
    const targetEmployeeIds = signedEmployee?.id ? [signedEmployee.id] : roleFallbackEmployeeIds
    if (targetEmployeeIds.length === 0) return

    const fetchConversationHistory = () =>
      Promise.all(
        targetEmployeeIds.map((employeeId) =>
          apiRequest<WebhookConversationResponse>(`/ai-services-conversation-chat/webhook/conversation/${employeeId}`, {
            method: 'GET',
            portal: { suppressFailureLog: true },
          })
            .then((res) => ({
              employeeId,
              employeeName: String(res?.employeeName ?? '').trim(),
              employeeRole: String(res?.employeeRole ?? '').trim(),
              employeeImage: toImageSrc(res?.employeeImage),
              lines: Array.isArray(res?.data) ? res.data : [],
            }))
            .catch(() => ({
              employeeId,
              employeeName: '',
              employeeRole: '',
              employeeImage: undefined as string | undefined,
              lines: [] as string[],
            })),
        ),
      ).then((results) => {
        const discoveredById = new Map<string, ChatUser>()
        const parsed: Array<{ id: string; conversationId: string; sender: string; text: string; timestamp: string }> = []

        for (const result of results) {
          const resultUserId = `emp-id:${result.employeeId}`
          const existingEmp = employees.find((e) => Number(e.id) === Number(result.employeeId))
          const fullName = result.employeeName || String(existingEmp?.name ?? '').trim()
          const role = result.employeeRole || String(existingEmp?.role ?? '').trim() || 'Employee'
          const photo = result.employeeImage || existingEmp?.photoUrl
          if (fullName) {
            discoveredById.set(resultUserId, {
              id: resultUserId,
              name: fullName,
              role,
              photoUrl: photo,
              search: `${fullName} ${role}`.toLowerCase(),
            })
          }

          for (let idx = 0; idx < result.lines.length; idx += 1) {
            const row = result.lines[idx]
            let timestamp = ''
            let rawSender = 'system'
            let text = ''
            if (row && typeof row === 'object' && !Array.isArray(row)) {
              timestamp = String(row.timestamp ?? '').trim()
              rawSender = String(row.sender ?? 'system').trim() || 'system'
              text = String(row.message ?? '').trim()
            } else {
              const raw = String(row ?? '').trim()
              if (!raw) continue
              const m = raw.match(/^\[(.+?)\]\s+EMP_ID:\s*\d+\s*\|\s*SENDER:\s*(.*?)\s*\|\s*MSG:\s*(.*)$/)
              if (!m) continue
              timestamp = m[1]?.trim()
              rawSender = (m[2] || 'system').trim() || 'system'
              text = (m[3] || '').trim()
            }
            if (!timestamp || !text) continue

            const meta = parseWebhookSenderMeta(rawSender)
            const normalizedFromId = normalizeParticipantId(meta.fromId, meta.fromName, employees)
            const normalizedToId = normalizeParticipantId(meta.toId, meta.toName, employees)
            const otherIdCandidate =
              normalizedFromId && normalizedFromId !== currentSenderId
                ? normalizedFromId
                : normalizedToId && normalizedToId !== currentSenderId
                  ? normalizedToId
                  : AI_SERVICE_USER.id
            const otherId = otherIdCandidate === AI_SERVICE_USER.id
              ? AI_SERVICE_USER.id
              : (
                  isEmpId(otherIdCandidate)
                    ? otherIdCandidate
                    : toStableNonEmpId(otherIdCandidate, meta.fromName || meta.toName)
                )
            const otherName =
              normalizedFromId && normalizedFromId !== currentSenderId
                ? meta.fromName || 'Unknown'
                : normalizedToId && normalizedToId !== currentSenderId
                  ? meta.toName || 'Unknown'
                  : 'AI Service'
            if (otherId !== AI_SERVICE_USER.id) {
              const otherEmpId = getEmployeeIdFromChatUserId(otherId)
              const otherFromEmployees = otherEmpId ? employees.find((e) => Number(e.id) === Number(otherEmpId)) : undefined
              const otherFullName = String(otherFromEmployees?.name ?? '').trim() || otherName
              discoveredById.set(otherId, {
                id: otherId,
                name: otherFullName,
                role: String(otherFromEmployees?.role ?? '').trim() || 'Employee',
                photoUrl: otherFromEmployees?.photoUrl,
                search: `${otherFullName} employee`.toLowerCase(),
              })
            }
            const normalizedSenderId = isEmpId(normalizedFromId)
              ? String(normalizedFromId)
              : toStableNonEmpId(normalizedFromId, meta.fromName)
            const conversationId = getConversationId(normalizedSenderId, otherId)
            const senderLabel = normalizedFromId === normalizedSenderId ? currentSender : (meta.fromName || otherName)

            parsed.push({
              id: buildMessageId(result.employeeId, timestamp, rawSender, text),
              conversationId,
              sender: senderLabel,
              text,
              timestamp,
            })
          }
        }

        if (discoveredById.size > 0) {
          setWebhookUsers((prev) => {
            const merged = new Map(prev.map((u) => [u.id, u] as const))
            for (const [id, user] of discoveredById.entries()) {
              if (!merged.has(id)) merged.set(id, user)
            }
            return Array.from(merged.values())
          })
        }
        if (parsed.length > 0) upsertMessages(parsed)
      })

    // First load: trigger GET immediately when Chat page opens.
    if (!initialWebhookLoadedRef.current) {
      initialWebhookLoadedRef.current = true
      void fetchConversationHistory()
    }
    return
  }, [signedEmployee, employees, currentSenderId, currentSender, upsertMessages])

  useEffect(() => {
    const roleFallbackEmployeeIds = employees
      .map((e) => Number(e.id))
      .filter((id) => Number.isFinite(id) && id > 0)
    const targetEmployeeIds = signedEmployee?.id ? [signedEmployee.id] : roleFallbackEmployeeIds
    if (targetEmployeeIds.length === 0) return

    const socketBase = buildSocketBaseUrl()
    const socket = io(socketBase, {
      transports: ['websocket', 'polling'],
      withCredentials: true,
    })
    socketRef.current = socket

    socket.on('connect', () => {
      for (const employeeId of targetEmployeeIds) {
        socket.emit('join', { employeeID: employeeId })
      }
    })

    socket.on('message', (evt: { employeeID?: string | number; sender?: string; message?: string; timestamp?: string }) => {
      const employeeId = Number(evt.employeeID)
      const timestamp = String(evt.timestamp ?? '').trim()
      const rawSender = String(evt.sender ?? 'system').trim() || 'system'
      const text = String(evt.message ?? '').trim()
      if (!Number.isFinite(employeeId) || employeeId < 1 || !timestamp || !text) return

      const meta = parseWebhookSenderMeta(rawSender)
      const normalizedFromId = normalizeParticipantId(meta.fromId, meta.fromName, employees)
      const normalizedToId = normalizeParticipantId(meta.toId, meta.toName, employees)
      const senderId = isEmpId(normalizedFromId)
        ? String(normalizedFromId)
        : toStableNonEmpId(normalizedFromId, meta.fromName)
      const otherId =
        normalizedFromId && normalizedFromId !== senderId
          ? normalizedFromId
          : normalizedToId && normalizedToId !== senderId
            ? normalizedToId
            : `emp-id:${employeeId}`
      const normalizedOtherId = isEmpId(otherId) ? otherId : toStableNonEmpId(otherId, meta.toName)

      const conversationId = getConversationId(senderId, normalizedOtherId)
      const senderLabel = normalizedFromId === senderId ? currentSender : (meta.fromName || 'Employee')
      upsertMessages([
        {
          id: buildMessageId(employeeId, timestamp, rawSender, text),
          conversationId,
          sender: senderLabel,
          text,
          timestamp,
        },
      ])
    })

    return () => {
      for (const employeeId of targetEmployeeIds) {
        socket.emit('leave', { employeeID: employeeId })
      }
      socket.disconnect()
      socketRef.current = null
    }
  }, [employees, signedEmployee, currentSenderId, currentSender, upsertMessages])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const text = inputValue.trim()
    if (!text || !conversationId) return
    setInputValue('')

    // Trigger webhook logging for each sent message.
    // Prefer current signed-in employee id, fallback to selected chat user id.
    const selectedEmployeeId = selectedUser ? getEmployeeIdFromChatUserId(selectedUser) : null
    const firstEmployeeId = employees.find((emp) => Number(emp.id) > 0)?.id
    const webhookEmployeeId = signedEmployee?.id ?? selectedEmployeeId ?? firstEmployeeId

    if (webhookEmployeeId && webhookEmployeeId > 0) {
      const selectedMeta = selectedUserObj ?? AI_SERVICE_USER
      const senderMeta = buildWebhookSenderMeta({
        fromId: currentSenderId,
        fromName: currentSender,
        toId: selectedMeta.id,
        toName: selectedMeta.name,
      })
      void apiRequest(`/ai-services-conversation-chat/webhook/conversation/${webhookEmployeeId}`, {
        method: 'POST',
        body: JSON.stringify({
          sender: senderMeta,
          message: text,
        }),
        portal: { suppressFailureLog: true },
      }).catch(() => {
        // Keep chat UX responsive even if webhook logging fails.
      })
    }
  }

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
                        <span className="messenger-conv-avatar" aria-hidden>
                          {user.photoUrl ? (
                            <img src={user.photoUrl} alt={`${user.name} profile`} className="messenger-avatar-image" />
                          ) : (
                            getInitials(user.name)
                          )}
                        </span>
                        <div className="messenger-conv-body">
                          <span className="messenger-conv-name">{user.name}</span>
                          <span className="messenger-conv-role">{user.role}</span>
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
                  <span className="messenger-conv-avatar" aria-hidden>
                    {user.photoUrl ? (
                      <img src={user.photoUrl} alt={`${user.name} profile`} className="messenger-avatar-image" />
                    ) : (
                      getInitials(user.name)
                    )}
                  </span>
                  <div className="messenger-conv-body">
                    <span className="messenger-conv-name">{user.name}</span>
                    <span className="messenger-conv-role">{user.role}</span>
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
              <span className="messenger-thread-avatar" aria-hidden>
                {selectedUserObj?.photoUrl ? (
                  <img src={selectedUserObj.photoUrl} alt={`${selectedUserObj.name} profile`} className="messenger-avatar-image" />
                ) : (
                  getInitials(selectedUserObj?.name ?? '')
                )}
              </span>
              <div className="messenger-thread-name-wrap">
                <span className="messenger-thread-name">{selectedUserObj?.name ?? 'Unknown user'}</span>
                <span className="messenger-thread-role">{selectedUserObj?.role ?? roleLabel}</span>
              </div>
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

    </div>
  )
}
