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

function getIncludedRoleName(row: Record<string, unknown>): string | undefined {
  const roleObj = row.Role ?? row.role
  if (roleObj != null && typeof roleObj === 'object' && !Array.isArray(roleObj)) {
    const r = roleObj as Record<string, unknown>
    const name = r.r_name ?? r.r_Name ?? r.role_name ?? r.role_Name
    if (typeof name === 'string' && name.trim()) return name.trim()
  }
  return undefined
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
    row.profilePicture
  if (typeof raw !== 'string') return undefined
  const s = raw.trim()
  return s.length ? s : undefined
}

function mapBackendEmployee(row: Record<string, unknown>, roleOptions?: RoleOption[]): Employee {
  const empId = Number(row.Emp_ID ?? row.emp_ID ?? row.id ?? 0)
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
  return {
    id: empId,
    name,
    email: (row.Emp_email ?? row.emp_email ?? row.email ?? '') as string,
    role,
    status: 'Active',
    password: (row.password as string) ?? undefined,
    address: (row.Emp_address ?? row.emp_address ?? row.address ?? '') as string,
    contact: (row.Emp_cnum ?? row.emp_cnum ?? row.contact ?? row.phone ?? '') as string,
    photoUrl,
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

export async function fetchEmployees(roleOptions?: RoleOption[]): Promise<Employee[]> {
  const paths = ['/employees/get/employees', '/employees']
  for (const path of paths) {
    try {
      const data = await apiRequest<unknown>(path)
      const list = Array.isArray(data) ? data : (data as { data?: unknown[] })?.data
      if (!Array.isArray(list)) continue
      return list.map((row) => normalizeRow(row, roleOptions))
    } catch {
      continue
    }
  }
  return []
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
  // Sequelize Address model (same pattern as suppliers / backend examples)
  body.Addrss_lat = latitude ?? null
  body.Addrss_long = longitude ?? null
  body.Addrss_street = street ?? ''
  body.Addrss_municipality = municipality ?? ''
  body.Addrss_province = province ?? ''
  body.Addrss_postal = postal ?? ''
}

function employeeToBackendPayload(input: EmployeeCreateInput): Record<string, unknown> {
  const roleValue = typeof input.roleId === 'number' && input.roleId > 0 ? input.roleId : input.roleName
  const out: Record<string, unknown> = {
    Emp_fname: input.fname,
    Emp_lname: input.lname,
    Emp_email: input.email,
    Emp_role: roleValue,
  }
  if (input.mname) out.Emp_mname = input.mname
  if (input.contact) out.Emp_cnum = input.contact
  if (input.address) out.Emp_address = input.address
  if (input.password) out.password = input.password
  return out
}

export type EmployeeUpdateInput = EmployeeCreateInput & {
  id: number
  status?: 'Active' | 'Inactive'
}

function employeeUpdateToPayload(input: EmployeeUpdateInput): Record<string, unknown> {
  return {
    ...employeeToBackendPayload(input),
    Emp_ID: input.id,
    emp_ID: input.id,
  }
}

function buildFallbackEmployeeFromUpdate(id: number, input: EmployeeUpdateInput, roleOptions?: RoleOption[]): Employee {
  const row: Record<string, unknown> = {
    Emp_ID: id,
    Emp_fname: input.fname,
    Emp_mname: input.mname ?? '',
    Emp_lname: input.lname,
    Emp_email: input.email.trim(),
    Emp_cnum: input.contact ?? '',
    Emp_address: input.address ?? '',
  }
  const matched = roleOptions?.find((r) => r.role_name === input.roleName)
  const roleId = input.roleId ?? matched?.role_ID
  if (typeof roleId === 'number' && roleId > 0) row.Emp_role = roleId
  else row.Emp_role = input.roleName
  const emp = mapBackendEmployee(row, roleOptions)
  emp.status = input.status ?? emp.status
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
): Promise<Employee | null> {
  try {
    const res = await apiRequest<unknown>(path, { method, body: JSON.stringify(body) })
    if (res != null && typeof res === 'object' && !Array.isArray(res)) {
      const parsed = pickEmployeeRowFromResponse(res as Record<string, unknown>, roleOptions)
      if (parsed) return parsed
    }
    if (res === undefined) return buildFallbackEmployeeFromUpdate(id, input, roleOptions)
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

  const payload = employeeUpdateToPayload({ ...input, email: trimmedEmail })
  attachLocationFieldsToBody(payload, addressPayload)
  const paths = [
    `/employees/update/employee/${id}`,
    `/employees/update/employees/${id}`,
    `/employee/update/employee/${id}`,
    `/employees/update/${id}`,
    `/employees/employee/${id}`,
    `/employees/${id}`,
  ]

  if (hasApiBase()) {
    for (const path of paths) {
      let updated = await tryUpdateEmployeeAtPath(path, payload, id, roleOptions, 'PUT', input)
      if (updated) return mergeStatusPassword(updated, input)
      updated = await tryUpdateEmployeeAtPath(path, payload, id, roleOptions, 'PATCH', input)
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
  let local = await tryUpdateEmployeeAtPath(`/api/employees/${id}`, localBody, id, roleOptions, 'PUT', input)
  if (local) return mergeStatusPassword(local, input)
  local = await tryUpdateEmployeeAtPath(`/api/employees/${id}`, localBody, id, roleOptions, 'PATCH', input)
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

  const payload = employeeToBackendPayload(input)
  attachLocationFieldsToBody(payload, addressPayload)

  if (hasApiBase()) {
    const primary = await tryCreateEmployeeAtPath('/employees/add/employee', payload, roleOptions)
    if (primary) return primary
    const alt = await tryCreateEmployeeAtPath('/employees/add/employees', payload, roleOptions)
    if (alt) return alt
  }

  // Local API or generic fallback (no external base / last resort)
  const localBody: Record<string, unknown> = {
    name: [input.fname, input.mname, input.lname].filter(Boolean).join(' '),
    email: trimmedEmail,
    role: input.roleName,
    contact: input.contact,
    address: input.address,
    password: input.password,
  }
  attachLocationFieldsToBody(localBody, addressPayload)
  const local = await tryCreateEmployeeAtPath('/employees', localBody, roleOptions)
  return local
}
