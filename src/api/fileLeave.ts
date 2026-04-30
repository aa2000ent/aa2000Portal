import { apiMultipartRequest, apiRequest, getPortalAccountId, getPortalEmpId } from './client'

/**
 * Default paths match a flat Express mount (no extra prefix):
 *
 * | Method | Path |
 * | POST | `/file-leave/add/file-leave` — multipart: `Emp_ID`, `title`, `startDate`, `endDate`, `reason`, optional `proofFile` |
 * | GET | `/file-leave` — list |
 * | GET | `/file-leave/:id` — one row |
 * | PUT | `/update/file-leave/:id` — multipart fields optional + `proofFile` |
 * | DELETE | `/delete/file-leave/:id` |
 *
 * Override with `VITE_FILE_LEAVE_*` env vars where noted below.
 */
function envPath(key: string, fallback: string): string {
  const v = String(import.meta.env[key] ?? '').trim()
  const p = v || fallback
  return p.startsWith('/') ? p : `/${p}`
}

/** POST multipart — default `/file-leave/add/file-leave`. */
export function getCreateFileLeavePath(): string {
  return envPath('VITE_FILE_LEAVE_POST_PATH', '/file-leave/add/file-leave')
}

/** GET list — default `/file-leave/get/file-leave`. */
export function getFileLeaveListPath(): string {
  return envPath('VITE_FILE_LEAVE_GET_LIST_PATH', '/file-leave/get/file-leave')
}

function getOnePath(id: string | number): string {
  const base = envPath('VITE_FILE_LEAVE_GET_ONE_PATH_TEMPLATE', '/file-leave/get/file-leave')
  return `${base.replace(/\/$/, '')}/${encodeURIComponent(String(id))}`
}

function deletePath(id: string | number): string {
  const base = envPath('VITE_FILE_LEAVE_DELETE_PATH_TEMPLATE', '/delete/file-leave')
  return `${base.replace(/\/$/, '')}/${encodeURIComponent(String(id))}`
}

function updateStatusPath(id: string | number): string {
  const encoded = encodeURIComponent(String(id))
  return `/file-leave/update/file-leave/${encoded}/status`
}

export type FileLeaveRow = {
  id?: number
  ID?: number
  leaveID?: number
  Leave_ID?: number
  fileLeaveId?: number
  file_leave_id?: number
  acc_ID?: number
  acc_id?: number
  Emp_ID?: number
  fullName?: string
  title?: string
  startDate?: string
  endDate?: string
  reason?: string
  remarks?: string | null
  proofPath?: string | null
  fileName?: string | null
  fileData?: string | null
  createdAt?: string
  updatedAt?: string
  created_at?: string
  updated_at?: string
  /** When the API persists workflow status, it is respected before local admin decisions. */
  status?: string
}

/** Stable row id from Sequelize / API shape. */
export function getFileLeaveServerId(row: FileLeaveRow): number {
  const r = row as Record<string, unknown>
  const direct = Number(
    r.id ??
      r.ID ??
      r.leave_ID ??
      r.Leave_ID ??
      r.leave_id ??
      r.leaveId ??
      r.leaveID ??
      r.LeaveId ??
      r.fileLeaveId ??
      r.file_leave_id ??
      r.file_leave_ID ??
      r.fileLeaveID ??
      0,
  )
  if (Number.isFinite(direct) && direct > 0) return direct

  // Last-resort matcher for backend variants (e.g. unusual casing).
  // Explicitly skip actor/account ids to avoid calling status endpoint with wrong id.
  const skip = new Set(['emp_id', 'empid', 'acc_id', 'accid', 'account_id', 'userid', 'user_id', 'role_id'])
  for (const [k, v] of Object.entries(r)) {
    const key = k.replace(/[^a-z0-9]/gi, '').toLowerCase()
    if (!key.includes('id')) continue
    if (skip.has(key)) continue
    if (key.includes('emp') || key.includes('acc') || key.includes('account') || key.includes('role') || key.includes('user')) continue
    const n = Number(v)
    if (Number.isFinite(n) && n > 0) return n
  }
  return 0
}

/** Stable row id for UI usage. Falls back to deterministic hash when API doesn't expose numeric id. */
export function getFileLeaveRowId(row: FileLeaveRow): number {
  const r = row as Record<string, unknown>
  const serverId = getFileLeaveServerId(row)
  if (serverId > 0) return serverId

  // Fallback when backend does not expose a numeric row id.
  // Keeps Approvals actions usable by deriving a deterministic positive id from row content.
  const seed = [
    String(r.Emp_ID ?? r.emp_ID ?? r.emp_id ?? r.acc_ID ?? r.acc_id ?? ''),
    String(r.startDate ?? r.start_date ?? ''),
    String(r.endDate ?? r.end_date ?? ''),
    String(r.title ?? ''),
    String(r.reason ?? ''),
  ].join('|')
  if (!seed.replace(/\|/g, '').trim()) return 0

  let hash = 0
  for (let i = 0; i < seed.length; i += 1) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0
  }
  // Keep within safe positive int range and reserve 0 as invalid.
  return Math.abs(hash) + 1
}

/** Prefer `acc_ID` on list rows; fall back to `Emp_ID`. */
export function pickFileLeaveActorIds(row: FileLeaveRow): { accId: number; empId: number } {
  const r = row as Record<string, unknown>
  const accId = Number(r.acc_ID ?? r.acc_id ?? r.accId ?? 0)
  const empId = Number(r.Emp_ID ?? r.emp_id ?? r.emp_ID ?? 0)
  return {
    accId: Number.isFinite(accId) && accId > 0 ? accId : 0,
    empId: Number.isFinite(empId) && empId > 0 ? empId : 0,
  }
}

export type CreateFileLeaveResponse = {
  message?: string
  leaveDetails?: FileLeaveRow
}

/**
 * POST `multipart/form-data` matching Express: `Emp_ID`, `title`, `startDate`, `endDate`, `reason`, optional `proofFile`.
 */
export async function createFileLeave(payload: {
  /** Optional here — falls back to login-stored Emp_ID in localStorage. */
  Emp_ID?: number | string | null
  title: string
  startDate: string
  endDate: string
  reason: string
  proofFile?: File | null
}): Promise<CreateFileLeaveResponse> {
  const resolvedEmpId = Number(payload.Emp_ID ?? getPortalEmpId() ?? getPortalAccountId() ?? 0)
  if (!Number.isFinite(resolvedEmpId) || resolvedEmpId <= 0) {
    throw new Error('No Emp_ID available for file-leave. Please sign out and sign in again.')
  }

  const fd = new FormData()
  fd.append('Emp_ID', String(resolvedEmpId))
  fd.append('title', payload.title)
  fd.append('startDate', payload.startDate)
  fd.append('endDate', payload.endDate)
  fd.append('reason', payload.reason)
  fd.append('status', 'PENDING')
  if (payload.proofFile) fd.append('proofFile', payload.proofFile)

  return apiMultipartRequest<CreateFileLeaveResponse>(getCreateFileLeavePath(), fd, { method: 'POST' })
}

export async function fetchFileLeaves(): Promise<FileLeaveRow[]> {
  const path = getFileLeaveListPath()
  const freshPath = `${path}${path.includes('?') ? '&' : '?'}_ts=${Date.now()}`
  const data = await apiRequest<FileLeaveRow[] | { data?: FileLeaveRow[] }>(freshPath, { method: 'GET', cache: 'no-store' })
  if (Array.isArray(data)) return data
  const inner = (data as { data?: FileLeaveRow[] })?.data
  return Array.isArray(inner) ? inner : []
}

export async function fetchFileLeaveById(
  id: number | string,
  options?: { fresh?: boolean },
): Promise<FileLeaveRow> {
  const base = getOnePath(id)
  const path = options?.fresh ? `${base}${base.includes('?') ? '&' : '?'}_ts=${Date.now()}` : base
  return apiRequest<FileLeaveRow>(path, { method: 'GET', cache: options?.fresh ? 'no-store' : undefined })
}

export async function deleteFileLeave(id: number | string): Promise<{ message?: string }> {
  return apiRequest(deletePath(id), { method: 'DELETE' })
}

/** PUT leave workflow status via exact backend route `/file-leave/update/file-leave/:id/status`. */
export async function updateFileLeaveStatus(
  id: number | string,
  payload: { status: 'APPROVED' | 'REJECTED' | 'PENDING'; remarks?: string },
): Promise<{ message?: string; leaveDetails?: FileLeaveRow }> {
  console.log('[FileLeave API] PUT status request', {
    id: Number(id),
    status: payload.status,
    remarks: payload.remarks ?? null,
    primaryPath: updateStatusPath(id),
  })
  return apiRequest(updateStatusPath(id), {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}
