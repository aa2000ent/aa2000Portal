import { apiRequest, hasApiBase } from './client'
import type { CustomerAddressPayload } from './customers'
import type { RoleOption } from './roles'
import type { Employee } from '../contexts/EmployeesContext'

/** Same shape as customer location payload (lat/lon + structured address for Address row + FK on backend). */
export type { CustomerAddressPayload as EmployeeAddressPayload } from './customers'

type EmployeeDto = {
  id: number
  name: string
  email: string
  role: string
  status?: 'Active' | 'Inactive'
  password?: string
}

const EMP_ROLE_LABELS: Record<number, string> = {
  1: 'Installer',
  2: 'Sales',
  3: 'Technician',
  4: 'Admin',
  5: 'Supervisor',
  6: 'Manager',
}

function getAddressLineFromEmployeeRow(row: Record<string, unknown>): string {
  const addr = row.Address as Record<string, unknown> | undefined
  if (addr && typeof addr === 'object' && !Array.isArray(addr)) {
    const parts = [
      addr.Addrss_street ?? addr.addrss_street ?? addr.street,
      addr.Addrss_municipality ?? addr.addrss_municipality ?? addr.municipality ?? addr.city,
      addr.Addrss_province ?? addr.addrss_province ?? addr.province ?? addr.state,
      addr.Addrss_postal ?? addr.addrss_postal ?? addr.postal ?? addr.postcode,
    ]
      .filter(Boolean)
      .map(String)
    if (parts.length) return parts.join(', ')
  }
  return ''
}

function getIncludedRoleName(row: Record<string, unknown>): string | undefined {
  const roleObj = row.Role ?? row.role
  if (roleObj != null && typeof roleObj === 'object' && !Array.isArray(roleObj)) {
    const r = roleObj as Record<string, unknown>
    const name = r.r_name ?? r.r_Name ?? r.role_name ?? r.role_Name
    if (typeof name === 'string' && name.trim()) return name.trim()
  }
  return undefined
}

function isLikelyBase64(s: string): boolean {
  const t = s.trim().replace(/\s/g, '')
  if (!t.length) return false
  if (t.length < 10) return false
  if (t.includes(':')) return false // likely a full data URL / scheme
  if (t.startsWith('http')) return false

  // Accept both standard and base64url chars.
  const normalized = t.replace(/-/g, '+').replace(/_/g, '/')
  // Basic sanity check: allowed chars + optional padding.
  return /^[A-Za-z0-9+/]+={0,2}$/.test(normalized)
}

function detectImageMimeFromBase64(base64: string): string {
  // Detect common signatures from decoded bytes.
  // Note: if detection fails, we fall back to JPEG.
  try {
    const bin = atob(base64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)

    // JPEG: FF D8 FF
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'

    // PNG: 89 50 4E 47 0D 0A 1A 0A
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

    // GIF: 47 49 46 38
    if (bytes.length >= 4 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
      return 'image/gif'
    }

    // WebP: RIFF....WEBP (ASCII)
    if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
      const ascii = (start: number) =>
        String.fromCharCode(bytes[start], bytes[start + 1], bytes[start + 2], bytes[start + 3])
      if (ascii(8) === 'WEBP') return 'image/webp'
    }
  } catch {
    // ignore
  }

  return 'image/jpeg'
}

function base64ToDataUrl(base64: string): string {
  let normalized = base64.trim().replace(/\s/g, '').replace(/^data:[^,]+,/, '')
  // Convert base64url -> standard base64.
  normalized = normalized.replace(/-/g, '+').replace(/_/g, '/')
  const mime = detectImageMimeFromBase64(normalized)
  return `data:${mime};base64,${normalized}`
}

function getEmployeePhotoUrl(row: Record<string, unknown>): string | undefined {
  const raw =
    row.Emp_photo ??
    row.emp_photo ??
    row.Emp_image ??
    row.emp_image ??
    row.Emp_img ??
    row.emp_img ??
    row.Emp_avatar ??
    row.emp_avatar ??
    row.photoUrl ??
    row.photo_url ??
    row.avatarUrl ??
    row.avatar_url ??
    row.imageUrl ??
    row.image_url ??
    row.picture ??
    row.image ??
    row.photo ??
    row.profile_picture ??
    row.profilePicture ??
    row.Emp_imageBase64 ??
    row.emp_imageBase64 ??
    row.Emp_imagebase64 ??
    row.empImageBase64 ??
    row.Emp_image_base64 ??
    row.emp_image_base64

  function bytesToBase64(bytes: Uint8Array): string {
    let binary = ''
    const chunkSize = 0x8000
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const sub = bytes.subarray(i, i + chunkSize)
      binary += String.fromCharCode(...sub)
    }
    return btoa(binary)
  }

  function base64FromBufferLike(v: unknown): string | undefined {
    // Sequelize sometimes returns BLOB as a Buffer-like object:
    // { type: 'Buffer', data: [...] } or directly as an array/typed array.
    if (v == null) return undefined

    if (typeof v === 'object') {
      const maybe = v as Record<string, unknown>
      const type = maybe.type
      const data = maybe.data
      if (type === 'Buffer' && Array.isArray(data)) {
        const bytes = new Uint8Array(data as number[])
        return bytesToBase64(bytes)
      }
      if (Array.isArray(data)) {
        const bytes = new Uint8Array(data as number[])
        return bytesToBase64(bytes)
      }
      // If it's already a typed array, handle it.
      if (v instanceof Uint8Array) return bytesToBase64(v)
    }

    if (Array.isArray(v)) {
      const bytes = new Uint8Array(v)
      return bytesToBase64(bytes)
    }

    return undefined
  }

  if (typeof raw !== 'string') {
    // Fallback: some backends may return different capitalization for the base64 column.
    for (const [k, v] of Object.entries(row)) {
      if (typeof v !== 'string') {
        // Try Buffer-like conversion for image payloads.
        if (/image.*base64/i.test(k)) {
          const b64 = base64FromBufferLike(v)
          if (b64) return base64ToDataUrl(b64)
        }
        continue
      }
      if (!/image.*base64/i.test(k)) continue
      const candidate = v.trim()
      if (candidate) {
        if (isLikelyBase64(candidate)) return base64ToDataUrl(candidate)
        // If it's already a data url, return it as-is.
        if (candidate.startsWith('data:')) return candidate
        return candidate
      }
    }
    return undefined
  }
  const s = raw.trim()
  if (!s.length) return undefined

  // If we already store as a data URL, we can render directly.
  if (s.startsWith('data:')) return s

  // If backend stored raw base64 only, convert to a safe data URL for rendering.
  if (isLikelyBase64(s)) return base64ToDataUrl(s)

  // Otherwise return as-is (could be an external URL).
  return s
}

function mapBackendEmployee(row: Record<string, unknown>, roleOptions?: RoleOption[]): Employee {
  const empId = Number(row.Emp_ID ?? row.emp_ID ?? row.id ?? 0)
  const accIdRaw = row.acc_ID ?? row.accId ?? row.account_id
  const accIdNum = Number(accIdRaw)
  const fname = (row.Emp_fname ?? row.emp_fname ?? '') as string
  const mname = (row.Emp_mname ?? row.emp_mname ?? '') as string
  const lname = (row.Emp_lname ?? row.emp_lname ?? '') as string
  const name = [fname, mname, lname].filter(Boolean).join(' ').trim() || '—'
  const includedRole = getIncludedRoleName(row)
  const photoUrl = getEmployeePhotoUrl(row)
  const roleRaw = row.Emp_role ?? row.emp_role
  const roleId = typeof roleRaw === 'number' ? roleRaw : parseInt(String(roleRaw ?? 0), 10)
  const roleFromDb = roleOptions?.find((r) => r.role_ID === roleId)?.role_name
  const role =
    includedRole ??
    roleFromDb ??
    EMP_ROLE_LABELS[roleId] ??
    (roleId ? `Role ${roleId}` : (row.role as string) ?? '')
  const addressId = row.Emp_AddressID != null ? Number(row.Emp_AddressID) : undefined
  const addressFromJoin = getAddressLineFromEmployeeRow(row)
  return {
    id: empId,
    accId: Number.isFinite(accIdNum) && accIdNum > 0 ? accIdNum : undefined,
    name,
    email: (row.Emp_email ?? row.emp_email ?? row.email ?? '') as string,
    role,
    status: 'Active',
    password: (row.password as string) ?? undefined,
    address:
      addressFromJoin ||
      ((row.Emp_address ?? row.emp_address ?? row.address ?? '') as string) ||
      '',
    contact: (row.Emp_cnum ?? row.emp_cnum ?? row.contact ?? row.phone ?? '') as string,
    photoUrl,
    addressId: Number.isFinite(addressId) && (addressId as number) > 0 ? addressId : undefined,
  }
}

function toEmployee(d: EmployeeDto & { address?: string; contact?: string; photoUrl?: string }): Employee {
  return {
    id: d.id,
    name: d.name,
    email: d.email,
    role: d.role,
    status: d.status ?? 'Active',
    password: d.password,
    address: d.address,
    contact: d.contact,
    photoUrl: d.photoUrl,
  }
}

function normalizeRow(row: unknown, roleOptions?: RoleOption[]): Employee {
  if (row != null && typeof row === 'object' && !Array.isArray(row)) {
    const r = row as Record<string, unknown>
    if (r.Emp_ID != null || r.emp_ID != null || r.Emp_fname != null || r.emp_fname != null) {
      return mapBackendEmployee(r, roleOptions)
    }
    return toEmployee({
      id: Number(r.id ?? 0),
      name: String(r.name ?? ''),
      email: String(r.email ?? ''),
      role: String(r.role ?? ''),
      status: (r.status as 'Active' | 'Inactive') ?? 'Active',
      password: r.password != null ? String(r.password) : undefined,
      address: r.address != null ? String(r.address) : undefined,
      contact: r.contact != null ? String(r.contact) : undefined,
      photoUrl: getEmployeePhotoUrl(r),
    })
  }
  return toEmployee(row as EmployeeDto)
}

let _cachedEmpFetchPath: string | null = null

async function tryFetchEmployeesAt(path: string, roleOptions?: RoleOption[]): Promise<Employee[] | null> {
  try {
    const data = await apiRequest<unknown>(path, { portal: { suppressFailureLog: true } })
    const list = Array.isArray(data) ? data : (data as { data?: unknown[] })?.data
    if (!Array.isArray(list)) return null
    const mapped = list.map((row) => normalizeRow(row, roleOptions))
    // Some backends can return duplicate rows due to joins; ensure stable UI by deduping.
    // Prefer `id` (when valid). If `id` is missing/invalid, fall back to email+role (and name as last resort).
    const byKey = new Map<string, Employee>()
    for (const emp of mapped) {
      const id = Number(emp.id)
      const email = String(emp.email ?? '').trim().toLowerCase()
      const name = String(emp.name ?? '').trim().toLowerCase()
      const role = String(emp.role ?? '').trim().toLowerCase()

      const key =
        Number.isFinite(id) && id > 0
          ? `id:${id}`
          : email
            ? `email:${email}|role:${role}`
            : `name:${name}|role:${role}`

      if (!byKey.has(key)) byKey.set(key, emp)
    }

    // Preserve original order as much as possible (first occurrence wins).
    return Array.from(byKey.values())
  } catch {
    return null
  }
}

export async function fetchEmployees(roleOptions?: RoleOption[]): Promise<Employee[]> {
  const paths = ['/employees/get/employees', '/get/employees', '/employees']

  // Fast path: reuse the endpoint that worked last time
  if (_cachedEmpFetchPath) {
    const emps = await tryFetchEmployeesAt(_cachedEmpFetchPath, roleOptions)
    if (emps) return emps
    _cachedEmpFetchPath = null
  }

  // Fire all paths in parallel — first success wins
  try {
    return await Promise.any(
      paths.map(async (p) => {
        const emps = await tryFetchEmployeesAt(p, roleOptions)
        if (!emps) throw new Error('no data')
        _cachedEmpFetchPath = p
        return emps
      }),
    )
  } catch {
    return []
  }
}

type EmployeeCreateInput = {
  fname: string
  mname?: string
  lname: string
  email: string
  roleName: string
  roleId?: number
  contact?: string
  address?: string
  password?: string
  /**
   * Stored in Sequelize column `Emp_imageBase64`.
   * Frontend should send a data URL or raw base64.
   */
  empImageBase64?: string | null
  /** Existing Address row PK when you already have Emp_AddressID */
  empAddressId?: number
  accId?: number
}

function attachLocationFieldsToBody(body: Record<string, unknown>, addressPayload?: CustomerAddressPayload): void {
  if (!addressPayload) return
  const { latitude, longitude, street, municipality, province, postal } = addressPayload
  body.latitude = latitude
  body.longitude = longitude
  body.street = street
  body.municipality = municipality
  body.province = province
  body.postal = postal
  body.Addrss_lat = latitude ?? null
  body.Addrss_long = longitude ?? null
  body.Addrss_street = street ?? ''
  body.Addrss_municipality = municipality ?? ''
  body.Addrss_province = province ?? ''
  body.Addrss_postal = postal ?? ''
}

function defaultEmpAddressId(): number | undefined {
  const n = parseInt(String(import.meta.env.VITE_DEFAULT_EMP_ADDRESS_ID ?? ''), 10)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

function defaultAccId(): number | undefined {
  const n = parseInt(String(import.meta.env.VITE_DEFAULT_ACC_ID ?? ''), 10)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

/** Try to create an Address row (same JSON shapes as customer/supplier) and return Addrss_ID. */
async function tryCreateAddressRow(payload: CustomerAddressPayload): Promise<number | null> {
  const body: Record<string, unknown> = {
    latitude: payload.latitude,
    longitude: payload.longitude,
    street: payload.street,
    municipality: payload.municipality,
    province: payload.province,
    postal: payload.postal,
    Addrss_lat: payload.latitude ?? null,
    Addrss_long: payload.longitude ?? null,
    Addrss_street: payload.street ?? '',
    Addrss_municipality: payload.municipality ?? '',
    Addrss_province: payload.province ?? '',
    Addrss_postal: payload.postal ?? '',
  }
  const paths = ['/addresses/add/address', '/addresses/add/addresses', '/address/add/address', '/api/addresses']
  for (const path of paths) {
    try {
      const res = await apiRequest<unknown>(path, { method: 'POST', body: JSON.stringify(body) })
      if (res == null || typeof res !== 'object' || Array.isArray(res)) continue
      const r = res as Record<string, unknown>
      const inner = (r.data ?? r.address ?? r) as Record<string, unknown>
      const id = Number(inner.Addrss_ID ?? inner.addrss_ID ?? r.Addrss_ID ?? inner.id ?? 0)
      if (id > 0) return id
    } catch {
      continue
    }
  }
  return null
}

async function resolveEmpAddressIdForCreate(
  input: EmployeeCreateInput,
  addressPayload?: CustomerAddressPayload,
): Promise<number | undefined> {
  if (input.empAddressId != null && input.empAddressId > 0) return input.empAddressId
  if (addressPayload) {
    const id = await tryCreateAddressRow(addressPayload)
    if (id != null && id > 0) return id
  }
  return defaultEmpAddressId()
}

async function resolveEmpAddressIdForUpdate(
  input: EmployeeUpdateInput,
  addressPayload?: CustomerAddressPayload,
): Promise<number | undefined> {
  if (addressPayload) {
    const id = await tryCreateAddressRow(addressPayload)
    if (id != null && id > 0) return id
  }
  if (input.empAddressId != null && input.empAddressId > 0) return input.empAddressId
  return defaultEmpAddressId()
}

/**
 * Express employee routes expect: Emp_fname, Emp_lname, Emp_mname?, Emp_cnum?, Emp_email?,
 * Emp_AddressID (required), Emp_role, acc_ID on create (matches Sequelize model).
 */
function employeeToExpressPayload(
  input: EmployeeCreateInput,
  empAddressId: number,
  opts: { accId?: number },
): Record<string, unknown> {
  const roleValue = typeof input.roleId === 'number' && input.roleId > 0 ? input.roleId : input.roleName
  const out: Record<string, unknown> = {
    Emp_fname: input.fname,
    Emp_lname: input.lname,
    Emp_email: input.email,
    Emp_AddressID: empAddressId,
    Emp_role: roleValue,
  }
  if (input.mname != null && String(input.mname).trim()) out.Emp_mname = input.mname
  if (input.contact) out.Emp_cnum = input.contact
  if (input.empImageBase64 !== undefined) {
    out.Emp_imageBase64 = input.empImageBase64
    out.empImageBase64 = input.empImageBase64
  }
  if (opts.accId != null) out.acc_ID = opts.accId
  return out
}

export type EmployeeUpdateInput = Omit<EmployeeCreateInput, 'empAddressId'> & {
  id: number
  accId?: number
  status?: 'Active' | 'Inactive'
  /** Current Emp_AddressID when editing without changing map */
  empAddressId?: number
}

function employeeUpdateToExpressPayload(
  input: EmployeeUpdateInput,
  empAddressId: number,
): Record<string, unknown> {
  const roleValue = typeof input.roleId === 'number' && input.roleId > 0 ? input.roleId : input.roleName
  const out: Record<string, unknown> = {
    Emp_fname: input.fname,
    Emp_lname: input.lname,
    Emp_email: input.email,
    Emp_AddressID: empAddressId,
    Emp_role: roleValue,
  }
  if (input.mname != null && String(input.mname).trim()) out.Emp_mname = input.mname
  if (input.contact) out.Emp_cnum = input.contact
  if (input.empImageBase64 !== undefined) {
    out.Emp_imageBase64 = input.empImageBase64
    out.empImageBase64 = input.empImageBase64
  }
  if (input.accId != null && Number.isFinite(input.accId) && input.accId > 0) out.acc_ID = input.accId
  return out
}

function buildFallbackEmployeeFromUpdate(
  id: number,
  input: EmployeeUpdateInput,
  empAddressId: number,
  roleOptions?: RoleOption[],
): Employee {
  const row: Record<string, unknown> = {
    Emp_ID: id,
    Emp_fname: input.fname,
    Emp_mname: input.mname ?? '',
    Emp_lname: input.lname,
    Emp_email: input.email.trim(),
    Emp_cnum: input.contact ?? '',
    Emp_AddressID: empAddressId,
  }
  if (input.empImageBase64 != null && String(input.empImageBase64).trim()) row.Emp_imageBase64 = input.empImageBase64
  const matched = roleOptions?.find((r) => r.role_name === input.roleName)
  const roleId = input.roleId ?? matched?.role_ID
  if (typeof roleId === 'number' && roleId > 0) row.Emp_role = roleId
  else row.Emp_role = input.roleName
  const emp = mapBackendEmployee(row, roleOptions)
  emp.status = input.status ?? emp.status
  emp.address = input.address?.trim() || emp.address
  if (input.password) emp.password = input.password
  return emp
}

function mergeStatusPassword(emp: Employee, input: EmployeeUpdateInput): Employee {
  return {
    ...emp,
    status: input.status ?? emp.status,
    ...(input.password ? { password: input.password } : {}),
  }
}

function pickEmployeeRowFromResponse(res: Record<string, unknown>, roleOptions?: RoleOption[]): Employee | null {
  const data = res.data
  if (data != null && typeof data === 'object' && !Array.isArray(data)) {
    const d = data as Record<string, unknown>
    const nested = d.employee ?? d.Employee ?? d.data
    if (nested != null && typeof nested === 'object' && !Array.isArray(nested)) {
      return normalizeRow(nested, roleOptions)
    }
    if (d.Emp_ID != null || d.emp_ID != null || d.Emp_fname != null || d.emp_fname != null) {
      return normalizeRow(d, roleOptions)
    }
  }
  const row = res.employee ?? res.Employee ?? res.data
  if (row != null && typeof row === 'object' && !Array.isArray(row)) {
    return normalizeRow(row, roleOptions)
  }
  if (res.Emp_ID != null || res.emp_ID != null || res.Emp_fname != null || res.emp_fname != null) {
    return normalizeRow(res, roleOptions)
  }
  return null
}

async function tryUpdateEmployeeAtPath(
  path: string,
  body: Record<string, unknown>,
  id: number,
  roleOptions: RoleOption[] | undefined,
  method: 'PUT' | 'PATCH',
  input: EmployeeUpdateInput,
  empAddressId: number,
): Promise<Employee | null> {
  try {
    const res = await apiRequest<unknown>(path, { method, body: JSON.stringify(body) })
    if (res != null && typeof res === 'object' && !Array.isArray(res)) {
      const parsed = pickEmployeeRowFromResponse(res as Record<string, unknown>, roleOptions)
      if (parsed) return parsed
    }
    if (res === undefined) return buildFallbackEmployeeFromUpdate(id, input, empAddressId, roleOptions)
    return null
  } catch {
    return null
  }
}

/**
 * Updates an employee via common Express route shapes. Tries PUT then PATCH per path.
 */
export async function updateEmployee(
  input: EmployeeUpdateInput,
  roleOptions?: RoleOption[],
  addressPayload?: CustomerAddressPayload,
): Promise<Employee | null> {
  const id = Number(input.id)
  const trimmedEmail = input.email.trim()
  if (!Number.isFinite(id) || id < 1 || !trimmedEmail) return null

  const empAddressIdResolved = await resolveEmpAddressIdForUpdate({ ...input, email: trimmedEmail }, addressPayload)
  if (!empAddressIdResolved || empAddressIdResolved < 1) {
    console.warn('[Portal] Employee update needs Emp_AddressID (map pin / env / existing row)')
    return null
  }

  const payload = employeeUpdateToExpressPayload({ ...input, email: trimmedEmail }, empAddressIdResolved)
  attachLocationFieldsToBody(payload, addressPayload)
  const paths = [
    `/employees/update/employee/${id}`,
    `/update/employee/${id}`,
    `/employees/update/employees/${id}`,
    `/employee/update/employee/${id}`,
    `/employees/update/${id}`,
    `/employees/employee/${id}`,
    `/employees/${id}`,
  ]

  if (hasApiBase()) {
    for (const path of paths) {
      let updated = await tryUpdateEmployeeAtPath(
        path,
        payload,
        id,
        roleOptions,
        'PUT',
        { ...input, email: trimmedEmail },
        empAddressIdResolved,
      )
      if (updated) return mergeStatusPassword(updated, input)
      updated = await tryUpdateEmployeeAtPath(
        path,
        payload,
        id,
        roleOptions,
        'PATCH',
        { ...input, email: trimmedEmail },
        empAddressIdResolved,
      )
      if (updated) return mergeStatusPassword(updated, input)
    }
  }

  const localBody: Record<string, unknown> = {
    ...payload,
    id,
    name: [input.fname, input.mname, input.lname].filter(Boolean).join(' ').trim(),
    email: trimmedEmail,
    role: input.roleName,
    contact: input.contact,
    address: input.address,
    status: input.status,
  }
  attachLocationFieldsToBody(localBody, addressPayload)
  let local = await tryUpdateEmployeeAtPath(
    `/api/employees/${id}`,
    localBody,
    id,
    roleOptions,
    'PUT',
    { ...input, email: trimmedEmail },
    empAddressIdResolved,
  )
  if (local) return mergeStatusPassword(local, input)
  local = await tryUpdateEmployeeAtPath(
    `/api/employees/${id}`,
    localBody,
    id,
    roleOptions,
    'PATCH',
    { ...input, email: trimmedEmail },
    empAddressIdResolved,
  )
  if (local) return mergeStatusPassword(local, input)

  return null
}

async function tryCreateEmployeeAtPath(
  path: string,
  body: Record<string, unknown>,
  roleOptions?: RoleOption[],
): Promise<Employee | null> {
  try {
    const res = await apiRequest<unknown>(path, { method: 'POST', body: JSON.stringify(body) })
    if (res != null && typeof res === 'object' && !Array.isArray(res)) {
      const parsed = pickEmployeeRowFromResponse(res as Record<string, unknown>, roleOptions)
      if (parsed) return parsed
    }
    return null
  } catch {
    return null
  }
}

export async function createEmployee(
  input: EmployeeCreateInput,
  roleOptions?: RoleOption[],
  addressPayload?: CustomerAddressPayload,
): Promise<Employee | null> {
  const trimmedEmail = input.email.trim()
  const trimmedName = input.fname.trim() || input.lname.trim()
  if (!trimmedEmail || !trimmedName) return null

  const empAddressId = await resolveEmpAddressIdForCreate(input, addressPayload)
  if (!empAddressId || empAddressId < 1) {
    console.warn(
      '[Portal] Employee create needs Emp_AddressID: create an Address row (API), use map + /addresses, or set VITE_DEFAULT_EMP_ADDRESS_ID in .env',
    )
    return null
  }

  const accId = input.accId ?? defaultAccId()
  const payload = employeeToExpressPayload(input, empAddressId, accId != null ? { accId } : {})
  attachLocationFieldsToBody(payload, addressPayload)

  if (hasApiBase()) {
    const primary = await tryCreateEmployeeAtPath('/employees/add/employee', payload, roleOptions)
    if (primary) return primary
    const rootPrimary = await tryCreateEmployeeAtPath('/add/employee', payload, roleOptions)
    if (rootPrimary) return rootPrimary
    const alt = await tryCreateEmployeeAtPath('/employees/add/employees', payload, roleOptions)
    if (alt) return alt
    const rootAlt = await tryCreateEmployeeAtPath('/add/employees', payload, roleOptions)
    if (rootAlt) return rootAlt
  }

  const localBody: Record<string, unknown> = {
    name: [input.fname, input.mname, input.lname].filter(Boolean).join(' '),
    email: trimmedEmail,
    role: input.roleName,
    contact: input.contact,
    address: input.address,
    password: input.password,
    Emp_fname: input.fname,
    Emp_lname: input.lname,
    Emp_email: trimmedEmail,
    Emp_AddressID: empAddressId,
    Emp_role: typeof input.roleId === 'number' && input.roleId > 0 ? input.roleId : input.roleName,
    ...(input.empImageBase64 !== undefined ? { Emp_imageBase64: input.empImageBase64, empImageBase64: input.empImageBase64 } : {}),
    ...(accId != null ? { acc_ID: accId } : {}),
  }
  attachLocationFieldsToBody(localBody, addressPayload)
  const local = await tryCreateEmployeeAtPath('/employees', localBody, roleOptions)
  return local
}

export async function deleteEmployee(id: number): Promise<boolean> {
  const n = Number(id)
  if (!Number.isFinite(n) || n < 1) return false
  const paths = [
    `/employees/delete/employee/${n}`,
    `/employees/delete/employees/${n}`,
    `/employees/${n}`,
    `/api/employees/${n}`,
  ]
  for (const path of paths) {
    try {
      await apiRequest(path, { method: 'DELETE' })
      return true
    } catch {
      continue
    }
  }
  return false
}
