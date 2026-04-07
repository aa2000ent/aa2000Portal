import type { SessionLookupResponse } from '../api/session'

export type PortalProfileCredentials = {
  fullName: string
  email: string
  phone: string
  username: string
  accountId: string
  roleName: string
  accountStatus: string
  sessionCreatedAt: string | null
}

function employeeFullName(e: Record<string, unknown> | null): string {
  if (!e) return ''
  const fn = String(e.Emp_fname ?? e.emp_fname ?? '').trim()
  const mn = String(e.Emp_mname ?? e.emp_mname ?? '').trim()
  const ln = String(e.Emp_lname ?? e.emp_lname ?? '').trim()
  return [fn, mn, ln].filter(Boolean).join(' ')
}

function employeeEmail(e: Record<string, unknown> | null): string {
  if (!e) return ''
  return String(e.Emp_email ?? e.emp_email ?? '').trim()
}

function employeePhone(e: Record<string, unknown> | null): string {
  if (!e) return ''
  return String(e.Emp_cnum ?? e.emp_cnum ?? '').trim()
}

/** Map Express `/session/:sessionToken` JSON into profile form fields. */
export function mapSessionLookupToProfile(data: SessionLookupResponse): PortalProfileCredentials {
  const e = data.employee
  const fullName = employeeFullName(e)
  const email = employeeEmail(e)
  const phone = employeePhone(e)
  const username = String(data.account?.username ?? '').trim()

  return {
    fullName: fullName || username || '—',
    email: email || '—',
    phone: phone || '—',
    username: username || '—',
    accountId: String(data.account?.acc_ID ?? ''),
    roleName: String(data.account?.role_name ?? '').trim() || '—',
    accountStatus: String(data.account?.status ?? '').trim() || '—',
    sessionCreatedAt: data.session?.createdAt ?? null,
  }
}
