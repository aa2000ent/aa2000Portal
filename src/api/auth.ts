import { apiRequest, getSessionId, setSessionId } from './client'

export type LoginVerificationPayload = {
  username: string
  password: string
  s_name?: string
}

export type LoginVerificationResponse = {
  message: string
  account: {
    username: string
    role_ID: number
    status: string
  }
  session: string
  s_name?: string
}

export async function loginVerification(
  payload: LoginVerificationPayload
): Promise<LoginVerificationResponse> {
  const body: Record<string, string> = {
    username: payload.username,
    password: payload.password,
  }
  const existingSession = getSessionId()
  if (existingSession) body.s_name = existingSession
  const res = await apiRequest<LoginVerificationResponse>('/security/login/verification', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  if (res.s_name) setSessionId(res.s_name)
  return res
}

export function sessionToRoute(session: string): string {
  const s = (session || '').toLowerCase().trim()
  if (['admin', 'marketing', 'finance', 'engineering'].includes(s)) return s
  return 'admin'
}

export type RegisterPayload = {
  username: string
  password: string
  role_ID: number
  Emp_fname: string
  Emp_lname: string
  Emp_AddressID: number
  Emp_email?: string
  Emp_IDno?: string
  Emp_mname?: string
  Emp_cnum?: string
  Emp_role?: number
}

export type RegisterResponse = {
  message: string
  account?: { acc_ID: number; username: string; role_ID: number }
  employee?: Record<string, unknown>
}

export async function registerAccount(payload: RegisterPayload): Promise<RegisterResponse> {
  const body: Record<string, unknown> = {
    username: payload.username.trim(),
    password: payload.password,
    role_ID: payload.role_ID,
    Emp_fname: payload.Emp_fname.trim(),
    Emp_lname: payload.Emp_lname.trim(),
    Emp_AddressID: payload.Emp_AddressID,
  }
  if (payload.Emp_email != null && payload.Emp_email.trim() !== '') body.Emp_email = payload.Emp_email.trim()
  if (payload.Emp_IDno != null && payload.Emp_IDno.trim() !== '') body.Emp_IDno = payload.Emp_IDno.trim()
  if (payload.Emp_mname != null && payload.Emp_mname.trim() !== '') body.Emp_mname = payload.Emp_mname.trim()
  if (payload.Emp_cnum != null && payload.Emp_cnum.trim() !== '') body.Emp_cnum = payload.Emp_cnum.trim()
  if (payload.Emp_role != null) body.Emp_role = payload.Emp_role
  const res = await apiRequest<RegisterResponse>('/security/register', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return res
}
