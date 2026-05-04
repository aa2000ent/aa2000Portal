import { apiRequest } from './client'

export type AnnouncementType = 'ANNOUNCEMENT' | 'MEMO' | 'MEETING_MINUTES'
export type AnnouncementStatus = 'ACTIVE' | 'INACTIVE'

export function announcementKindLabel(type: AnnouncementType): string {
  switch (type) {
    case 'MEMO':
      return 'MEMO'
    case 'MEETING_MINUTES':
      return 'MEETING MINUTES'
    default:
      return 'PUBLIC ANNOUNCEMENT'
  }
}

export function announcementDialogEyebrow(type: AnnouncementType): string {
  switch (type) {
    case 'MEMO':
      return 'Internal memo'
    case 'MEETING_MINUTES':
      return 'Meeting minutes'
    default:
      return 'Public announcement'
  }
}

export interface AnnouncementItem {
  an_ID: number
  acc_ID: number
  Title: string
  Description: string
  Image: string
  Date: string
  Status: AnnouncementStatus
  type: AnnouncementType
  authorName?: string
}

type RawAnnouncement = Record<string, unknown>

function parseType(value: unknown): AnnouncementType {
  const raw = String(value ?? 'ANNOUNCEMENT')
    .toUpperCase()
    .replace(/[\s-]+/g, '_')
  if (raw === 'MEMO') return 'MEMO'
  if (raw === 'MEETING_MINUTES' || raw === 'MEETINGMINUTES') return 'MEETING_MINUTES'
  return 'ANNOUNCEMENT'
}

function parseStatus(value: unknown): AnnouncementStatus {
  return String(value ?? 'ACTIVE').toUpperCase() === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE'
}

function parseAuthorName(row: RawAnnouncement): string | undefined {
  const candidates = [
    row.authorName,
    row.AuthorName,
    row.author_name,
    row.fullName,
    row.full_name,
    row.employeeName,
    row.employee_name,
    row.name,
    row.createdByName,
    row.created_by_name,
    row.username,
  ]
  for (const value of candidates) {
    const text = String(value ?? '').trim()
    if (text) return text
  }
  return undefined
}

function mapAnnouncement(row: RawAnnouncement): AnnouncementItem {
  return {
    an_ID: Number(row.an_ID ?? row.id ?? 0),
    acc_ID: Number(row.acc_ID ?? row.accountId ?? 0),
    Title: String(row.Title ?? row.title ?? '').trim(),
    Description: String(row.Description ?? row.description ?? '').trim(),
    Image: String(row.Image ?? row.image ?? '').trim(),
    Date: String(row.Date ?? row.date ?? ''),
    Status: parseStatus(row.Status ?? row.status),
    type: parseType(row.type),
    authorName: parseAuthorName(row),
  }
}

function extractList(data: unknown): RawAnnouncement[] {
  if (Array.isArray(data)) return data.filter((x): x is RawAnnouncement => !!x && typeof x === 'object')
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>
    for (const key of ['data', 'announcements', 'rows', 'results']) {
      const v = d[key]
      if (Array.isArray(v)) return v.filter((x): x is RawAnnouncement => !!x && typeof x === 'object')
    }
  }
  return []
}

export async function fetchAnnouncementsByType(
  type: AnnouncementType,
  recipientAccId?: number,
): Promise<AnnouncementItem[]> {
  const accSuffix = type === 'MEMO' && recipientAccId && recipientAccId > 0 ? `?accId=${recipientAccId}` : ''
  const paths = [
    `/announcements/get/announcements/${type}${accSuffix}`,
    `/announcements/announcements/get/${type}${accSuffix}`,
    `/announcements/list/${type}${accSuffix}`,
    `/announcements/all/${type}${accSuffix}`,
  ]
  for (const path of paths) {
    try {
      const data = await apiRequest<unknown>(path, { portal: { suppressFailureLog: true } })
      const list = extractList(data)
      if (list.length > 0 || data !== null) return list.map(mapAnnouncement)
    } catch {
      // try next path
    }
  }
  return []
}

export interface MemoEmployee {
  id: number
  EmployeeID: number
  annoucementID: number
}

export interface AnnouncementWithEmployees extends AnnouncementItem {
  involvedEmployees?: MemoEmployee[]
}

/** Fetch a single announcement/memo by type + id. For MEMOs, includes involvedEmployees. */
export async function fetchAnnouncementByTypeAndId(
  type: AnnouncementType,
  id: number,
): Promise<AnnouncementWithEmployees | null> {
  try {
    const data = await apiRequest<unknown>(`/announcements/announcements/${type}/${id}`, { cache: 'no-store' })
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null
    const row = data as Record<string, unknown>
    const base = mapAnnouncement(row)
    const involvedEmployees = Array.isArray(row.involvedEmployees)
      ? (row.involvedEmployees as Record<string, unknown>[]).map((e) => ({
          id: Number(e.id ?? 0),
          EmployeeID: Number(e.EmployeeID ?? e.employeeID ?? e.employeeId ?? 0),
          annoucementID: Number(e.annoucementID ?? e.announcementID ?? id),
        }))
      : undefined
    return { ...base, involvedEmployees }
  } catch {
    return null
  }
}

export async function fetchAnnouncementById(id: number): Promise<AnnouncementItem | null> {
  try {
    const data = await apiRequest<unknown>(`/announcements/announcements/${id}`)
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null
    const d = data as Record<string, unknown>
    const row = (d.data ?? d.announcement ?? d) as RawAnnouncement
    if (!row || typeof row !== 'object') return null
    return mapAnnouncement(row)
  } catch {
    return null
  }
}

export interface AnnouncementCreatePayload {
  acc_ID: number
  Title: string
  Description?: string
  Image?: string
  Status?: AnnouncementStatus
  type: AnnouncementType
  employeeIds?: number[]
  recipientAccIds?: number[]
  audience?: 'ALL' | 'SELECTED'
}

export async function createAnnouncement(payload: AnnouncementCreatePayload): Promise<AnnouncementItem | null> {
  const { recipientAccIds, audience, ...rest } = payload
  const body = {
    ...rest,
    // Server expects `employeeIds`; use explicit field or fall back to recipientAccIds alias
    employeeIds: rest.employeeIds ?? recipientAccIds,
  }
  const data = await apiRequest<unknown>('/announcements/add/announcements', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const d = data as Record<string, unknown>
  const row = (d.data ?? d.announcement ?? d) as RawAnnouncement
  if (!row || typeof row !== 'object') return null
  return mapAnnouncement(row)
}

export async function updateAnnouncement(id: number, payload: Partial<AnnouncementCreatePayload>): Promise<AnnouncementItem | null> {
  const data = await apiRequest<unknown>(`/announcements/update/announcements/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const d = data as Record<string, unknown>
  const row = (d.data ?? d.announcement ?? d) as RawAnnouncement
  if (!row || typeof row !== 'object') return null
  return mapAnnouncement(row)
}

export async function deleteAnnouncement(id: number): Promise<boolean> {
  try {
    await apiRequest(`/announcements/delete/announcements/${id}`, { method: 'DELETE' })
    return true
  } catch {
    return false
  }
}

