import { apiRequest } from './client'
import { isConfiguredForExternalApi } from './config'

export interface Customer {
  id: number
  name: string
  email: string
  phone: string
  address: string
  fname?: string
  mname?: string
  lname?: string
  addressId?: number
  createdAt?: string
}

export interface CustomerAddressPayload {
  latitude: number
  longitude: number
  street: string
  municipality: string
  province: string
  postal: string
}

function getAddressFromRow(row: Record<string, unknown>): string {
  const addr = row.Address as Record<string, unknown> | undefined
  if (addr && typeof addr === 'object' && !Array.isArray(addr)) {
    const parts = [
      addr.Addrss_street ?? addr.addrss_street ?? addr.street,
      addr.Addrss_municipality ?? addr.addrss_municipality ?? addr.municipality ?? addr.city,
      addr.Addrss_province ?? addr.addrss_province ?? addr.province ?? addr.state,
      addr.Addrss_postal ?? addr.addrss_postal ?? addr.postal ?? addr.postcode,
    ].filter(Boolean).map(String)
    if (parts.length) return parts.join(', ')
  }
  const raw = row.address ?? row.Address
  if (typeof raw === 'string' && raw.trim()) return raw.trim()
  return ''
}

export function mapBackendCustomer(row: Record<string, unknown>): Customer {
  const id = Number(row.cus_ID ?? row.cus_id ?? row.id ?? 0)
  const fname = String(row.cus_fname ?? row.cus_Fname ?? row.fname ?? '').trim()
  const mname = String(row.cus_mname ?? row.cus_Mname ?? row.mname ?? '').trim()
  const lname = String(row.cus_lname ?? row.cus_Lname ?? row.lname ?? '').trim()
  const name = [fname, mname, lname].filter(Boolean).join(' ').trim() || '—'
  return {
    id,
    name,
    fname: fname || undefined,
    mname: mname || undefined,
    lname: lname || undefined,
    email: String(row.cus_email ?? row.cus_Email ?? row.email ?? '').trim(),
    phone: String(row.cus_cnum ?? row.cus_Cnum ?? row.c_num ?? row.phone ?? '').trim(),
    addressId: row.cus_AddressID != null ? Number(row.cus_AddressID) : undefined,
    address: getAddressFromRow(row) || (row.address as string) || '',
    createdAt: row.createdAt != null ? String(row.createdAt) : undefined,
  }
}

export function customerToBackendPayload(customer: Partial<Customer>, forUpdateId?: number): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (forUpdateId != null) out.cus_ID = forUpdateId
  if (customer.fname != null) out.cus_fname = customer.fname
  if (customer.mname != null) out.cus_mname = customer.mname
  if (customer.lname != null) out.cus_lname = customer.lname
  if (customer.email != null) out.cus_email = customer.email
  if (customer.phone != null) out.cus_cnum = customer.phone
  if (customer.addressId != null) out.cus_AddressID = customer.addressId
  return out
}

export async function fetchCustomers(): Promise<Customer[]> {
  try {
    const path = isConfiguredForExternalApi() ? '/customers/get/customers' : '/api/customers'
    const data = await apiRequest<unknown>(path)
    const list = Array.isArray(data) ? data : (data as { data?: unknown[] })?.data
    if (!Array.isArray(list)) return []
    return list.map((row) => {
      if (row != null && typeof row === 'object' && !Array.isArray(row)) {
        const r = row as Record<string, unknown>
        if (r.cus_ID != null || r.cus_fname != null || r.cus_email != null) return mapBackendCustomer(r)
        return mapBackendCustomer({ ...r, cus_ID: r.id, cus_fname: r.fname, cus_mname: r.mname, cus_lname: r.lname, cus_email: r.email, cus_cnum: r.phone, cus_AddressID: r.addressId, address: r.address })
      }
      return mapBackendCustomer({})
    })
  } catch {
    return []
  }
}

async function tryCreateAtPath(path: string, body: Record<string, unknown>): Promise<Customer | null> {
  try {
    const res = await apiRequest<unknown>(path, { method: 'POST', body: JSON.stringify(body) })
    if (res != null && typeof res === 'object' && !Array.isArray(res)) {
      const r = res as Record<string, unknown>
      const row = (r.customer ?? r.data ?? r) as Record<string, unknown>
      if (row && typeof row === 'object') return mapBackendCustomer(row)
    }
    return null
  } catch {
    return null
  }
}

export async function createCustomer(
  customer: Partial<Customer>,
  addressPayload?: CustomerAddressPayload
): Promise<Customer | null> {
  const name = [customer.fname, customer.mname, customer.lname].filter(Boolean).join(' ').trim() || customer.name || ''
  const payload: Record<string, unknown> = {
    fname: customer.fname ?? '',
    mname: customer.mname ?? '',
    lname: customer.lname ?? '',
    email: customer.email ?? '',
    c_num: customer.phone ?? '',
    address: customer.address ?? '',
    addressId: customer.addressId ?? 0,
    ...(addressPayload
      ? {
          latitude: addressPayload.latitude,
          longitude: addressPayload.longitude,
          street: addressPayload.street,
          municipality: addressPayload.municipality,
          province: addressPayload.province,
          postal: addressPayload.postal,
        }
      : {}),
  }
  if (isConfiguredForExternalApi()) {
    const created = await tryCreateAtPath('/customers/add/customer', { ...payload, role_ID: 0 })
    if (created) return created
    const created2 = await tryCreateAtPath('/customers/add/customers', customerToBackendPayload(customer))
    if (created2) return created2
  }
  const created = await tryCreateAtPath('/api/customers', {
    name,
    email: customer.email,
    phone: customer.phone,
    address: customer.address,
    fname: customer.fname,
    mname: customer.mname,
    lname: customer.lname,
    addressId: customer.addressId,
  })
  return created
}

function fallbackCustomerFromUpdate(id: number, body: Record<string, unknown>): Customer {
  return mapBackendCustomer({
    cus_ID: id,
    cus_fname: body.fname ?? body.cus_fname,
    cus_mname: body.mname ?? body.cus_mname,
    cus_lname: body.lname ?? body.cus_lname,
    cus_email: body.email ?? body.cus_email,
    cus_cnum: body.c_num ?? body.cus_cnum ?? body.phone,
    cus_AddressID: body.cus_AddressID ?? body.addressId,
    address: body.address,
  })
}

async function tryUpdateAtPath(
  path: string,
  body: Record<string, unknown>,
  id: number
): Promise<Customer | null> {
  try {
    const res = await apiRequest<unknown>(path, { method: 'PUT', body: JSON.stringify(body) })
    if (res != null && typeof res === 'object' && !Array.isArray(res)) {
      const r = res as Record<string, unknown>
      const row = (r.customer ?? r.data ?? r) as Record<string, unknown>
      if (row && typeof row === 'object') return mapBackendCustomer(row)
    }
    return fallbackCustomerFromUpdate(id, body)
  } catch {
    return null
  }
}

export async function updateCustomer(
  id: number,
  customer: Partial<Customer>,
  addressPayload?: CustomerAddressPayload
): Promise<Customer | null> {
  const body: Record<string, unknown> = {
    fname: customer.fname ?? '',
    mname: customer.mname ?? '',
    lname: customer.lname ?? '',
    email: customer.email ?? '',
    c_num: customer.phone ?? '',
    ...(addressPayload
      ? {
          latitude: addressPayload.latitude,
          longitude: addressPayload.longitude,
          street: addressPayload.street,
          municipality: addressPayload.municipality,
          province: addressPayload.province,
          postal: addressPayload.postal,
        }
      : {}),
  }
  const backendPayload = customerToBackendPayload(customer, id)
  const paths: [string, Record<string, unknown>][] = [
    [`/customers/update/customer/${id}`, body],
    [`/customers/customers/${id}`, backendPayload],
    [`/customers/update/customers/${id}`, backendPayload],
    [`/customers/update/${id}`, backendPayload],
    [`/customers/${id}`, backendPayload],
    [`/api/customers/${id}`, { ...customer }],
    [`/customer/update/${id}`, body],
    [`/customer/${id}`, backendPayload],
  ]
  if (isConfiguredForExternalApi()) {
    for (const [path, payload] of paths) {
      const updated = await tryUpdateAtPath(path, payload, id)
      if (updated) return updated
    }
    const updateAllPath = '/customers/update/customers'
    const updated = await tryUpdateAtPath(updateAllPath, { ...backendPayload, cus_ID: id }, id)
    if (updated) return updated
  }
  return tryUpdateAtPath(`/api/customers/${id}`, { ...customer }, id)
}

export async function deleteCustomer(id: number): Promise<boolean> {
  const paths = [
    `/customers/delete/customer/${id}`,
    `/customers/customers/${id}`,
    `/api/customers/${id}`,
  ]
  for (const path of paths) {
    try {
      await apiRequest(path, { method: 'DELETE' })
      return true
    } catch {
      // try next path
    }
  }
  return false
}
