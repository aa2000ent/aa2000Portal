import { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { io, type Socket } from 'socket.io-client'
import { useChat, getConversationId } from '../contexts/ChatContext'
import { useEmployees } from '../contexts/EmployeesContext'
import { apiRequest, getPortalAccountId, getPortalEmpId, getPortalUsername } from '../api/client'
import { getBaseUrl } from '../api/config'
import { fetchStories, isStoryVideoUrl, mapStoriesForDashboard } from '../api/stories'

/**
 * Backend (Express) contract — keep in sync with your router:
 *
 * - **POST** `/webhook/conversation/:employeeID` — `:employeeID` is the **receiver** (peer). Body: `senderEmpID`, `senderName`, `receiverName`, `message`.
 *   Server emits Socket.IO event `message` to **`emp_${receiver}`** and **`emp_${sender}`** with payload `{ timestamp, senderEmpID, senderName, senderImage, receiverEmpID, receiverName, receiverImage, message }`.
 * - **GET** `/webhook/conversation/:employeeID` — `:employeeID` is the **user whose inbox/history** you load (logged-in user’s `Emp_ID`). Optional **`?from=<peerEmpId>`** narrows to that 1:1 thread (`from` / `toEmpID` match in the txt log).
 * - Client joins rooms **`emp_${meEmpIdForChat}`** so incoming `message` events match `io.to('emp_…')` on the server.
 *
 * Path prefix here is `VITE_API` → `/ai-services-conversation-chat/...` (see `apiRequest` base URL).
 */
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

type StoryPreview = {
  userId: string
  mediaUrl: string
  title: string
  avatarUrl?: string
  date?: string
}

/** POST /webhook/conversation/:receiverEmpID success body (matches Express handler). */
type ConversationWebhookPostData = {
  timestamp?: string
  message?: string
  senderEmpID?: string | number
  receiverEmpID?: string | number
  senderName?: string
  receiverName?: string
}

type WebhookConversationResponse = {
  success?: boolean
  employeeName?: string
  employeeRole?: string | number
  employeeImage?: string
  data?: Array<string | {
    employeeID?: string | number
    sender?: string
    timestamp?: string
    message?: string
    from?: string
    fromName?: string
    toEmpID?: string
    toName?: string
    senderImage?: string
    receiverImage?: string
  }>
}

const AI_SERVICE_USER: ChatUser = {
  id: 'role:ai-service',
  name: 'AI Service',
  role: 'Assistant',
  search: 'ai service assistant',
}

const STORY_AUTOPLAY_MS = 5000

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

function toConversationFirstName(rawName: string): string {
  const trimmed = String(rawName ?? '').trim()
  if (!trimmed) return 'Unknown'
  const base = trimmed.includes('@') ? trimmed.split('@')[0] : trimmed
  const firstPart = base.split(/[\s._-]+/).filter(Boolean)[0] || base
  if (!firstPart) return 'Unknown'
  return firstPart.charAt(0).toUpperCase() + firstPart.slice(1).toLowerCase()
}

function toCanonicalRoleKey(raw: string): string {
  const key = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
  if (!key) return 'employee'
  if (key === 'sales') return 'sale'
  if (key === 'coo' || key === 'co-ceo') return 'co-ceo'
  if (key === 'gm' || key === 'generalmanager') return 'general-manager'
  return key
}

function formatDeliveryStatus(status: 'sending' | 'sent' | 'delivered' | 'seen' | undefined): string {
  if (status === 'sending') return 'Sending...'
  if (status === 'sent') return 'Sent'
  if (status === 'delivered') return 'Delivered'
  if (status === 'seen') return 'Seen'
  return ''
}

function isWithin24Hours(value?: string): boolean {
  const ts = value ? Date.parse(value) : NaN
  if (!Number.isFinite(ts)) return true
  return Date.now() - ts < 24 * 60 * 60 * 1000
}

function getEmployeeIdFromChatUserId(id: string): number | null {
  if (id.startsWith('emp-id:')) {
    const n = Number(id.slice('emp-id:'.length))
    return Number.isFinite(n) && n > 0 ? n : null
  }
  if (id.startsWith('emp:')) {
    const n = Number(id.slice('emp:'.length))
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

function mergeChatUsers(existing: ChatUser, incoming: ChatUser): ChatUser {
  const existingName = String(existing.name ?? '').trim()
  const incomingName = String(incoming.name ?? '').trim()
  const existingRole = String(existing.role ?? '').trim()
  const incomingRole = String(incoming.role ?? '').trim()

  const pickName = incomingName || existingName || 'Unknown'
  const pickRole = incomingRole || existingRole || 'Employee'
  const pickPhoto = incoming.photoUrl || existing.photoUrl

  return {
    ...existing,
    ...incoming,
    id: existing.id,
    name: pickName,
    role: pickRole,
    photoUrl: pickPhoto,
    search: `${pickName} ${pickRole}`.toLowerCase(),
  }
}

function buildMessageId(senderId: string, receiverId: string, timestamp: string, text: string): string {
  return `webhook-${senderId}->${receiverId}-${timestamp}-${text}`.slice(0, 240)
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

function resolveCurrentSenderEmployeeId(params: {
  signedEmployeeId?: number
  signedAccountId?: string
  currentSenderId: string
  currentSender: string
  employees: Array<{ id: number; name?: string; email?: string; accId?: number | string; role?: string }>
}): number | null {
  if (Number.isFinite(params.signedEmployeeId) && Number(params.signedEmployeeId) > 0) {
    return Number(params.signedEmployeeId)
  }

  const fromCurrentId = getEmployeeIdFromChatUserId(params.currentSenderId)
  if (fromCurrentId && fromCurrentId > 0) return fromCurrentId

  const accId = Number(String(params.signedAccountId ?? '').trim())
  if (Number.isFinite(accId) && accId > 0) {
    const byAccId = params.employees.find((emp) => Number(emp.accId ?? 0) === accId)
    if (byAccId?.id) return Number(byAccId.id)
  }

  const senderKey = String(params.currentSender ?? '').trim().toLowerCase()
  if (senderKey) {
    const byName = params.employees.find((emp) => String(emp.name ?? '').trim().toLowerCase() === senderKey)
    if (byName?.id) return Number(byName.id)

    const byEmail = params.employees.find((emp) => String(emp.email ?? '').trim().toLowerCase() === senderKey)
    if (byEmail?.id) return Number(byEmail.id)
  }

  return null
}

export default function ChatPage() {
  const location = useLocation()
  const path = location.pathname.replace(/^\//, '').split('/')[0] || 'admin'
  const { employees: employeesRaw } = useEmployees()
  const employees = Array.isArray(employeesRaw) ? employeesRaw : []
  const signedUsername = String(getPortalUsername() ?? '').trim()
  const signedAccId = Number(getPortalAccountId() ?? 0)
  const roleLabel = ROLE_LABELS[path] ?? humanizeSegment(path)
  const currentSender = signedUsername || roleLabel
  const signedAccountId = String(getPortalAccountId() ?? '').trim()
  const signedKey = signedUsername.toLowerCase()
  const signedEmployee = useMemo(
    () => {
      const byAccId = signedAccId > 0 ? employees.find((emp) => Number(emp.accId ?? 0) === signedAccId) : undefined
      if (byAccId) return byAccId

      const byEmail = employees.find((emp) => String(emp.email ?? '').trim().toLowerCase() === signedKey)
      if (byEmail) return byEmail

      const byName = employees.find((emp) => String(emp.name ?? '').trim().toLowerCase() === signedKey)
      if (byName) return byName

      const byEmailLocalPart = employees.find((emp) => {
        const email = String(emp.email ?? '').trim().toLowerCase()
        if (!email.includes('@')) return false
        return email.split('@')[0] === signedKey
      })
      if (byEmailLocalPart) return byEmailLocalPart

      const roleKey = roleLabel.trim().toLowerCase()
      const roleMatched = employees.filter((emp) => String(emp.role ?? '').trim().toLowerCase() === roleKey)
      if (roleMatched.length === 1) return roleMatched[0]

      return undefined
    },
    [employees, signedAccId, signedKey, roleLabel],
  )
  const currentSenderId = signedEmployee?.id
    ? `emp-id:${signedEmployee.id}`
    : signedUsername
      ? `user:${signedUsername.toLowerCase()}`
      : `role:${toCanonicalRoleKey(roleLabel)}`
  const currentParticipantId = useMemo(() => {
    const resolvedSenderEmpId = resolveCurrentSenderEmployeeId({
      signedEmployeeId: signedEmployee?.id,
      signedAccountId,
      currentSenderId,
      currentSender,
      employees,
    })
    return resolvedSenderEmpId ? `emp-id:${resolvedSenderEmpId}` : currentSenderId
  }, [signedEmployee?.id, signedAccountId, currentSenderId, currentSender, employees])
  const currentParticipantEmpId = useMemo(() => getEmployeeIdFromChatUserId(currentParticipantId), [currentParticipantId])
  /** Single source for “this browser’s” Emp_ID: must match backend `emp_${id}` rooms + GET /webhook/conversation/:id */
  const meEmpIdForChat = useMemo(() => {
    if (Number.isFinite(currentParticipantEmpId) && (currentParticipantEmpId as number) > 0) {
      return currentParticipantEmpId as number
    }
    const fromSession = getPortalEmpId()
    if (fromSession != null && Number.isFinite(fromSession) && fromSession > 0) return fromSession
    if (signedEmployee?.id && signedEmployee.id > 0) return Number(signedEmployee.id)
    return null
  }, [currentParticipantEmpId, signedEmployee?.id])
  const currentDisplayName = useMemo(() => {
    const signedName = String(signedEmployee?.name ?? '').trim()
    if (signedName) return signedName
    const byParticipantId = currentParticipantEmpId
      ? String(employees.find((e) => Number(e.id) === currentParticipantEmpId)?.name ?? '').trim()
      : ''
    if (byParticipantId) return byParticipantId
    return currentSender
  }, [signedEmployee?.name, currentParticipantEmpId, employees, currentSender])
  const currentPhotoUrl = useMemo(() => {
    const signedPhoto = String(signedEmployee?.photoUrl ?? '').trim()
    if (signedPhoto) return signedPhoto
    const byParticipantId = currentParticipantEmpId
      ? String(employees.find((e) => Number(e.id) === currentParticipantEmpId)?.photoUrl ?? '').trim()
      : ''
    return byParticipantId || undefined
  }, [signedEmployee?.photoUrl, currentParticipantEmpId, employees])

  const {
    getMessagesForConversation,
    getLastMessageForConversation,
    upsertMessages,
    addMessage,
    setMessageStatus,
    markLatestOwnMessageSeen,
    getUnreadCount,
    markConversationRead,
  } = useChat()
  const [inputValue, setInputValue] = useState('')
  const [searchUser, setSearchUser] = useState('')
  const [selectedUser, setSelectedUser] = useState<string | null>(null)
  const [activeMetaMessageId, setActiveMetaMessageId] = useState<string | null>(null)
  const [newChatOpen, setNewChatOpen] = useState(false)
  const [newChatQuery, setNewChatQuery] = useState('')
  const [tab, setTab] = useState<'all' | 'unread'>('all')
  const [webhookUsers, setWebhookUsers] = useState<ChatUser[]>([])
  const [storyOwnerIds, setStoryOwnerIds] = useState<Set<string>>(new Set())
  const [storyPreviewByUserId, setStoryPreviewByUserId] = useState<Record<string, string>>({})
  const [storyItemByUserId, setStoryItemByUserId] = useState<Record<string, StoryPreview>>({})
  const [storyPreviewCandidatesByUserId, setStoryPreviewCandidatesByUserId] = useState<Record<string, string[]>>({})
  const [storyPreviewAttemptByUserId, setStoryPreviewAttemptByUserId] = useState<Record<string, number>>({})
  const [chatStoryOwners, setChatStoryOwners] = useState<StoryPreview[]>([])
  const [chatStoriesByOwner, setChatStoriesByOwner] = useState<Record<string, StoryPreview[]>>({})
  const [openStoryOwnerId, setOpenStoryOwnerId] = useState<string | null>(null)
  const [openStorySubIndex, setOpenStorySubIndex] = useState(0)
  const [isStoryPaused, setIsStoryPaused] = useState(false)
  const [storyProgressMs, setStoryProgressMs] = useState(0)
  const storyFrameRef = useRef<number | null>(null)
  const storyLastTickRef = useRef<number | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const newChatRef = useRef<HTMLDivElement>(null)
  const socketRef = useRef<Socket | null>(null)
  const [socketConnected, setSocketConnected] = useState(false)
  const lastSubmitRef = useRef<{ signature: string; at: number } | null>(null)
  const conversationItemRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const previousConversationTopsRef = useRef<Map<string, number>>(new Map())

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
      id: `role:${toCanonicalRoleKey(label)}`,
      name: label,
      role: label,
      search: label.toLowerCase(),
    }))
    const dedup = new Map<string, ChatUser>()
    for (const u of [...fromEmployees, ...fallbackUsers, ...webhookUsers, AI_SERVICE_USER]) {
      const canonicalId = getCanonicalUserId(u, employees)
      const normalized = { ...u, id: canonicalId }
      const prev = dedup.get(canonicalId)
      if (!prev) {
        dedup.set(canonicalId, normalized)
      } else {
        dedup.set(canonicalId, mergeChatUsers(prev, normalized))
      }
    }
    return Array.from(dedup.values())
  }, [employees, webhookUsers])

  const otherUsers = useMemo(
    () => allChatUsers.filter((u) => u.id !== currentParticipantId && u.name.toLowerCase() !== currentSender.toLowerCase()),
    [allChatUsers, currentParticipantId, currentSender],
  )

  const usersWithMessages = useMemo(
    () => {
      const list = otherUsers.filter((user) => {
        const cid = getConversationId(currentParticipantId, user.id)
        return Boolean(getLastMessageForConversation(cid))
      })
      list.sort((a, b) => {
        const cidA = getConversationId(currentParticipantId, a.id)
        const cidB = getConversationId(currentParticipantId, b.id)
        const tsA = Date.parse(String(getLastMessageForConversation(cidA)?.timestamp ?? ''))
        const tsB = Date.parse(String(getLastMessageForConversation(cidB)?.timestamp ?? ''))
        const safeA = Number.isFinite(tsA) ? tsA : 0
        const safeB = Number.isFinite(tsB) ? tsB : 0
        return safeB - safeA
      })
      return list
    },
    [otherUsers, currentParticipantId, getLastMessageForConversation],
  )

  const usersWithUnread = useMemo(
    () =>
      usersWithMessages.filter((user) => getUnreadCount(getConversationId(currentParticipantId, user.id), [currentSender, currentDisplayName]) > 0),
    [usersWithMessages, currentParticipantId, currentSender, currentDisplayName, getUnreadCount]
  )

  const totalUnread = useMemo(
    () => usersWithUnread.reduce((sum, user) => sum + getUnreadCount(getConversationId(currentParticipantId, user.id), [currentSender, currentDisplayName]), 0),
    [usersWithUnread, currentParticipantId, currentSender, currentDisplayName, getUnreadCount]
  )

  const filteredUsers = useMemo(() => {
    const base = tab === 'unread' ? usersWithUnread : usersWithMessages
    const q = searchUser.trim().toLowerCase()
    if (!q) return base
    return base.filter((user) => user.search.includes(q))
  }, [tab, usersWithUnread, usersWithMessages, searchUser])

  useEffect(() => {
    // Re-attempt from first candidate when story preview data refreshes.
    setStoryPreviewAttemptByUserId({})
  }, [storyPreviewByUserId, storyPreviewCandidatesByUserId])

  const newChatUsers = useMemo(() => {
    const q = newChatQuery.trim().toLowerCase()
    if (!q) return otherUsers
    return otherUsers.filter((user) => user.search.includes(q))
  }, [otherUsers, newChatQuery])

  const selectedUserObj = useMemo(
    () => otherUsers.find((u) => u.id === selectedUser) ?? null,
    [otherUsers, selectedUser],
  )
  const conversationId = selectedUser ? getConversationId(currentParticipantId, selectedUser) : null
  const messages = useMemo(
    () => (conversationId ? getMessagesForConversation(conversationId) : []),
    [conversationId, getMessagesForConversation]
  )

  useEffect(() => {
    if (conversationId) markConversationRead(conversationId)
  }, [conversationId, messages, markConversationRead])

  useEffect(() => {
    setActiveMetaMessageId(null)
  }, [conversationId])

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages])

  useLayoutEffect(() => {
    const nextTops = new Map<string, number>()
    for (const user of filteredUsers) {
      const el = conversationItemRefs.current[user.id]
      if (!el) continue
      const top = el.getBoundingClientRect().top
      nextTops.set(user.id, top)
      const prevTop = previousConversationTopsRef.current.get(user.id)
      if (typeof prevTop === 'number') {
        const deltaY = prevTop - top
        if (Math.abs(deltaY) > 1) {
          el.animate(
            [{ transform: `translateY(${deltaY}px)` }, { transform: 'translateY(0)' }],
            { duration: 220, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
          )
        }
      }
    }
    previousConversationTopsRef.current = nextTops
  }, [filteredUsers])

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

  const ownerStories = openStoryOwnerId ? (chatStoriesByOwner[openStoryOwnerId] ?? []) : []
  const safeSubIndex = ownerStories.length > 0 ? Math.min(Math.max(openStorySubIndex, 0), ownerStories.length - 1) : 0
  const openStoryPreview = ownerStories[safeSubIndex] ?? null
  const moveOwner = (delta: number) => {
    if (chatStoryOwners.length === 0 || !openStoryOwnerId) return
    const currentIdx = chatStoryOwners.findIndex((x) => x.userId === openStoryOwnerId)
    if (currentIdx < 0) return
    const nextOwnerIdx = (currentIdx + delta + chatStoryOwners.length) % chatStoryOwners.length
    const nextOwner = chatStoryOwners[nextOwnerIdx]
    if (!nextOwner) return
    setOpenStoryOwnerId(nextOwner.userId)
    setOpenStorySubIndex(0)
  }
  const goPrevStoryPreview = () => {
    if (ownerStories.length === 0) return
    if (ownerStories.length === 1) {
      moveOwner(-1)
      setStoryProgressMs(0)
      return
    }
    setOpenStorySubIndex((prev) => (prev - 1 + ownerStories.length) % ownerStories.length)
    setStoryProgressMs(0)
  }
  const goNextStoryPreview = () => {
    if (ownerStories.length === 0) return
    if (ownerStories.length === 1) {
      moveOwner(1)
      setStoryProgressMs(0)
      return
    }
    setOpenStorySubIndex((prev) => (prev + 1) % ownerStories.length)
    setStoryProgressMs(0)
  }

  useEffect(() => {
    if (!openStoryOwnerId) return
    const onEsc = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setOpenStoryOwnerId(null)
    }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [openStoryOwnerId])

  useEffect(() => {
    if (!openStoryPreview) return
    setStoryProgressMs(0)
  }, [openStoryOwnerId, safeSubIndex, openStoryPreview?.mediaUrl])

  useEffect(() => {
    if (!openStoryPreview || isStoryPaused) return
    storyLastTickRef.current = null
    const step = (ts: number) => {
      const last = storyLastTickRef.current ?? ts
      const delta = ts - last
      storyLastTickRef.current = ts
      setStoryProgressMs((prev) => {
        const next = prev + Math.max(0, delta)
        if (next >= STORY_AUTOPLAY_MS) {
          // Move forward on next tick to avoid render thrash.
          window.setTimeout(() => {
            goNextStoryPreview()
          }, 0)
          return 0
        }
        return next
      })
      storyFrameRef.current = window.requestAnimationFrame(step)
    }
    storyFrameRef.current = window.requestAnimationFrame(step)
    return () => {
      if (storyFrameRef.current != null) {
        window.cancelAnimationFrame(storyFrameRef.current)
        storyFrameRef.current = null
      }
      storyLastTickRef.current = null
    }
  }, [openStoryPreview, isStoryPaused, goNextStoryPreview])

  useEffect(() => {
    let cancelled = false
    const loadStoryOwners = async () => {
      try {
        const rawStories = await fetchStories()
        if (cancelled) return
        const authorSource = employees.map((e) => ({
          id: Number(e.id ?? 0),
          accId: Number.isFinite(Number(e.accId ?? 0)) && Number(e.accId ?? 0) > 0 ? Number(e.accId ?? 0) : undefined,
          name: String(e.name ?? '').trim() || `Employee ${Number(e.id ?? 0)}`,
          photoUrl: typeof e.photoUrl === 'string' ? e.photoUrl : undefined,
        }))
        const mapped = mapStoriesForDashboard(rawStories as unknown[], authorSource)
        const active = mapped.filter((s) => isWithin24Hours(s.date))
        const next = new Set<string>()
        const previewMap: Record<string, string> = {}
        const previewCandidatesMap: Record<string, string[]> = {}
        const itemMap: Record<string, StoryPreview> = {}
        const groupedByOwner: Record<string, StoryPreview[]> = {}
        for (const item of active) {
          const mediaCandidates = Array.from(new Set(
            (Array.isArray(item.mediaCandidates) ? item.mediaCandidates : [])
              .map((x) => String(x ?? '').trim())
              .filter((x) => x.length > 0 && !isStoryVideoUrl(x)),
          ))
          const media = mediaCandidates[0] || String(item.mediaUrl ?? '').trim()
          const hasUsablePreview = media && !isStoryVideoUrl(media)
          const directOwnerKey = Number.isFinite(item.employeeId) && item.employeeId > 0 ? `emp-id:${item.employeeId}` : ''
          const ownerByAcc = Number.isFinite(item.accId) && item.accId > 0
            ? employees.find((e) => Number(e.accId ?? 0) === item.accId)
            : undefined
          const ownerKey = ownerByAcc?.id ? `emp-id:${ownerByAcc.id}` : directOwnerKey
          const preview: StoryPreview = {
            userId: ownerKey,
            mediaUrl: media,
            title: item.title || 'Story',
            avatarUrl: item.authorPhotoUrl,
            date: item.date,
          }

          if (hasUsablePreview) {
            if (!groupedByOwner[ownerKey]) groupedByOwner[ownerKey] = []
            groupedByOwner[ownerKey].push(preview)
          }
          if (Number.isFinite(item.employeeId) && item.employeeId > 0) {
            const key = `emp-id:${item.employeeId}`
            next.add(key)
            if (hasUsablePreview && !previewMap[key]) {
              previewMap[key] = media
              previewCandidatesMap[key] = mediaCandidates.length > 0 ? mediaCandidates : [media]
              itemMap[key] = { userId: key, mediaUrl: media, title: item.title || 'Story', avatarUrl: item.authorPhotoUrl, date: item.date }
            }
          }
          if (Number.isFinite(item.accId) && item.accId > 0) {
            const byAcc = employees.find((e) => Number(e.accId ?? 0) === item.accId)
            if (byAcc?.id) {
              const key = `emp-id:${byAcc.id}`
              next.add(key)
              if (hasUsablePreview && !previewMap[key]) {
                previewMap[key] = media
                previewCandidatesMap[key] = mediaCandidates.length > 0 ? mediaCandidates : [media]
                itemMap[key] = { userId: key, mediaUrl: media, title: item.title || 'Story', avatarUrl: item.authorPhotoUrl, date: item.date }
              }
            }
          }
        }
        for (const key of Object.keys(groupedByOwner)) {
          groupedByOwner[key].sort((a, b) => {
            const at = Date.parse(String(a.date ?? ''))
            const bt = Date.parse(String(b.date ?? ''))
            const sa = Number.isFinite(at) ? at : 0
            const sb = Number.isFinite(bt) ? bt : 0
            return sb - sa
          })
        }
        const ownerList = Object.values(groupedByOwner)
          .map((stories) => stories[0])
          .filter((x): x is StoryPreview => Boolean(x))
          .sort((a, b) => {
            const at = Date.parse(String(a.date ?? ''))
            const bt = Date.parse(String(b.date ?? ''))
            const sa = Number.isFinite(at) ? at : 0
            const sb = Number.isFinite(bt) ? bt : 0
            return sb - sa
          })
        setStoryOwnerIds(next)
        setStoryPreviewByUserId(previewMap)
        setStoryPreviewCandidatesByUserId(previewCandidatesMap)
        setStoryItemByUserId(itemMap)
        setChatStoriesByOwner(groupedByOwner)
        setChatStoryOwners(ownerList)
      } catch {
        // Ignore story indicator failures in chat list.
      }
    }

    void loadStoryOwners()
    const timer = window.setInterval(() => {
      void loadStoryOwners()
    }, 60_000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [employees])

  useEffect(() => {
    // Only poll the logged-in employee conversation endpoint.
    // When a thread is open, pass ?from=<peerEmpId> (matches backend) for a smaller payload + faster sync.
    const targetEmployeeIds = meEmpIdForChat && meEmpIdForChat > 0 ? [meEmpIdForChat] : []
    if (targetEmployeeIds.length === 0) return

    const selectedPeerEmpId = selectedUser ? getEmployeeIdFromChatUserId(selectedUser) : null
    const fromQuery =
      selectedPeerEmpId && selectedPeerEmpId > 0
        ? `?from=${encodeURIComponent(String(selectedPeerEmpId))}`
        : ''

    const fetchConversationHistory = () =>
      Promise.all(
        targetEmployeeIds.map((employeeId) =>
          apiRequest<WebhookConversationResponse>(`/ai-services-conversation-chat/webhook/conversation/${employeeId}${fromQuery}`, {
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
        const parsed: Array<{ id: string; conversationId: string; sender: string; text: string; timestamp: string; status?: 'delivered' }> = []

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
            let parsedFromId = ''
            let parsedFromName = ''
            let parsedToId = ''
            let parsedToName = ''
            let parsedSenderImage: string | undefined
            let parsedReceiverImage: string | undefined
            if (row && typeof row === 'object' && !Array.isArray(row)) {
              timestamp = String(row.timestamp ?? '').trim()
              const structuredRow = row as Record<string, unknown>
              const fromRaw = String(structuredRow.from ?? structuredRow.senderEmpID ?? '').trim()
              const fromNameRaw = String(structuredRow.fromName ?? structuredRow.senderName ?? '').trim()
              const toRaw = String(structuredRow.toEmpID ?? structuredRow.receiverEmpID ?? '').trim()
              const toNameRaw = String(structuredRow.toName ?? structuredRow.receiverName ?? '').trim()
              rawSender =
                fromRaw || fromNameRaw || toRaw || toNameRaw
                  ? buildWebhookSenderMeta({
                      fromId: fromRaw ? (fromRaw.startsWith('emp-id:') ? fromRaw : `emp-id:${fromRaw}`) : 'system',
                      fromName: fromNameRaw || 'Unknown',
                      toId: toRaw ? (toRaw.startsWith('emp-id:') ? toRaw : `emp-id:${toRaw}`) : resultUserId,
                      toName: toNameRaw || result.employeeName || 'Unknown',
                    })
                  : String(structuredRow.sender ?? 'system').trim() || 'system'
              text = String(row.message ?? '').trim()
              const directFrom = String(row.from ?? '').trim()
              const directFromName = String(row.fromName ?? '').trim()
              const directTo = String(row.toEmpID ?? '').trim()
              const directToName = String(row.toName ?? '').trim()
              parsedSenderImage = toImageSrc(row.senderImage)
              parsedReceiverImage = toImageSrc(row.receiverImage)
              if (directFrom || directTo) {
                parsedFromId = directFrom.startsWith('emp-id:') ? directFrom : (directFrom ? `emp-id:${directFrom}` : '')
                parsedFromName = directFromName
                parsedToId = directTo.startsWith('emp-id:') ? directTo : (directTo ? `emp-id:${directTo}` : '')
                parsedToName = directToName
                rawSender = `from=${parsedFromId};fromName=${parsedFromName};to=${parsedToId};toName=${parsedToName}`
              } else {
                rawSender = String(row.sender ?? 'system').trim() || 'system'
              }
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
            const normalizedFromId = normalizeParticipantId(parsedFromId || meta.fromId, parsedFromName || meta.fromName, employees)
            const normalizedToId = normalizeParticipantId(parsedToId || meta.toId, parsedToName || meta.toName, employees)
            const participantA = isEmpId(normalizedFromId)
              ? String(normalizedFromId)
              : toStableNonEmpId(normalizedFromId, parsedFromName || meta.fromName)
            const participantB = isEmpId(normalizedToId)
              ? String(normalizedToId)
              : toStableNonEmpId(normalizedToId, parsedToName || meta.toName)
            const otherIdCandidate =
              participantA && participantA !== currentParticipantId
                ? participantA
                : participantB && participantB !== currentParticipantId
                  ? participantB
                  : AI_SERVICE_USER.id
            const otherId = otherIdCandidate === AI_SERVICE_USER.id
              ? AI_SERVICE_USER.id
              : (
                  isEmpId(otherIdCandidate)
                    ? otherIdCandidate
                    : toStableNonEmpId(otherIdCandidate, meta.fromName || meta.toName)
                )
            const otherName =
              normalizedFromId && normalizedFromId !== currentParticipantId
                ? parsedFromName || meta.fromName || 'Unknown'
                : normalizedToId && normalizedToId !== currentParticipantId
                  ? parsedToName || meta.toName || 'Unknown'
                  : 'AI Service'
            if (otherId !== AI_SERVICE_USER.id) {
              const otherEmpId = getEmployeeIdFromChatUserId(otherId)
              const otherFromEmployees = otherEmpId ? employees.find((e) => Number(e.id) === Number(otherEmpId)) : undefined
              const otherFullName = String(otherFromEmployees?.name ?? '').trim() || otherName
              const otherPhotoFromThread =
                normalizedFromId && normalizedFromId !== currentParticipantId
                  ? parsedSenderImage
                  : normalizedToId && normalizedToId !== currentParticipantId
                    ? parsedReceiverImage
                    : undefined
              discoveredById.set(otherId, {
                id: otherId,
                name: otherFullName,
                role: String(otherFromEmployees?.role ?? '').trim() || 'Employee',
                photoUrl: otherPhotoFromThread || otherFromEmployees?.photoUrl,
                search: `${otherFullName} employee`.toLowerCase(),
              })
            }
            if (normalizedFromId && isEmpId(normalizedFromId)) {
              const fromEmpId = getEmployeeIdFromChatUserId(normalizedFromId)
              if (fromEmpId) {
                const fromEmp = employees.find((e) => Number(e.id) === fromEmpId)
                const fromNameResolved = String(fromEmp?.name ?? '').trim() || parsedFromName || meta.fromName || `Employee ${fromEmpId}`
                discoveredById.set(normalizedFromId, {
                  id: normalizedFromId,
                  name: fromNameResolved,
                  role: String(fromEmp?.role ?? '').trim() || 'Employee',
                  photoUrl: parsedSenderImage || fromEmp?.photoUrl,
                  search: `${fromNameResolved} employee`.toLowerCase(),
                })
              }
            }

            if (normalizedToId && isEmpId(normalizedToId)) {
              const toEmpId = getEmployeeIdFromChatUserId(normalizedToId)
              if (toEmpId) {
                const toEmp = employees.find((e) => Number(e.id) === toEmpId)
                const toNameResolved = String(toEmp?.name ?? '').trim() || parsedToName || meta.toName || `Employee ${toEmpId}`
                discoveredById.set(normalizedToId, {
                  id: normalizedToId,
                  name: toNameResolved,
                  role: String(toEmp?.role ?? '').trim() || 'Employee',
                  photoUrl: parsedReceiverImage || toEmp?.photoUrl,
                  search: `${toNameResolved} employee`.toLowerCase(),
                })
              }
            }
            const conversationId = getConversationId(participantA, participantB)
            const fromName = String(parsedFromName || meta.fromName || '').trim()
            const fromKey = fromName.toLowerCase()
            const currentSenderKey = currentSender.toLowerCase()
            const currentDisplayKey = currentDisplayName.toLowerCase()
            const fromFirst = toConversationFirstName(fromName).toLowerCase()
            const currentFirst = toConversationFirstName(currentDisplayName).toLowerCase()
            const currentRoleId = `role:${toCanonicalRoleKey(currentSender)}`
            const senderIsCurrentById =
              participantA === currentParticipantId ||
              participantA === currentSenderId ||
              participantA === currentRoleId
            const senderIsCurrentByName =
              fromKey === currentSenderKey ||
              fromKey === currentDisplayKey ||
              fromFirst === currentFirst
            const isOwnMessage =
              senderIsCurrentById || senderIsCurrentByName
            const senderLabel = isOwnMessage ? currentDisplayName : (fromName || otherName)

            parsed.push({
              id: buildMessageId(participantA, participantB, timestamp, text),
              conversationId,
              sender: senderLabel,
              text,
              timestamp,
              status: senderLabel === currentSender ? 'delivered' : undefined,
            })
          }
        }

        if (discoveredById.size > 0) {
          setWebhookUsers((prev) => {
            const merged = new Map(prev.map((u) => [u.id, u] as const))
            for (const [id, user] of discoveredById.entries()) {
              const existing = merged.get(id)
              if (!existing) {
                merged.set(id, user)
              } else {
                merged.set(id, mergeChatUsers(existing, user))
              }
            }
            return Array.from(merged.values())
          })
        }
        if (parsed.length > 0) upsertMessages(parsed)
      })

    let timer: number | null = null
    const runSync = () => {
      void fetchConversationHistory()
    }

    // Immediate sync on mount and periodic sync to ensure cross-user delivery
    // even if websocket events are dropped/mismatched.
    runSync()
    // Open thread: poll often — many users “can send but not receive” when WS is flaky but still “connected”.
    // List view: slow down when socket is up to save traffic.
    const pollMs = fromQuery ? 4000 : socketConnected ? 45_000 : 8000
    timer = window.setInterval(runSync, pollMs)

    return () => {
      if (timer != null) window.clearInterval(timer)
    }
  }, [
    meEmpIdForChat,
    employees,
    currentParticipantId,
    currentSender,
    currentDisplayName,
    upsertMessages,
    selectedUser,
    socketConnected,
  ])

  useEffect(() => {
    const roleFallbackEmployeeIds = employees
      .map((e) => Number(e.id))
      .filter((id) => Number.isFinite(id) && id > 0)
    // Join the same Emp_ID as GET /conversation/:id — not only signedEmployee (list can disagree with session/login).
    const targetEmployeeIds =
      meEmpIdForChat && meEmpIdForChat > 0
        ? [meEmpIdForChat]
        : signedEmployee?.id
          ? [signedEmployee.id]
          : roleFallbackEmployeeIds
    if (targetEmployeeIds.length === 0) return

    const socketBase = buildSocketBaseUrl()
    const socket = io(socketBase, {
      transports: ['websocket', 'polling'],
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: 20,
      reconnectionDelay: 800,
    })
    socketRef.current = socket

    socket.on('connect', () => {
      setSocketConnected(true)
      for (const employeeId of targetEmployeeIds) {
        // Support multiple backend room-join conventions.
        socket.emit('join', { employeeID: employeeId })
        socket.emit('join', { employeeId })
        socket.emit('join', employeeId)
        socket.emit('joinRoom', { employeeID: employeeId })
        socket.emit('joinRoom', { employeeId })
        socket.emit('joinRoom', employeeId)
        socket.emit('join_room', { employeeID: employeeId })
        socket.emit('join_room', { employeeId })
        socket.emit('join_room', employeeId)
        socket.emit('join', `emp_${employeeId}`)
        socket.emit('joinRoom', `emp_${employeeId}`)
      }
    })

    socket.on('disconnect', () => {
      setSocketConnected(false)
    })

    socket.on('connect_error', () => {
      setSocketConnected(false)
    })

    const onIncomingMessage = (evt: {
      employeeID?: string | number
      employeeId?: string | number
      sender?: string
      senderEmpID?: string | number
      senderName?: string
      senderImage?: string
      receiverEmpID?: string | number
      receiverEmpId?: string | number
      receiverName?: string
      receiverImage?: string
      text?: string
      content?: string
      message?: string
      timestamp?: string
      createdAt?: string
      date?: string
    }) => {
      // Backend contract: POST echo + io.emit use senderEmpID, receiverEmpID, message, timestamp (no legacy "sender" string).
      const receiverEmpId = Number(evt.receiverEmpID ?? evt.receiverEmpId ?? evt.employeeID ?? evt.employeeId)
      const senderEmpId = Number(evt.senderEmpID)
      const timestamp = String(evt.timestamp ?? evt.createdAt ?? evt.date ?? '').trim()
      const text = String(evt.message ?? evt.text ?? evt.content ?? '').trim()
      if (!timestamp || !text) return
      if (!(Number.isFinite(senderEmpId) && senderEmpId > 0) && !(Number.isFinite(receiverEmpId) && receiverEmpId > 0)) return

      const rawSender = String(evt.sender ?? '').trim() || (
        Number.isFinite(senderEmpId) && senderEmpId > 0
          ? buildWebhookSenderMeta({
              fromId: `emp-id:${senderEmpId}`,
              fromName: String(evt.senderName ?? 'Unknown').trim() || 'Unknown',
              toId: Number.isFinite(receiverEmpId) && receiverEmpId > 0 ? `emp-id:${receiverEmpId}` : currentParticipantId,
              toName: String(evt.receiverName ?? 'Unknown').trim() || 'Unknown',
            })
          : 'system'
      )

      const meta = parseWebhookSenderMeta(rawSender)
      const fallbackFromId =
        Number.isFinite(senderEmpId) && senderEmpId > 0
          ? `emp-id:${senderEmpId}`
          : undefined
      const fallbackToId =
        Number.isFinite(receiverEmpId) && receiverEmpId > 0
          ? `emp-id:${receiverEmpId}`
          : undefined
      const fallbackFromName = String(evt.senderName ?? evt.sender ?? '').trim()
      const fallbackToName = String(evt.receiverName ?? '').trim()
      const normalizedFromId = normalizeParticipantId(meta.fromId || fallbackFromId, meta.fromName || fallbackFromName, employees)
      const normalizedToId = normalizeParticipantId(meta.toId || fallbackToId, meta.toName || fallbackToName, employees)

      const selfId = currentParticipantId
      let peerParticipantId: string | undefined
      if (
        Number.isFinite(senderEmpId) &&
        senderEmpId > 0 &&
        Number.isFinite(receiverEmpId) &&
        receiverEmpId > 0
      ) {
        const s = `emp-id:${senderEmpId}`
        const r = `emp-id:${receiverEmpId}`
        if (s === selfId) peerParticipantId = r
        else if (r === selfId) peerParticipantId = s
        else peerParticipantId = r
      } else {
        const otherId =
          normalizedFromId && normalizedFromId !== selfId
            ? normalizedFromId
            : normalizedToId && normalizedToId !== selfId
              ? normalizedToId
              : fallbackFromId && fallbackFromId !== selfId
                ? fallbackFromId
                : fallbackToId
        peerParticipantId = otherId
      }

      const normalizedOtherId = peerParticipantId
        ? isEmpId(peerParticipantId)
          ? peerParticipantId
          : toStableNonEmpId(peerParticipantId, meta.toName || meta.fromName)
        : AI_SERVICE_USER.id

      // Must match GET/poll conversation keys (participant id resolution), not only currentSenderId.
      const conversationId = getConversationId(currentParticipantId, normalizedOtherId)
      const isOwnSocket =
        (Number.isFinite(senderEmpId) && senderEmpId > 0 && senderEmpId === currentParticipantEmpId) ||
        normalizedFromId === selfId
      const senderLabel = isOwnSocket ? currentDisplayName : String(meta.fromName || evt.senderName || 'Employee').trim() || 'Employee'
      const deliveryStatus = isOwnSocket ? 'delivered' : undefined
      upsertMessages([
        {
          id: buildMessageId(currentParticipantId, normalizedOtherId, timestamp, text),
          conversationId,
          sender: senderLabel,
          text,
          timestamp,
          status: deliveryStatus,
        },
      ])
      const peerEmpId =
        Number.isFinite(senderEmpId) &&
        senderEmpId > 0 &&
        Number.isFinite(receiverEmpId) &&
        receiverEmpId > 0
          ? senderEmpId === currentParticipantEmpId
            ? receiverEmpId
            : receiverEmpId === currentParticipantEmpId
              ? senderEmpId
              : senderEmpId
          : getEmployeeIdFromChatUserId(normalizedOtherId) ?? 0
      const peerId = peerEmpId > 0 ? `emp-id:${peerEmpId}` : normalizedOtherId
      const peerFromEmployees = peerEmpId > 0 ? employees.find((e) => Number(e.id) === peerEmpId) : undefined
      const peerImageFromSocket =
        Number.isFinite(senderEmpId) &&
        senderEmpId > 0 &&
        Number.isFinite(receiverEmpId) &&
        receiverEmpId > 0
          ? senderEmpId === currentParticipantEmpId
            ? toImageSrc(evt.receiverImage)
            : toImageSrc(evt.senderImage)
          : undefined
      const peerName =
        String(peerFromEmployees?.name ?? '').trim() ||
        (peerEmpId === senderEmpId ? String(evt.senderName ?? '').trim() : String(evt.receiverName ?? '').trim()) ||
        (peerEmpId > 0 ? `Employee ${peerEmpId}` : String(meta.fromName || meta.toName || 'Unknown').trim())
      if (peerId && peerId !== currentParticipantId) {
        setWebhookUsers((prev) => {
          const existing = prev.find((u) => u.id === peerId)
          if (existing) {
            if (!existing.photoUrl && peerImageFromSocket) {
              return prev.map((u) => (u.id === peerId ? { ...u, photoUrl: peerImageFromSocket } : u))
            }
            return prev
          }
          return [
            ...prev,
            {
              id: peerId,
              name: peerName,
              role: String(peerFromEmployees?.role ?? '').trim() || 'Employee',
              photoUrl: peerImageFromSocket || peerFromEmployees?.photoUrl,
              search: `${peerName} employee`.toLowerCase(),
            },
          ]
        })
      }
      if (!isOwnSocket) {
        markLatestOwnMessageSeen(conversationId, currentDisplayName)
      }
    }

    // Support multiple backend event names.
    socket.on('message', onIncomingMessage)
    socket.on('chat_message', onIncomingMessage)
    socket.on('new_message', onIncomingMessage)
    socket.on('receive_message', onIncomingMessage)
    socket.on('receiveMessage', onIncomingMessage)
    socket.on('conversation_message', onIncomingMessage)
    socket.on('conversationMessage', onIncomingMessage)

    return () => {
      setSocketConnected(false)
      for (const employeeId of targetEmployeeIds) {
        socket.emit('leave', { employeeID: employeeId })
        socket.emit('leave', { employeeId })
        socket.emit('leave', employeeId)
        socket.emit('leaveRoom', { employeeID: employeeId })
        socket.emit('leaveRoom', { employeeId })
        socket.emit('leaveRoom', employeeId)
        socket.emit('leave_room', { employeeID: employeeId })
        socket.emit('leave_room', { employeeId })
        socket.emit('leave_room', employeeId)
        socket.emit('leave', `emp_${employeeId}`)
        socket.emit('leaveRoom', `emp_${employeeId}`)
      }
      socket.off('message', onIncomingMessage)
      socket.off('chat_message', onIncomingMessage)
      socket.off('new_message', onIncomingMessage)
      socket.off('receive_message', onIncomingMessage)
      socket.off('receiveMessage', onIncomingMessage)
      socket.off('conversation_message', onIncomingMessage)
      socket.off('conversationMessage', onIncomingMessage)
      socket.disconnect()
      socketRef.current = null
    }
  }, [
    meEmpIdForChat,
    currentParticipantEmpId,
    currentParticipantId,
    currentSender,
    currentDisplayName,
    employees,
    upsertMessages,
    signedEmployee,
    markLatestOwnMessageSeen,
  ])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const text = inputValue.trim()
    if (!text || !conversationId) return
    const submitSignature = [conversationId, text.toLowerCase()].join('|')
    const now = Date.now()
    if (
      lastSubmitRef.current &&
      lastSubmitRef.current.signature === submitSignature &&
      now - lastSubmitRef.current.at < 900
    ) {
      return
    }
    lastSubmitRef.current = { signature: submitSignature, at: now }
    // Optimistic local append so the message doesn't "disappear" while waiting webhook/socket echo.
    const optimisticId = addMessage(conversationId, currentDisplayName, text, { status: 'sending' })
    if (optimisticId) setMessageStatus(optimisticId, 'sent')
    setInputValue('')

    // Trigger webhook logging when sender/receiver employee IDs are resolvable.
    const selectedEmployeeId = selectedUser ? getEmployeeIdFromChatUserId(selectedUser) : null
    const senderEmployeeId = meEmpIdForChat ?? signedEmployee?.id ?? null
    if (!(selectedEmployeeId && selectedEmployeeId > 0) || !(senderEmployeeId && senderEmployeeId > 0)) return

    if (selectedEmployeeId && selectedEmployeeId > 0) {
      const selectedMeta = selectedUserObj ?? AI_SERVICE_USER
      if (!(senderEmployeeId > 0)) return
      const endpoint = `/ai-services-conversation-chat/webhook/conversation/${selectedEmployeeId}`
      void (async () => {
        try {
          const res = await apiRequest<{ success?: boolean; data?: ConversationWebhookPostData }>(endpoint, {
            method: 'POST',
            body: JSON.stringify({
              senderEmpID: senderEmployeeId,
              senderName: currentDisplayName,
              receiverName: selectedMeta.name,
              message: text,
            }),
            portal: { suppressFailureLog: true },
          })
          const payload = res && typeof res === 'object' ? res.data : undefined
          const serverTs = payload?.timestamp ? String(payload.timestamp).trim() : ''
          const serverText = String(payload?.message ?? text).trim()
          const serverSender = String(payload?.senderName ?? currentDisplayName).trim() || currentDisplayName
          if (serverTs && selectedUser && conversationId) {
            upsertMessages([
              {
                id: buildMessageId(currentParticipantId, selectedUser, serverTs, serverText),
                conversationId,
                sender: serverSender,
                text: serverText,
                timestamp: serverTs,
                status: 'delivered',
              },
            ])
          } else if (optimisticId) {
            setMessageStatus(optimisticId, 'delivered')
          }
        } catch {
          // Keep chat UX responsive even if webhook logging fails.
        }
      })()
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
              const cid = getConversationId(currentParticipantId, user.id)
              const last = getLastMessageForConversation(cid)
              const isActive = selectedUser === user.id
              const unread = getUnreadCount(cid, [currentSender, currentDisplayName])
              const lastText = String(last?.text ?? '').trim()
              const baseSubtitle = last
                ? (last.sender === currentSender
                    ? (lastText ? `Sent: ${lastText}` : 'Sent')
                    : (lastText || 'New message'))
                : user.role
              const subtitle = unread >= 2
                ? `${unread > 99 ? '99+' : unread} new message${unread > 1 ? 's' : ''}`
                : unread === 1
                  ? (
                      last && last.sender !== currentSender
                        ? (lastText || 'New message')
                        : '1 new message'
                    )
                  : baseSubtitle
              const previewCandidates = storyPreviewCandidatesByUserId[user.id] ?? (
                storyPreviewByUserId[user.id] ? [storyPreviewByUserId[user.id]] : []
              )
              const previewAttempt = Math.max(0, storyPreviewAttemptByUserId[user.id] ?? 0)
              const storyAvatarSrc = previewCandidates[previewAttempt] ?? ''
              const avatarSrc = storyAvatarSrc || user.photoUrl || ''
              return (
                <button
                  key={user.id}
                  type="button"
                  className={`messenger-conv-item ${isActive ? 'active' : ''} ${unread > 0 ? 'has-unread' : ''}`}
                  ref={(el) => {
                    conversationItemRefs.current[user.id] = el
                  }}
                  onClick={() => setSelectedUser(user.id)}
                  aria-current={isActive ? 'true' : undefined}
                >
                  <span
                    className={`messenger-conv-avatar ${storyOwnerIds.has(user.id) ? 'has-story' : ''}`}
                    aria-hidden
                    onClick={(event) => {
                      const story = storyItemByUserId[user.id]
                      if (!story) return
                      event.preventDefault()
                      event.stopPropagation()
                      setOpenStoryOwnerId(story.userId)
                      setOpenStorySubIndex(0)
                    }}
                  >
                    {avatarSrc ? (
                      <img
                        src={avatarSrc}
                        alt=""
                        className="messenger-avatar-image"
                        onError={() => {
                          if (previewCandidates.length > 0 && previewAttempt < previewCandidates.length - 1) {
                            setStoryPreviewAttemptByUserId((prev) => ({
                              ...prev,
                              [user.id]: previewAttempt + 1,
                            }))
                          }
                        }}
                      />
                    ) : (
                      getInitials(user.name)
                    )}
                  </span>
                  <div className="messenger-conv-body">
                    <span className="messenger-conv-name">{user.name}</span>
                    <span className="messenger-conv-role">{subtitle}</span>
                  </div>
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
                messages.map((m, idx) => {
                  const isOwn = m.sender === currentSender || m.sender === currentDisplayName
                  const next = messages[idx + 1]
                  const nextIsOwn = next ? (next.sender === currentSender || next.sender === currentDisplayName) : false
                  const sameIncomingSenderAsNext =
                    Boolean(next) &&
                    !isOwn &&
                    !nextIsOwn &&
                    String(next.sender ?? '').trim().toLowerCase() === String(m.sender ?? '').trim().toLowerCase()
                  const showAvatar = !isOwn && !sameIncomingSenderAsNext
                  const peerName = String(selectedUserObj?.name ?? '').trim()
                  const senderNameForBubble = isOwn
                    ? String(currentDisplayName ?? '').trim() || m.sender
                    : peerName || m.sender
                  const senderPhotoForBubble = isOwn
                    ? currentPhotoUrl
                    : selectedUserObj?.photoUrl
                  const deliveryLabel = isOwn ? formatDeliveryStatus(m.status) : ''
                  const showMeta = activeMetaMessageId === m.id
                  return (
                    <div key={m.id} className={`messenger-msg ${isOwn ? 'messenger-msg-own' : ''}`}>
                      {!isOwn && (showAvatar ? (
                        <span className="messenger-msg-avatar" aria-hidden>
                          {senderPhotoForBubble ? (
                            <img src={senderPhotoForBubble} alt={`${senderNameForBubble} profile`} className="messenger-avatar-image" />
                          ) : (
                            getInitials(senderNameForBubble)
                          )}
                        </span>
                      ) : (
                        <span className="messenger-msg-avatar is-hidden" aria-hidden />
                      ))}
                      <div
                        className="messenger-msg-bubble"
                        role="button"
                        tabIndex={0}
                        onClick={() => setActiveMetaMessageId((prev) => (prev === m.id ? null : m.id))}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            setActiveMetaMessageId((prev) => (prev === m.id ? null : m.id))
                          }
                        }}
                        aria-label="Toggle message details"
                      >
                        <p className="messenger-msg-text">{m.text}</p>
                        {showMeta && (
                          <span className="messenger-msg-time">
                            {formatChatTime(m.timestamp)}
                            {deliveryLabel ? ` · ${deliveryLabel}` : ''}
                          </span>
                        )}
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
              <button
                type="submit"
                className="messenger-composer-send"
                aria-label="Send"
                disabled={!inputValue.trim()}
              >
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

      {openStoryPreview && (
        <div className="dashboard-announcement-dialog-backdrop" role="presentation" onClick={() => setOpenStoryOwnerId(null)}>
          <div className="dashboard-story-viewer chat-story-viewer--dashboard" role="dialog" aria-modal="true" aria-label={`${openStoryPreview.title} story`} onClick={(e) => e.stopPropagation()}>
            <aside className="dashboard-story-viewer__sidebar">
              <div className="dashboard-story-viewer__sidebar-head">
                <h3 className="dashboard-story-viewer__sidebar-title">Stories</h3>
                <button type="button" className="dashboard-announcement-dialog__close" onClick={() => setOpenStoryOwnerId(null)} aria-label="Close story preview">×</button>
              </div>
              <div className="dashboard-story-viewer__list">
                {chatStoryOwners.map((item) => (
                  <button
                    key={`chat-story-item-${item.userId}`}
                    type="button"
                    className={`dashboard-story-viewer__list-item ${item.userId === openStoryOwnerId ? 'is-active' : ''}`}
                    onClick={() => {
                      setOpenStoryOwnerId(item.userId)
                      setOpenStorySubIndex(0)
                    }}
                    aria-label={`Open ${item.title} story`}
                  >
                    <span className="dashboard-story-viewer__list-avatar">
                      <img src={item.mediaUrl} alt="" />
                    </span>
                    <span className="dashboard-story-viewer__list-copy">
                      <strong>{item.title}</strong>
                      <small>{item.date ? formatChatTime(item.date) : 'Story'}</small>
                    </span>
                  </button>
                ))}
              </div>
            </aside>
            <div className="dashboard-story-viewer__stage">
              <article className="dashboard-story-viewer__card chat-story-preview--dashboard">
                <div className="dashboard-story-media-wrap">
                  {ownerStories.length > 0 && (
                    <div className="dashboard-story-progress" aria-label="Story progress">
                      {ownerStories.map((item, idx) => (
                        <span
                          key={`chat-story-progress-${item.userId}-${idx}`}
                          className={`dashboard-story-progress__segment ${idx <= safeSubIndex ? 'is-active' : ''}`}
                          style={
                            idx < safeSubIndex
                              ? { background: 'rgba(241, 245, 249, 0.95)' }
                              : idx === safeSubIndex
                                ? {
                                    background: `linear-gradient(to right, rgba(241,245,249,0.95) ${Math.min(100, Math.max(0, (storyProgressMs / STORY_AUTOPLAY_MS) * 100))}%, rgba(148,163,184,0.45) ${Math.min(100, Math.max(0, (storyProgressMs / STORY_AUTOPLAY_MS) * 100))}%)`,
                                  }
                                : undefined
                          }
                          aria-hidden
                        />
                      ))}
                    </div>
                  )}
                  <div className="dashboard-story-topbar">
                    <div className="dashboard-story-topbar__author">
                      <span className="dashboard-story-topbar__avatar" aria-hidden>
                        {openStoryPreview.avatarUrl ? <img src={openStoryPreview.avatarUrl} alt="" /> : <span>{(openStoryPreview.title || 'U').trim().slice(0, 1).toUpperCase()}</span>}
                      </span>
                      <span className="dashboard-story-topbar__copy">
                        <strong>{openStoryPreview.title}</strong>
                        <small>{openStoryPreview.date ? formatChatTime(openStoryPreview.date) : 'Story'}</small>
                      </span>
                    </div>
                    <div className="dashboard-story-topbar__actions">
                      <button type="button" className="dashboard-story-topbar__icon-btn" aria-label="Sound" title="Sound">🔊</button>
                      <button
                        type="button"
                        className="dashboard-story-topbar__icon-btn"
                        aria-label={isStoryPaused ? 'Play' : 'Pause'}
                        title={isStoryPaused ? 'Play' : 'Pause'}
                        onClick={() => setIsStoryPaused((prev) => !prev)}
                      >
                        {isStoryPaused ? '▶' : '⏸'}
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="dashboard-story-viewer__tap-zone dashboard-story-viewer__tap-zone--prev"
                    onClick={goPrevStoryPreview}
                    aria-label="Previous story"
                  />
                  <img
                    key={openStoryPreview.mediaUrl}
                    src={openStoryPreview.mediaUrl}
                    alt={`${openStoryPreview.title} story`}
                    className="dashboard-announcement-dialog__image chat-story-preview__image--smooth"
                    onClick={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect()
                      const x = event.clientX - rect.left
                      if (x < rect.width / 2) goPrevStoryPreview()
                      else goNextStoryPreview()
                    }}
                  />
                  <button
                    type="button"
                    className="dashboard-story-viewer__tap-zone dashboard-story-viewer__tap-zone--next"
                    onClick={goNextStoryPreview}
                    aria-label="Next story"
                  />
                </div>
                <footer className="dashboard-story-viewer__footer">
                  <div className="dashboard-story-viewer__message">Send message...</div>
                  <div className="dashboard-story-reactions" aria-label="Story reactions">
                    <button type="button" className="dashboard-story-reaction-btn" aria-label="Like">👍</button>
                    <button type="button" className="dashboard-story-reaction-btn" aria-label="Love">❤️</button>
                    <button type="button" className="dashboard-story-reaction-btn" aria-label="Fire">🔥</button>
                    <button type="button" className="dashboard-story-reaction-btn" aria-label="Clap">👏</button>
                  </div>
                </footer>
              </article>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
