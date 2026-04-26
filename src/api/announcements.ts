import { apiRequest } from './client'

export type AnnouncementType = 'ANNOUNCEMENT' | 'MEMO'
export type AnnouncementStatus = 'ACTIVE' | 'INACTIVE'

export interface AnnouncementItem {
  an_ID: number
  acc_ID: number
  Title: string
  Description: string
  Image: string
  Date: string
  Status: AnnouncementStatus
  type: AnnouncementType
}

type RawAnnouncement = Record<string, unknown>

function parseType(value: unknown): AnnouncementType {
  return String(value ?? 'ANNOUNCEMENT').toUpperCase() === 'MEMO' ? 'MEMO' : 'ANNOUNCEMENT'
}

function parseStatus(value: unknown): AnnouncementStatus {
  return String(value ?? 'ACTIVE').toUpperCase() === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE'
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

export async function fetchAnnouncementsByType(type: AnnouncementType): Promise<AnnouncementItem[]> {
  const data = await apiRequest<unknown>(`/announcements/get/announcements/${type}`)
  return extractList(data).map(mapAnnouncement)
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
}

export async function createAnnouncement(payload: AnnouncementCreatePayload): Promise<AnnouncementItem | null> {
  const data = await apiRequest<unknown>('/announcements/add/announcements', {
    method: 'POST',
    body: JSON.stringify(payload),
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

