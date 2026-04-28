import { useState, useRef, useEffect, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { io, type Socket } from 'socket.io-client'
import { useChat, getConversationId } from '../contexts/ChatContext'
import { useEmployees } from '../contexts/EmployeesContext'
import { apiRequest, getPortalAccountId, getPortalUsername } from '../api/client'

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

function getEmployeeIdFromChatUserId(id: string): number | null {
  if (id.startsWith('emp-id:')) {
    const n = Number(id.slice('emp-id:'.length))
    return Number.isFinite(n) && n > 0 ? n : null
  }
  return null
}

function resolveCurrentSenderEmployeeId(params: {
  signedEmployeeId?: number | string
  signedAccountId?: number | string
  currentSenderId: string
  currentSender: string
  employees: Array<{ id: number; accId?: number; name?: string; email?: string }>
}): number | null {
  const signed = Number(params.signedEmployeeId)
  if (Number.isFinite(signed) && signed > 0) return signed

  const signedAccId = Number(params.signedAccountId)
  if (Number.isFinite(signedAccId) && signedAccId > 0) {
    const byAccId = params.employees.find((e) => Number(e.accId) === signedAccId)
    if (byAccId?.id) return Number(byAccId.id)
  }

  const fromCurrentId = getEmployeeIdFromChatUserId(params.currentSenderId)
  if (fromCurrentId) return fromCurrentId

  const senderKey = params.currentSender.trim().toLowerCase()
  if (!senderKey) return null
  const byEmail = params.employees.find((e) => String(e.email ?? '').trim().toLowerCase() === senderKey)
  if (byEmail?.id) return Number(byEmail.id)
  const byName = params.employees.find((e) => String(e.name ?? '').trim().toLowerCase() === senderKey)
  if (byName?.id) return Number(byName.id)
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
  return window.location.origin
}

export default function ChatPage() {
  const location = useLocation()
  const path = location.pathname.replace(/^\//, '').split('/')[0] || 'admin'
  const { employees } = useEmployees()
  const signedUsername = String(getPortalUsername() ?? '').trim()
  const roleLabel = ROLE_LABELS[path] ?? humanizeSegment(path)
  const currentSender = signedUsername || roleLabel
  const signedAccountId = String(getPortalAccountId() ?? '').trim()
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
    () =>
      otherUsers.filter((user) => {
        const cid = getConversationId(currentParticipantId, user.id)
        return Boolean(getLastMessageForConversation(cid))
      }),
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
    // Only poll the logged-in employee conversation endpoint.
    // Avoid scanning every employee ID, which causes excessive GET traffic.
    const targetEmployeeIds = currentParticipantEmpId ? [currentParticipantEmpId] : []
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
            let parsedFromId = ''
            let parsedFromName = ''
            let parsedToId = ''
            let parsedToName = ''
            let parsedSenderImage: string | undefined
            let parsedReceiverImage: string | undefined
            if (row && typeof row === 'object' && !Array.isArray(row)) {
              timestamp = String(row.timestamp ?? '').trim()
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

    // Poll every second so message history stays updated from the API.
    void fetchConversationHistory()
    const pollHandle = window.setInterval(() => {
      void fetchConversationHistory()
    }, 1000)

    return () => {
      window.clearInterval(pollHandle)
    }
  }, [currentParticipantEmpId, employees, currentParticipantId, currentSender, currentDisplayName, upsertMessages])

  useEffect(() => {
    if (!currentParticipantEmpId) return
    const socketBase = buildSocketBaseUrl()
    const socket: Socket = io(socketBase, {
      transports: ['websocket', 'polling'],
      withCredentials: true,
    })

    socket.on('connect', () => {
      socket.emit('join', { employeeID: currentParticipantEmpId })
    })

    socket.on('message', (evt: {
      timestamp?: string
      senderEmpID?: string | number
      senderName?: string
      senderImage?: string
      receiverEmpID?: string | number
      receiverName?: string
      receiverImage?: string
      message?: string
    }) => {
      const senderEmpId = Number(evt.senderEmpID)
      const receiverEmpId = Number(evt.receiverEmpID)
      const timestamp = String(evt.timestamp ?? '').trim()
      const text = String(evt.message ?? '').trim()
      if (!Number.isFinite(senderEmpId) || !Number.isFinite(receiverEmpId) || !timestamp || !text) return

      const senderId = `emp-id:${senderEmpId}`
      const receiverId = `emp-id:${receiverEmpId}`
      const conversationId = getConversationId(senderId, receiverId)
      const senderName = String(evt.senderName ?? '').trim()
      const isOwn = senderEmpId === currentParticipantEmpId
      const label = isOwn ? currentDisplayName : (senderName || `Employee ${senderEmpId}`)

      upsertMessages([
        {
          id: buildMessageId(senderId, receiverId, timestamp, text),
          conversationId,
          sender: label,
          text,
          timestamp,
        },
      ])

      const peerEmpId = senderEmpId === currentParticipantEmpId ? receiverEmpId : senderEmpId
      const peerId = `emp-id:${peerEmpId}`
      const peerFromEmployees = employees.find((e) => Number(e.id) === peerEmpId)
      const peerImageFromSocket = senderEmpId === currentParticipantEmpId
        ? toImageSrc(evt.receiverImage)
        : toImageSrc(evt.senderImage)
      const peerName =
        String(peerFromEmployees?.name ?? '').trim() ||
        (peerEmpId === senderEmpId ? senderName : String(evt.receiverName ?? '').trim()) ||
        `Employee ${peerEmpId}`
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
    })

    return () => {
      socket.emit('leave', { employeeID: currentParticipantEmpId })
      socket.disconnect()
    }
  }, [currentParticipantEmpId, currentSender, currentDisplayName, employees, upsertMessages])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const text = inputValue.trim()
    if (!text || !conversationId) return

    const selectedEmployeeId = selectedUser ? getEmployeeIdFromChatUserId(selectedUser) : null
    const senderEmployeeId = resolveCurrentSenderEmployeeId({
      signedEmployeeId: signedEmployee?.id,
      signedAccountId,
      currentSenderId,
      currentSender,
      employees,
    })
    if (!selectedEmployeeId) return
    if (!senderEmployeeId) {
      console.error('[Chat] Cannot send message: senderEmpID could not be resolved for webhook payload.', {
        currentSender,
        currentSenderId,
        signedAccountId,
      })
      return
    }

    const selectedMeta = selectedUserObj ?? AI_SERVICE_USER
    const receiverName = toConversationFirstName(String(selectedMeta.name ?? '').trim() || 'Unknown receiver')
    const senderName = String(currentSender ?? '').trim() || 'Unknown sender'
    setInputValue('')

    void apiRequest(`/ai-services-conversation-chat/webhook/conversation/${selectedEmployeeId}`, {
      method: 'POST',
      body: JSON.stringify({
        senderEmpID: String(senderEmployeeId),
        senderName,
        receiverName,
        message: text,
      }),
      portal: { suppressFailureLog: true },
    }).catch(() => {
      // Keep chat UX responsive even if webhook logging fails.
    })
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
              const preview = last ? `${last.sender}: ${last.text}` : ''
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
                    {last ? (
                      <span className="messenger-conv-preview" title={preview}>
                        {preview}
                      </span>
                    ) : (
                      <span className="messenger-conv-role">{user.role}</span>
                    )}
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
                  const isOwn = m.sender === currentSender || m.sender === currentDisplayName
                  const peerName = String(selectedUserObj?.name ?? '').trim()
                  const senderNameForBubble = isOwn
                    ? String(currentDisplayName ?? '').trim() || m.sender
                    : peerName || m.sender
                  const senderPhotoForBubble = isOwn
                    ? currentPhotoUrl
                    : selectedUserObj?.photoUrl
                  return (
                    <div key={m.id} className={`messenger-msg ${isOwn ? 'messenger-msg-own' : ''}`}>
                      <span className="messenger-msg-avatar" aria-hidden>
                        {senderPhotoForBubble ? (
                          <img src={senderPhotoForBubble} alt={`${senderNameForBubble} profile`} className="messenger-avatar-image" />
                        ) : (
                          getInitials(senderNameForBubble)
                        )}
                      </span>
                      <div className="messenger-msg-bubble">
                        <span className="messenger-msg-sender">{toConversationFirstName(senderNameForBubble)}</span>
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
