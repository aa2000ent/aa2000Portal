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
  if (t.includes('\\')) return false // Windows absolute path
  // Normalize base64url → standard base64, then validate charset
  // Note: do NOT reject on '/' — standard base64 uses it
  const normalized = t.replace(/-/g, '+').replace(/_/g, '/')
  return /^[A-Za-z0-9+/]+={0,2}$/.test(normalized)
}

function toDataUrl(base64: string, mime = 'image/jpeg'): string {
  const clean = base64.trim().replace(/\s/g, '')
  return `data:${mime};base64,${clean}`
}

function detectImageMimeFromBase64(base64: string): string {
  try {
    const bin = atob(base64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i)
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
    if (
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    ) {
      return 'image/png'
    }
    if (bytes.length >= 4 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
      return 'image/gif'
    }
    if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
      const ascii = (start: number) =>
        String.fromCharCode(bytes[start] ?? 0, bytes[start + 1] ?? 0, bytes[start + 2] ?? 0, bytes[start + 3] ?? 0)
      if (ascii(8) === 'WEBP') return 'image/webp'
    }
  } catch {
    // ignore
  }
  return 'image/jpeg'
}

function base64ToDataUrl(base64: string): string {
  let normalized = base64.trim().replace(/\s/g, '').replace(/^data:[^,]+,/, '')
  normalized = normalized.replace(/-/g, '+').replace(/_/g, '/')
  const mime = detectImageMimeFromBase64(normalized)
  return `data:${mime};base64,${normalized}`
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const sub = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...sub)
  }
  return btoa(binary)
}

function base64FromBufferLike(value: unknown): string | undefined {
  if (value == null) return undefined
  if (value instanceof Uint8Array) return bytesToBase64(value)
  if (Array.isArray(value)) return bytesToBase64(new Uint8Array(value))
  if (typeof value === 'object') {
    const maybe = value as Record<string, unknown>
    if (maybe.type === 'Buffer' && Array.isArray(maybe.data)) {
      return bytesToBase64(new Uint8Array(maybe.data as number[]))
    }
    if (Array.isArray(maybe.data)) {
      return bytesToBase64(new Uint8Array(maybe.data as number[]))
    }
  }
  return undefined
}

function extractEmployeePhotoUrl(emp: Record<string, unknown>): string | undefined {
  function isTinyGifPlaceholder(value: string): boolean {
    const v = value.trim()
    if (!v) return true
    if (v.startsWith('data:image/gif;base64,')) {
      const b64 = v.slice('data:image/gif;base64,'.length).replace(/\s/g, '')
      if (b64.length < 200) return true
    }
    return false
  }

  const candidates: unknown[] = [
    emp.Emp_photo,
    emp.emp_photo,
    emp.Emp_image,
    emp.emp_image,
    emp.Emp_img,
    emp.emp_img,
    emp.Emp_avatar,
    emp.emp_avatar,
    emp.photo,
    emp.picture,
    emp.profile_picture,
    emp.profilePicture,
    emp.Emp_imageBase64,
    emp.emp_imageBase64,
    emp.Emp_imagebase64,
    emp.empImageBase64,
    emp.Emp_image_base64,
    emp.emp_image_base64,
    emp.photoUrl,
    emp.photo_url,
    emp.avatarUrl,
    emp.avatar_url,
    emp.imageUrl,
    emp.image_url,
    emp.image,
  ]

  for (const raw of candidates) {
    if (raw == null) continue
    if (typeof raw === 'string') {
      const v = raw.trim()
      if (!v || v === '[object Object]') continue
      if (v.startsWith('data:')) return isTinyGifPlaceholder(v) ? undefined : v
      if (isLikelyBase64(v)) return base64ToDataUrl(v)
      return v
    }
    const b64 = base64FromBufferLike(raw)
    if (b64) return base64ToDataUrl(b64)
  }

  // Extra fallback to mirror employee parser behavior across unknown key casing.
  for (const [k, v] of Object.entries(emp)) {
    if (!/image.*base64/i.test(k)) continue
    if (typeof v === 'string') {
      const candidate = v.trim()
      if (!candidate) continue
      if (candidate.startsWith('data:')) return isTinyGifPlaceholder(candidate) ? undefined : candidate
      if (isLikelyBase64(candidate)) return base64ToDataUrl(candidate)
      return candidate
    }
    const b64 = base64FromBufferLike(v)
    if (b64) return base64ToDataUrl(b64)
  }
  return undefined
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
  const photoUrl = extractEmployeePhotoUrl(emp)
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
  const employeeId = Number(
    row.EmployeeID ?? row.employeeID ?? row.employeeId ??
    row.Emp_ID ?? row.emp_ID ?? row.employee_id ?? row.EmpID ?? 0
  )
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
  const byAccId = new Map<number, StoryAuthorSource>()
  for (const e of employees) {
    if (Number.isFinite(e.id) && e.id > 0) byEmpId.set(e.id, e)
    if (Number.isFinite(e.accId) && (e.accId as number) > 0) byAccId.set(e.accId as number, e)
  }
  const out: DashboardStoryItem[] = []
  for (const raw of rawList) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    const row = raw as RawStory
    const parsed = parseStoryRow(row)
    if (!parsed) continue
    const embeddedEmp = parseEmployeeFromStoryRow(row)
    // acc_ID may live directly on the story row (e.g. joined from accounts table)
    const rowAccId = Number(row.acc_ID ?? row.accId ?? row.account_id ?? row.AccountID ?? 0)
    const listedEmp =
      byEmpId.get(parsed.employeeId) ??
      (rowAccId > 0 ? byAccId.get(rowAccId) : undefined) ??
      (embeddedEmp?.accId ? byAccId.get(embeddedEmp.accId) : undefined)
    const title =
      embeddedEmp?.name?.trim() ||
      listedEmp?.name?.trim() ||
      (parsed.employeeId > 0 ? `Employee ${parsed.employeeId}` : 'Unknown')
    const accId =
      (embeddedEmp?.accId && embeddedEmp.accId > 0 ? embeddedEmp.accId : 0) ||
      (listedEmp?.accId && listedEmp.accId > 0 ? listedEmp.accId : 0) ||
      rowAccId || 0
    const authorPhotoUrl =
      (embeddedEmp?.photoUrl?.trim() || undefined) ??
      (listedEmp?.photoUrl?.trim() || undefined)
    out.push({
      ...parsed,
      title,
      accId,
      authorPhotoUrl,
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
