import { apiRequest } from './client'
import { isConfiguredForExternalApi } from './config'
import type { RoleOption } from './roles'
import type { Employee } from '../contexts/EmployeesContext'

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
  try {
    const path = isConfiguredForExternalApi() ? '/employees/get/employees' : '/employees'
    const data = await apiRequest<unknown>(path)
    const list = Array.isArray(data) ? data : (data as { data?: unknown[] })?.data
    if (!Array.isArray(list)) return []
    return list.map((row) => normalizeRow(row, roleOptions))
  } catch {
    return []
  }
}
