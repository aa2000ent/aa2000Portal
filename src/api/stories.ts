import { apiMultipartRequest, apiRequest } from './client'
import { API_PREFIX, getBaseUrl } from './config'

type RawStory = Record<string, unknown>

export type StoryAuthorSource = {
  id: number
  accId?: number
  name: string
  photoUrl?: string
}

/** Normalized row for the dashboard stories rail / viewer. */
export type DashboardStoryItem = {
  storyId: number
  employeeId: number
  accId: number
  authorPhotoUrl?: string
  mediaUrl: string
  mediaCandidates: string[]
  caption: string
  title: string
  date: string
}

function extractList(data: unknown): RawStory[] {
  if (Array.isArray(data)) return data.filter((x): x is RawStory => !!x && typeof x === 'object')
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>
    for (const key of ['data', 'stories', 'rows', 'results']) {
      const v = d[key]
      if (Array.isArray(v)) return v.filter((x): x is RawStory => !!x && typeof x === 'object')
    }
  }
  return []
}

function basenameFromDiskPath(p: string): string {
  const s = p.replace(/\\/g, '/').trim()
  const parts = s.split('/').filter(Boolean)
  return parts.length ? (parts[parts.length - 1] ?? '') : ''
}

function isLikelyBase64(value: string): boolean {
  const t = value.trim().replace(/\s/g, '')
  if (!t || t.length < 20) return false
  if (t.startsWith('data:')) return true
  if (/^https?:\/\//i.test(t)) return false
  if (t.includes('\\') || t.includes('/')) return false
  return /^[A-Za-z0-9+/]+={0,2}$/.test(t)
}

function toDataUrl(base64: string, mime = 'image/jpeg'): string {
  const clean = base64.trim().replace(/\s/g, '')
  return `data:${mime};base64,${clean}`
}

function parseEmployeeFromStoryRow(row: RawStory): StoryAuthorSource | undefined {
  const rawEmp = row.Employee ?? row.employee
  if (!rawEmp || typeof rawEmp !== 'object' || Array.isArray(rawEmp)) return undefined
  const emp = rawEmp as Record<string, unknown>
  const id = Number(emp.Emp_ID ?? emp.emp_ID ?? emp.EmployeeID ?? emp.employeeId ?? 0)
  if (!Number.isFinite(id) || id <= 0) return undefined
  const accIdRaw = Number(emp.acc_ID ?? emp.accId ?? emp.account_id ?? 0)
  const accId = Number.isFinite(accIdRaw) && accIdRaw > 0 ? accIdRaw : undefined
  const fullName = String(emp.fullName ?? '').trim()
  const name =
    fullName ||
    [emp.Emp_fname, emp.Emp_mname, emp.Emp_lname]
      .map((v) => String(v ?? '').trim())
      .filter(Boolean)
      .join(' ')
      .trim() ||
    `Employee ${id}`
  let photoUrl = String(emp.Emp_imageBase64 ?? emp.emp_imageBase64 ?? emp.photoUrl ?? '').trim()
  if (photoUrl && !photoUrl.startsWith('data:') && isLikelyBase64(photoUrl)) {
    photoUrl = toDataUrl(photoUrl)
  }
  return { id, accId, name, photoUrl: photoUrl || undefined }
}

/**
 * Turn a DB `StoriesPath` into a URL the browser can load.
 * - Already `http(s)://` → returned as-is.
 * - `VITE_STORIES_MEDIA_BASE` (optional) → `{base}/{filename}`.
 * - Else → `{API}/stories/media/{filename}` — add on Express:
 *   `router.get('/media/:filename', …)` mounted under `/stories` so full path is `/stories/media/:filename`.
 */
export function resolveStoryMediaUrls(row: RawStory): string[] {
  // Prioritize canonical story path fields to avoid legacy/object fields (e.g. Image=[object Object])
  // hijacking the resolver in production payloads.
  const rawCandidates = [
    row.StoriesPath,
    row.storiesPath,
    row.mediaUrl,
    row.MediaUrl,
    row.url,
    row.Image,
    row.image,
    row.mediaBase64,
    row.MediaBase64,
  ].filter((v) => v != null)

  const out: string[] = []
  const customBase = String(import.meta.env.VITE_STORIES_MEDIA_BASE ?? '').trim().replace(/\/$/, '')
  const baseUrl = getBaseUrl()

  for (const raw of rawCandidates) {
    const pathStr = String(raw).trim()
    if (!pathStr) continue
    // Skip obvious non-media legacy objects serialized to string.
    if (pathStr === '[object Object]') continue

    if (pathStr.startsWith('data:')) {
      out.push(pathStr)
      continue
    }
    if (isLikelyBase64(pathStr)) {
      out.push(toDataUrl(pathStr))
      continue
    }
    if (/^https?:\/\//i.test(pathStr)) {
      out.push(pathStr)
      continue
    }

    const basename = basenameFromDiskPath(pathStr)
    if (!basename) continue
    const encoded = encodeURIComponent(basename)
    if (customBase && /^https?:\/\//i.test(customBase)) out.push(`${customBase}/${encoded}`)
    out.push(`${baseUrl}${API_PREFIX}/stories/media/${encoded}`)
    out.push(`${baseUrl}${API_PREFIX}/stories/${encoded}`)
    out.push(`${baseUrl}${API_PREFIX}/uploads/stories/${encoded}`)
  }

  return Array.from(new Set(out))
}

function parseStoryRow(row: RawStory): Omit<DashboardStoryItem, 'title' | 'accId'> | null {
  const storyId = Number(row.id ?? row.StoriesID ?? row.stories_ID ?? row.story_ID ?? 0)
  const employeeId = Number(row.EmployeeID ?? row.employeeID ?? row.employeeId ?? 0)
  const caption = String(row.Caption ?? row.caption ?? '').trim()
  const date = String(
    row.createdAt ??
      row.created_at ??
      row.CreatedAt ??
      row.CreatedDate ??
      row.createdDate ??
      row.created_date ??
      row.StoriesDate ??
      row.stories_date ??
      row.story_date ??
      row.timestamp ??
      row.updatedAt ??
      row.updated_at ??
      row.Date ??
      row.date ??
      '',
  ).trim()
  const mediaCandidates = resolveStoryMediaUrls(row)
  const mediaUrl = mediaCandidates[0] ?? ''
  if (!Number.isFinite(storyId) || storyId <= 0) return null
  return { storyId, employeeId, caption, date, mediaUrl, mediaCandidates }
}

export function mapStoriesForDashboard(
  rawList: unknown[],
  employees: StoryAuthorSource[],
): DashboardStoryItem[] {
  const byEmpId = new Map<number, StoryAuthorSource>()
  for (const e of employees) {
    if (Number.isFinite(e.id) && e.id > 0) byEmpId.set(e.id, e)
  }
  const out: DashboardStoryItem[] = []
  for (const raw of rawList) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    const row = raw as RawStory
    const parsed = parseStoryRow(row)
    if (!parsed) continue
    const embeddedEmp = parseEmployeeFromStoryRow(row)
    const emp = embeddedEmp ?? byEmpId.get(parsed.employeeId)
    const title = emp?.name?.trim() || (parsed.employeeId > 0 ? `Employee ${parsed.employeeId}` : 'Unknown')
    const accId = emp?.accId && emp.accId > 0 ? emp.accId : 0
    out.push({
      ...parsed,
      title,
      accId,
      authorPhotoUrl: String(emp?.photoUrl ?? '').trim() || undefined,
    })
  }
  return out
}

export async function fetchStories(): Promise<unknown[]> {
  const data = await apiRequest<unknown>('/stories')
  return extractList(data)
}

export async function deleteStory(id: number): Promise<boolean> {
  try {
    await apiRequest(`/stories/${id}`, { method: 'DELETE' })
    return true
  } catch {
    return false
  }
}

export function dataUrlToFile(dataUrl: string, filename = 'story.jpg'): File {
  const comma = dataUrl.indexOf(',')
  const header = comma >= 0 ? dataUrl.slice(0, comma) : ''
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
  const mimeMatch = /^data:([^;,]+)/.exec(header)
  const mime = mimeMatch?.[1]?.trim() || 'image/jpeg'
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i)
  const blob = new Blob([bytes], { type: mime })
  return new File([blob], filename, { type: mime })
}

export async function createStory(params: {
  file: File | Blob
  filename: string
  caption: string
  employeeId: number
}): Promise<unknown> {
  const fd = new FormData()
  fd.append('media', params.file, params.filename)
  fd.append('Caption', params.caption)
  fd.append('EmployeeID', String(params.employeeId))
  return apiMultipartRequest<unknown>('/stories', fd, { method: 'POST' })
}

export function isStoryVideoUrl(url: string): boolean {
  const u = url.split('?')[0]?.toLowerCase() ?? ''
  return /\.(mp4|webm|ogg|mov|mkv|m4v)$/.test(u)
}
