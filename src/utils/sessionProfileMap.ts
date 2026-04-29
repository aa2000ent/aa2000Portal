import type { SessionLookupResponse } from '../api/session'
import {
  accountDisplayName,
  accountEmail,
  accountRoleLabel,
  accountUsername,
  employeeEmailFromRow,
  employeeFullNameFromRow,
  employeePhoneFromRow,
  employeeRoleLabelFromRow,
} from './sessionLookupFields'

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

/** Map Express `/session/:sessionToken` JSON into profile form fields. */
export function mapSessionLookupToProfile(data: SessionLookupResponse): PortalProfileCredentials {
  const e = data.employee
  const acc = data.account

  const fullName =
    employeeFullNameFromRow(e) || accountDisplayName(acc) || accountUsername(acc)
  const email = employeeEmailFromRow(e) || accountEmail(acc)
  const phone = employeePhoneFromRow(e)
  const username = accountUsername(acc)

  const roleName = accountRoleLabel(acc) || employeeRoleLabelFromRow(e)

  return {
    fullName: fullName || username || '—',
    email: email || '—',
    phone: phone || '—',
    username: username || '—',
    accountId: String(acc?.acc_ID ?? ''),
    roleName: roleName || '—',
    accountStatus: String(acc?.status ?? '').trim() || '—',
    sessionCreatedAt: data.session?.createdAt ?? null,
  }
}
