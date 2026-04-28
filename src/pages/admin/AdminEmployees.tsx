import { useEffect, useState, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { leafletDefaultIcon } from '../../lib/leafletDefaultIcon'
import { MapPin, Crosshair, Pencil, Trash2, Plus, X } from 'lucide-react'
import { useRoles } from '../../contexts/RolesContext'
import { useActivityLog } from '../../contexts/ActivityLogContext'
import { useEmployees, type Employee, DEFAULT_PASSWORD } from '../../contexts/EmployeesContext'
import ConfirmDialog, { type ConfirmVariant } from '../../components/ConfirmDialog'
import CustomSelect from '../../components/CustomSelect'
import { reverseGeocode, searchPlaces } from '../../api/geo'
import { createEmployee, fetchEmployees, updateEmployee, deleteEmployee } from '../../api/employees'
import type { CustomerAddressPayload } from '../../api/customers'

const MIN_PER_PAGE = 1
const DEFAULT_LOCATION = { lat: 14.5995, lon: 120.9842 }
const MAP_TILE_VERSION = new Date().toISOString().slice(0, 10)
const MAP_TILE_URL = `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png?v=${MAP_TILE_VERSION}`
type LatLon = { lat: number; lon: number }

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const first = parts[0]?.[0] ?? ''
  const last = (parts.length > 1 ? parts[parts.length - 1]?.[0] : parts[0]?.[1]) ?? ''
  const out = (first + last).toUpperCase()
  return out.slice(0, 2) || '?'
}

function LocationPicker({ location, onChange }: { location: LatLon; onChange: (loc: LatLon) => void }) {
  const mapRef = useRef<HTMLDivElement | null>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)
  const markerRef = useRef<L.Marker | null>(null)

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return
    const map = L.map(mapRef.current).setView([location.lat, location.lon], 16)
    L.tileLayer(MAP_TILE_URL, {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map)
    const marker = L.marker([location.lat, location.lon], { draggable: true, icon: leafletDefaultIcon }).addTo(map)
    marker.on('dragend', () => {
      const pos = marker.getLatLng()
      onChange({ lat: pos.lat, lon: pos.lng })
    })
    map.on('click', (e: L.LeafletMouseEvent) => {
      marker.setLatLng(e.latlng)
      onChange({ lat: e.latlng.lat, lon: e.latlng.lng })
    })
    mapInstanceRef.current = map
    markerRef.current = marker
    return () => {
      map.remove()
      mapInstanceRef.current = null
      markerRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapInstanceRef.current
    const marker = markerRef.current
    if (!map || !marker) return
    const latLng = L.latLng(location.lat, location.lon)
    marker.setLatLng(latLng)
    map.panTo(latLng)
  }, [location.lat, location.lon])

  return (
    <div className="w-full h-96 rounded-lg overflow-hidden border border-slate-200 bg-slate-100">
      <div ref={mapRef} className="w-full h-full" />
    </div>
  )
}

const MAX_PER_PAGE = 500

export default function AdminEmployees() {
  const { roles, roleOptions, addRole, deleteRole, loading: rolesLoading } = useRoles()
  const { addEntry } = useActivityLog()
  const { employees, setEmployees } = useEmployees()
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('All roles')
  const [currentPage, setCurrentPage] = useState(1)
  const [perPage, setPerPage] = useState(10)

  const [addRoleOpen, setAddRoleOpen] = useState(false)
  const [addUserOpen, setAddUserOpen] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null)
  const [showAddPassword, setShowAddPassword] = useState(false)
  const [showEditPassword, setShowEditPassword] = useState(false)

  const [newRoleName, setNewRoleName] = useState('')
  const [addRoleBusy, setAddRoleBusy] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(false)
  const pendingPhotoPromiseRef = useRef<Promise<void> | null>(null)
  const pendingPhotoBase64ValueRef = useRef<string | undefined>(undefined)
  const pendingPhotoRemovedValueRef = useRef<boolean>(false)
  const [newUser, setNewUser] = useState<{
    fname: string
    mname: string
    lname: string
    email: string
    role: string
    status: 'Active' | 'Inactive'
    password: string
    address: string
    contact: string
    photoBase64?: string
    /** When editing, user can remove the existing photo */
    photoRemoved: boolean
  }>({
    fname: '',
    mname: '',
    lname: '',
    email: '',
    role: roles[0] ?? 'Admin',
    status: 'Active',
    password: DEFAULT_PASSWORD,
    address: '',
    contact: '',
    photoBase64: undefined,
    photoRemoved: false,
  })
  const [location, setLocation] = useState<LatLon | null>(DEFAULT_LOCATION)
  const [locLoading, setLocLoading] = useState(false)
  const [locError, setLocError] = useState<string | null>(null)
  const [locQuery, setLocQuery] = useState('')
  const [locResults, setLocResults] = useState<{ displayName: string; lat: number; lon: number }[]>([])
  const latestSearchSeqRef = useRef(0)
  const [addressParts, setAddressParts] = useState<{ street: string; municipality: string; province: string; postal: string } | null>(null)
  /** True after user moved pin / search / GPS so we send lat/lon even if reverse geocode has no street/city. */
  const [pinAdjusted, setPinAdjusted] = useState(false)

  const applyReverseGeocode = async (lat: number, lon: number) => {
    setPinAdjusted(true)
    try {
      const addr = await reverseGeocode(lat, lon)
      const street = addr.street ?? ''
      const municipality = addr.city ?? ''
      const province = addr.province ?? ''
      const postal = addr.postcode ?? ''
      setAddressParts({ street, municipality, province, postal })
      const pieces = [street, municipality, province, postal].filter(Boolean)
      if (pieces.length) {
        setNewUser((prev) => ({ ...prev, address: pieces.join(', ') }))
        return
      }
      setNewUser((prev) => ({ ...prev, address: `${lat.toFixed(5)}, ${lon.toFixed(5)}` }))
    } catch {
      setAddressParts(null)
      setNewUser((prev) => ({ ...prev, address: `${lat.toFixed(5)}, ${lon.toFixed(5)}` }))
    }
  }

  /**
   * Same contract as customer/supplier: lat/lon + structured fields for Address row + FK on employee.
   * If the pin moved (pinAdjusted) but geocode failed, still send coordinates and optional address line as street.
   */
  function getAddressPayload(): CustomerAddressPayload | undefined {
    const loc = location ?? DEFAULT_LOCATION
    const line = newUser.address.trim()
    const street = addressParts?.street ?? ''
    const municipality = addressParts?.municipality ?? ''
    const province = addressParts?.province ?? ''
    const postal = addressParts?.postal ?? ''
    if (street || municipality || province) {
      return {
        latitude: loc.lat,
        longitude: loc.lon,
        street,
        municipality,
        province,
        postal,
      }
    }
    if (pinAdjusted) {
      return {
        latitude: loc.lat,
        longitude: loc.lon,
        street: line || '',
        municipality: '',
        province: '',
        postal: '',
      }
    }
    // Even without map interaction, provide a minimal address payload
    // so backend can create/fetch Emp_AddressID and allow employee create.
    if (line) {
      return {
        latitude: loc.lat,
        longitude: loc.lon,
        street: line,
        municipality: '',
        province: '',
        postal: '',
      }
    }
    return undefined
  }

  const handleUseCurrentLocation = () => {
    if (!('geolocation' in navigator)) {
      setLocError('Location not supported in this browser.')
      return
    }
    setLocError(null)
    setLocLoading(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude
        const lon = pos.coords.longitude
        setLocation({ lat, lon })
        await applyReverseGeocode(lat, lon)
        setLocLoading(false)
      },
      (err) => {
        setLocError(err.message || 'Failed to get current location.')
        setLocLoading(false)
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  const handleRecenter = () => {
    setLocation((prev) => (prev ? { ...prev } : DEFAULT_LOCATION))
  }

  const handleSearchPlace = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const q = locQuery.trim()
    if (!q) {
      setLocResults([])
      setLocError(null)
      return
    }
    const searchSeq = ++latestSearchSeqRef.current
    setLocError(null)
    setLocLoading(true)
    try {
      const mapped = await searchPlaces(q)
      if (searchSeq !== latestSearchSeqRef.current) return
      setLocResults(mapped)
      if (!mapped.length) setLocError('No places found. Try a more specific search.')
    } catch (err) {
      if (searchSeq !== latestSearchSeqRef.current) return
      setLocError(err instanceof Error ? err.message : 'Failed to search for that place.')
      setLocResults([])
    } finally {
      if (searchSeq !== latestSearchSeqRef.current) return
      setLocLoading(false)
    }
  }

  // Auto-search as user types (debounced)
  useEffect(() => {
    const q = locQuery.trim()
    if (q.length < 2) {
      setLocResults([])
      setLocError(null)
      return
    }
    const t = setTimeout(() => {
      const searchSeq = ++latestSearchSeqRef.current
      setLocError(null)
      setLocLoading(true)
      searchPlaces(q)
        .then((mapped) => {
          if (searchSeq !== latestSearchSeqRef.current) return
          setLocResults(mapped)
          if (!mapped.length) setLocError('No places found. Try a more specific search.')
        })
        .catch((err) => {
          if (searchSeq !== latestSearchSeqRef.current) return
          setLocError(err instanceof Error ? err.message : 'Failed to search for that place.')
          setLocResults([])
        })
        .finally(() => {
          if (searchSeq !== latestSearchSeqRef.current) return
          setLocLoading(false)
        })
    }, 400)
    return () => clearTimeout(t)
  }, [locQuery])

  const [confirm, setConfirm] = useState<{
    open: boolean
    title: string
    message: string
    confirmLabel: string
    variant: ConfirmVariant
    onConfirm: () => void
  }>({ open: false, title: '', message: '', confirmLabel: '', variant: 'primary', onConfirm: () => {} })

  const [brokenPhotos, setBrokenPhotos] = useState<Record<number, boolean>>({})
  const editActivePhotoUrl = newUser.photoRemoved ? undefined : newUser.photoBase64 ?? editingEmployee?.photoUrl

  function fileToDataUrl(file: File): Promise<string> {
    // Compress/resize first to reduce base64 size (helps avoid backend truncation/body limits).
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const src = String(reader.result ?? '')
        if (!src) {
          reject(new Error('Empty image data'))
          return
        }

        const img = new Image()
        img.onload = () => {
          const maxDim = 200
          const w = img.width || 1
          const h = img.height || 1
          const scale = Math.min(1, maxDim / Math.max(w, h))
          const outW = Math.max(1, Math.round(w * scale))
          const outH = Math.max(1, Math.round(h * scale))

          const canvas = document.createElement('canvas')
          canvas.width = outW
          canvas.height = outH
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            reject(new Error('No canvas context'))
            return
          }

          ctx.drawImage(img, 0, 0, outW, outH)
          // JPEG is smaller than PNG for typical photos.
          const quality = 0.78
          const dataUrl = canvas.toDataURL('image/jpeg', quality)
          resolve(dataUrl)
        }
        img.onerror = () => reject(new Error('Failed to load image'))
        img.src = src
      }
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsDataURL(file)
    })
  }

  function toApiBase64(photo?: string, remove = false): string | null | undefined {
    if (remove) return null
    if (!photo) return undefined
    const raw = String(photo).trim()
    if (!raw) return undefined
    if (raw.startsWith('data:')) {
      const idx = raw.indexOf(',')
      if (idx < 0) return undefined
      const b64 = raw.slice(idx + 1).trim()
      return b64 || undefined
    }
    return raw
  }

  const roleFilterOptions = ['All roles', ...roles]

  const filtered = employees.filter((e) => {
    const matchSearch =
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.email.toLowerCase().includes(search.toLowerCase())
    const matchRole = roleFilter === 'All roles' || e.role === roleFilter
    return matchSearch && matchRole
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage))
  const start = (currentPage - 1) * perPage
  const paginated = filtered.slice(start, start + perPage)

  useEffect(() => {
    setCurrentPage(1)
  }, [search, roleFilter])

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)))
  }

  const handleAddRole = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = newRoleName.trim()
    if (!name) return
    setAddRoleBusy(true)
    try {
      const ok = await addRole(name)
      if (ok) {
        addEntry({ action: 'role_added', actor: 'Admin', target: name, details: 'New role created' })
        setNewRoleName('')
        setAddRoleOpen(false)
      }
    } finally {
      setAddRoleBusy(false)
    }
  }

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (pendingPhotoPromiseRef.current) await pendingPhotoPromiseRef.current
    const { fname, mname, lname, email, role, status, password, address, contact, photoBase64: statePhotoBase64 } = newUser
    const photoBase64 = pendingPhotoBase64ValueRef.current ?? statePhotoBase64
    const name = [fname, mname, lname].filter(Boolean).join(' ').trim()
    if (!name || !email.trim()) return
    let created: Employee | null = null
    const matchedRole = roleOptions.find((r) => r.role_name === role)
    const addressPayload = getAddressPayload()
    try {
      const empImageBase64 = toApiBase64(photoBase64)
      created = await createEmployee(
        {
          fname: fname.trim(),
          mname: mname.trim() || undefined,
          lname: lname.trim(),
          email: email.trim(),
          roleName: role,
          roleId: matchedRole?.role_ID,
          contact: contact.trim() || undefined,
          address: address.trim() || undefined,
          password: password?.trim() || DEFAULT_PASSWORD,
          empImageBase64,
        },
        roleOptions,
        addressPayload,
      )
    } catch {
      created = null
    }

    if (!created && photoBase64) {
      const empImageBase64 = toApiBase64(photoBase64)
      if (empImageBase64 != null) {
        console.warn('[Portal] createEmployee returned null (image provided). Keeping optimistic row and refetching.', {
          base64Length: String(empImageBase64).length,
        })
      } else {
        console.warn('[Portal] createEmployee returned null (image provided) but payload image is empty.')
      }
    }

    const nextEmp: Employee =
      created ??
      (() => {
        const id = Math.max(0, ...employees.map((emp) => emp.id)) + 1
        const fallback: Employee = {
          id,
          name,
          email: email.trim(),
          role,
          status,
          password: password || DEFAULT_PASSWORD,
          photoUrl: photoBase64?.startsWith('data:') ? photoBase64 : undefined,
        }
        if (address.trim()) fallback.address = address.trim()
        if (contact.trim()) fallback.contact = contact.trim()
        return fallback
      })()

    // Avoid duplicate cards when optimistic insert races with a refetch.
    // If photo rendering previously failed, allow img re-render for this attempt.
    if (photoBase64 || toApiBase64(photoBase64) !== undefined) setBrokenPhotos({})
    setEmployees((prev) => {
      const idx = prev.findIndex((p) => p.id === nextEmp.id && nextEmp.id > 0)
      if (idx >= 0) {
        const copy = [...prev]
        copy[idx] = nextEmp
        return copy
      }
      return [...prev, nextEmp]
    })
    addEntry({ action: 'user_added', actor: 'Admin', target: nextEmp.name, details: `Role: ${role}` })
    setNewUser({ fname: '', mname: '', lname: '', email: '', role: roles[0] ?? 'Admin', status: 'Active', password: DEFAULT_PASSWORD, address: '', contact: '', photoBase64: undefined, photoRemoved: false })
    setLocation(DEFAULT_LOCATION)
    setAddressParts(null)
    setPinAdjusted(false)
    setLocQuery('')
    setLocResults([])
    setLocError(null)
    setAddUserOpen(false)

    try {
      const list = await fetchEmployees(roleOptions)
      if (list.length >= 0) {
        setEmployees(list)
        setBrokenPhotos({})
      }
    } catch {
      // Modal already closed; list keeps optimistic row until next refresh
    }
  }

  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingEmployee) return
    if (pendingPhotoPromiseRef.current) await pendingPhotoPromiseRef.current
    const { fname, mname, lname, email, role, status, password, address, contact, photoBase64: statePhotoBase64 } = newUser
    const photoBase64 = pendingPhotoBase64ValueRef.current ?? statePhotoBase64
    const photoRemoved = pendingPhotoRemovedValueRef.current
    const name = [fname, mname, lname].filter(Boolean).join(' ').trim()
    if (!name || !email.trim()) return
    const matchedRole = roleOptions.find((r) => r.role_name === role)
    const pwd = password?.trim() || DEFAULT_PASSWORD
    const origPwd = editingEmployee.password ?? DEFAULT_PASSWORD
    const passwordForApi = pwd !== origPwd ? pwd : undefined
    const empImageBase64 = toApiBase64(photoBase64, photoRemoved)

    let updated: Employee | null = null
    const addressPayload = getAddressPayload()
    try {
      updated = await updateEmployee(
        {
          id: editingEmployee.id,
          accId: editingEmployee.accId,
          fname: fname.trim(),
          mname: mname.trim() || undefined,
          lname: lname.trim(),
          email: email.trim(),
          roleName: role,
          roleId: matchedRole?.role_ID,
          contact: contact.trim() || undefined,
          address: address.trim() || undefined,
          password: passwordForApi,
          status,
          empAddressId: editingEmployee.addressId,
          empImageBase64,
        },
        roleOptions,
        addressPayload,
      )
    } catch {
      updated = null
    }

    if (!updated && (empImageBase64 !== undefined && empImageBase64 !== null)) {
      console.error(
        '[Portal] updateEmployee returned null (image provided). base64_len=',
        String(empImageBase64).length,
      )
    }
    if (!updated && empImageBase64 === null) {
      console.error('[Portal] updateEmployee returned null (photo removal requested).')
    }

    const merged: Employee = updated
      ? {
          ...updated,
          status,
          password: pwd,
          photoUrl: photoRemoved
            ? undefined
            : updated.photoUrl ?? (photoBase64?.startsWith('data:') ? photoBase64 : undefined) ?? editingEmployee.photoUrl,
        }
      : {
          ...editingEmployee,
          name,
          email: email.trim(),
          role,
          status,
          password: pwd,
          address: address.trim() || undefined,
          contact: contact.trim() || undefined,
          photoUrl: photoRemoved ? undefined : photoBase64?.startsWith('data:') ? photoBase64 : editingEmployee.photoUrl,
        }

    const details =
      editingEmployee.role !== role
        ? `Role: ${editingEmployee.role} → ${role}`
        : updated
          ? 'Profile updated'
          : 'Profile updated (local — server did not confirm)'

    // Photo rendering could have failed earlier; clear broken flag so updated img can retry.
    if (!photoRemoved) setBrokenPhotos({})
    setEmployees((prev) => prev.map((emp) => (emp.id === editingEmployee.id ? merged : emp)))
    addEntry({ action: 'user_updated', actor: 'Admin', target: name, details })
    setEditingEmployee(null)
    setNewUser({
      fname: '',
      mname: '',
      lname: '',
      email: '',
      role: roles[0] ?? 'Admin',
      status: 'Active',
      password: DEFAULT_PASSWORD,
      address: '',
      contact: '',
      photoBase64: undefined,
      photoRemoved: false,
    })
    setLocation(DEFAULT_LOCATION)
    setLocQuery('')
    setLocResults([])
    setLocError(null)
    setAddressParts(null)
    setPinAdjusted(false)

    const list = await fetchEmployees(roleOptions)
    if (list.length >= 0) {
      setEmployees(list)
      setBrokenPhotos({})

      // Debug: confirm photo presence after refetch when an image was part of the update.
      if (empImageBase64 !== undefined) {
        const after = list.find((e) => e.id === editingEmployee.id)
        const present = Boolean(after?.photoUrl)
        const len = after?.photoUrl?.startsWith('data:') ? after.photoUrl.length : after?.photoUrl?.length
        console.log('[Portal] after refetch: photo present?', { id: editingEmployee.id, present, len, photoStartsWithDataUrl: after?.photoUrl?.startsWith?.('data:') })
      }
    }
  }

  function parseNameToParts(fullName: string): { fname: string; mname: string; lname: string } {
    const parts = fullName.trim().split(/\s+/).filter(Boolean)
    if (parts.length === 0) return { fname: '', mname: '', lname: '' }
    if (parts.length === 1) return { fname: parts[0] ?? '', mname: '', lname: '' }
    return {
      fname: parts[0] ?? '',
      lname: parts[parts.length - 1] ?? '',
      mname: parts.slice(1, -1).join(' '),
    }
  }

  const openEditModal = (emp: Employee) => {
    const { fname, mname, lname } = parseNameToParts(emp.name)
    setNewUser({
      fname,
      mname,
      lname,
      email: emp.email,
      role: emp.role,
      status: emp.status,
      password: emp.password ?? DEFAULT_PASSWORD,
      address: emp.address ?? '',
      contact: emp.contact ?? '',
      photoBase64: emp.photoUrl?.startsWith('data:') ? emp.photoUrl : undefined,
      photoRemoved: false,
    })
    pendingPhotoRemovedValueRef.current = false
    pendingPhotoBase64ValueRef.current = undefined
    setShowEditPassword(false)
    setLocation(DEFAULT_LOCATION)
    setAddressParts(null)
    setPinAdjusted(false)
    setLocQuery('')
    setLocResults([])
    setLocError(null)
    setEditingEmployee(emp)
  }

  const handleDeleteRole = (roleName: string) => {
    if (roles.length <= 1) return
    setConfirm({
      open: true,
      title: 'Delete role',
      message: `Delete the role "${roleName}"? Employees with this role will be reassigned to another role. This cannot be undone.`,
      confirmLabel: 'Delete role',
      variant: 'danger',
      onConfirm: () => {
        const fallbackRole = roles.find((r) => r !== roleName) ?? roles[0]
        setEmployees((prev) =>
          prev.map((e) => (e.role === roleName ? { ...e, role: fallbackRole } : e))
        )
        deleteRole(roleName)
        addEntry({ action: 'role_deleted', actor: 'Admin', target: roleName, details: `Employees reassigned to ${fallbackRole}` })
        setConfirm((c) => ({ ...c, open: false }))
      },
    })
  }

  const handleDeleteEmployee = (emp: Employee) => {
    setConfirm({
      open: true,
      title: 'Delete employee',
      message: `Permanently delete "${emp.name}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
      onConfirm: () => {
        setConfirm((c) => ({ ...c, open: false }))
        setEmployees((prev) => prev.filter((e) => e.id !== emp.id))
        addEntry({ action: 'user_disabled', actor: 'Admin', target: emp.name, details: 'Employee permanently deleted' })
        deleteEmployee(emp.id).catch(() => {
          fetchEmployees(roleOptions).then((list) => {
            if (list.length >= 0) setEmployees(list)
          }).catch(() => {})
        })
      },
    })
  }

  const handlePerPageChange = (value: number | string) => {
    const n = typeof value === 'string' ? parseInt(value, 10) : value
    if (Number.isNaN(n)) return
    const clamped = Math.max(MIN_PER_PAGE, Math.min(MAX_PER_PAGE, n))
    setPerPage(clamped)
    setCurrentPage(1)
  }

  return (
    <div className="dashboard-page">
      <header className="dashboard-page-header">
        <h1 className="dashboard-page-title">Employees</h1>
        <p className="dashboard-page-subtitle">Manage employee profiles and records</p>
      </header>
      <div className="dashboard-page-content">
        <section className="dashboard-card employees-card">
          <div className="employees-toolbar">
            <div className="employees-search-wrap">
              <svg className="employees-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <input
                type="search"
                className="employees-search"
                placeholder="Search by name or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search employees"
              />
            </div>
            <div className="employees-row-toolbar">
              <CustomSelect
                value={roleFilter}
                onChange={setRoleFilter}
                options={roleFilterOptions.map((opt) => ({ value: opt, label: opt }))}
                placeholder="All roles"
                aria-label="Filter by role"
                className="employees-filter-wrap"
                allowEmpty={false}
              />
              <button type="button" className="employees-btn employees-btn-secondary" onClick={() => setAddRoleOpen(true)}>
                Add role
              </button>
              <button
                type="button"
                className="employees-btn employees-btn-primary"
                onClick={() => {
                  setNewUser({ fname: '', mname: '', lname: '', email: '', role: roles[0] ?? 'Admin', status: 'Active', password: DEFAULT_PASSWORD, address: '', contact: '', photoBase64: undefined, photoRemoved: false })
                  setShowAddPassword(false)
                  setLocation(DEFAULT_LOCATION)
                  setAddressParts(null)
                  setPinAdjusted(false)
                  setLocQuery('')
                  setLocResults([])
                  setLocError(null)
                  setAddUserOpen(true)
                }}
              >
                Add user
              </button>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="employees-empty">
              No employees match your search or filters.
            </div>
          ) : (
            <div className="employees-cards" role="list" aria-label="Employees list">
              {paginated.map((emp) => (
                <div key={emp.id} className="employees-card-item" role="listitem">
                  <div className="employees-card-top">
                    <div className="employees-card-head">
                      <div className="employees-avatar" aria-hidden>
                        <span className="employees-avatar-fallback">{getInitials(emp.name)}</span>
                        {emp.photoUrl && !brokenPhotos[emp.id] && (
                          <img
                            className="employees-avatar-img"
                            src={emp.photoUrl}
                            alt={`${emp.name} profile`}
                            loading="lazy"
                            onError={() => setBrokenPhotos((prev) => ({ ...prev, [emp.id]: true }))}
                          />
                        )}
                      </div>
                      <div className="employees-card-title">
                        <div className="employees-card-name">{emp.name}</div>
                        <div className="employees-card-sub">
                          <span className="employees-badge">{emp.role}</span>
                        </div>
                      </div>
                    </div>
                    <div className="employees-card-actions">
                      <button
                        type="button"
                        className="employees-icon-btn"
                        title="Edit"
                        aria-label={`Edit ${emp.name}`}
                        onClick={() => openEditModal(emp)}
                      >
                        <Pencil size={18} />
                      </button>
                      <button
                        type="button"
                        className="employees-icon-btn employees-icon-btn--danger"
                        title="Delete employee"
                        aria-label={`Delete ${emp.name}`}
                        onClick={() => handleDeleteEmployee(emp)}
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>

                  <div className="employees-card-body">
                    <div className="employees-card-field">
                      <span className="employees-card-field-label">Contact:</span>
                      <span className="employees-card-field-value">{emp.contact ?? '—'}</span>
                    </div>
                    <div className="employees-card-field">
                      <span className="employees-card-field-label">Email:</span>
                      <span className="employees-card-field-value">{emp.email ?? '—'}</span>
                    </div>
                    <div className="employees-card-field">
                      <span className="employees-card-field-label">Address:</span>
                      <span className="employees-card-field-value">{emp.address ?? '—'}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {filtered.length > 0 && (
            <div className="employees-pagination">
              <div className="employees-pagination-per-page">
                <label htmlFor="per-page" className="employees-pagination-label">Show</label>
                <input
                  id="per-page"
                  type="number"
                  min={MIN_PER_PAGE}
                  max={MAX_PER_PAGE}
                  className="employees-per-page-select employees-per-page-input"
                  value={perPage}
                  onChange={(e) => handlePerPageChange(e.target.value)}
                  onBlur={(e) => {
                    const n = parseInt(e.target.value, 10)
                    if (Number.isNaN(n) || n < MIN_PER_PAGE) setPerPage(MIN_PER_PAGE)
                    else if (n > MAX_PER_PAGE) setPerPage(MAX_PER_PAGE)
                    else setPerPage(n)
                  }}
                  aria-label="Items per page"
                  inputMode="numeric"
                />
                <span className="employees-pagination-label">per page</span>
              </div>
              <div className="employees-pagination-info">
                Showing {start + 1}–{Math.min(start + perPage, filtered.length)} of {filtered.length}
              </div>
              <div className="employees-pagination-nav">
                <button
                  type="button"
                  className="employees-pagination-btn"
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage <= 1}
                  aria-label="Previous page"
                >
                  Previous
                </button>
                <span className="employees-pagination-page">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  className="employees-pagination-btn"
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage >= totalPages}
                  aria-label="Next page"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Add Role Modal */}
      {addRoleOpen && (
        <div className="modal-overlay" onClick={() => setAddRoleOpen(false)} role="dialog" aria-modal="true" aria-labelledby="add-role-title">
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 id="add-role-title" className="modal-title">Add / Delete role</h2>
              <button type="button" className="modal-close" onClick={() => setAddRoleOpen(false)} aria-label="Close">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleAddRole} className="modal-form-inline">
              <div className="modal-field modal-field--flex">
                <label htmlFor="role-name" className="modal-label">Add new role</label>
                <div className="modal-input-row">
                  <input
                    id="role-name"
                    type="text"
                    className="modal-input"
                    placeholder="e.g. Manager"
                    value={newRoleName}
                    onChange={(e) => setNewRoleName(e.target.value)}
                    autoFocus
                    required
                    disabled={addRoleBusy}
                  />
                  <button type="submit" className="employees-btn employees-btn-primary" disabled={addRoleBusy}>
                    {addRoleBusy ? 'Adding…' : 'Add role'}
                  </button>
                </div>
              </div>
            </form>
            <div className="modal-roles-list">
              <span className="modal-label">
                Current roles{rolesLoading ? ' (loading...)' : ''}
              </span>
              {roles.length === 0 && !rolesLoading ? (
                <div className="text-sm text-slate-500">No roles found.</div>
              ) : (
                <ul className="modal-roles-ul">
                  {roles.map((name) => {
                    const fromDb = roleOptions.some((r) => r.role_name === name)
                    return (
                      <li key={name} className="modal-role-item">
                        <span className="employees-badge">{name}</span>
                        <button
                          type="button"
                          className="employees-row-action employees-row-action--danger"
                          title={fromDb ? 'Roles from database cannot be deleted here' : 'Delete role'}
                          disabled={fromDb}
                          onClick={() => !fromDb && handleDeleteRole(name)}
                        >
                          Delete
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirm.open}
        title={confirm.title}
        message={confirm.message}
        confirmLabel={confirm.confirmLabel}
        variant={confirm.variant}
        onConfirm={confirm.onConfirm}
        onCancel={() => setConfirm((c) => ({ ...c, open: false }))}
      />

      {/* Add User Modal */}
      {addUserOpen && (
        <div
          className="modal-overlay"
          onClick={() => {
            setPinAdjusted(false)
            setAddUserOpen(false)
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-user-title"
        >
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 id="add-user-title" className="modal-title">Add user</h2>
              <button
                type="button"
                className="modal-close"
                onClick={() => {
                  setPinAdjusted(false)
                  setAddUserOpen(false)
                }}
                aria-label="Close"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleAddUser} className="employees-modal-form">
              <div className="modal-field employee-photo-field">
                <div className="employee-photo-uploader-wrap">
                  <input
                    id="user-photo"
                    type="file"
                    accept="image/*"
                    className="employee-photo-input"
                    onChange={async (ev) => {
                      const file = ev.currentTarget.files?.[0]
                      if (!file) {
                        pendingPhotoPromiseRef.current = null
                        pendingPhotoBase64ValueRef.current = undefined
                      pendingPhotoRemovedValueRef.current = false
                        setNewUser((u) => ({ ...u, photoBase64: undefined, photoRemoved: false }))
                        return
                      }
                      setPhotoBusy(true)
                      const conversionPromise = (async () => {
                        try {
                          const dataUrl = await fileToDataUrl(file)
                          pendingPhotoBase64ValueRef.current = dataUrl
                        pendingPhotoRemovedValueRef.current = false
                          setNewUser((u) => ({ ...u, photoBase64: dataUrl, photoRemoved: false }))
                        } catch {
                          pendingPhotoBase64ValueRef.current = undefined
                        pendingPhotoRemovedValueRef.current = false
                          setNewUser((u) => ({ ...u, photoBase64: undefined, photoRemoved: false }))
                        }
                      })()
                      pendingPhotoPromiseRef.current = conversionPromise
                      try {
                        await conversionPromise
                      } finally {
                        setPhotoBusy(false)
                        pendingPhotoPromiseRef.current = null
                      }
                    }}
                  />
                  <label htmlFor="user-photo" className="employees-avatar employee-photo-uploader" aria-label="Upload profile picture" title="Upload profile picture">
                    {newUser.photoBase64 ? (
                      <img className="employees-avatar-img" src={newUser.photoBase64} alt="Profile preview" />
                    ) : (
                      <Plus size={20} className="employee-photo-plus-icon" aria-hidden />
                    )}
                  </label>
                  {newUser.photoBase64 && (
                    <button
                      type="button"
                      className="employee-photo-remove"
                      aria-label="Remove uploaded picture"
                      disabled={photoBusy}
                      onClick={(ev) => {
                        ev.preventDefault()
                        pendingPhotoPromiseRef.current = null
                        pendingPhotoBase64ValueRef.current = undefined
                        setNewUser((u) => ({ ...u, photoBase64: undefined, photoRemoved: false }))
                      }}
                    >
                      <X size={14} aria-hidden />
                    </button>
                  )}
                </div>
              </div>
              <div className="modal-field">
                <label htmlFor="user-fname" className="modal-label">First name</label>
                <input
                  id="user-fname"
                  type="text"
                  className="modal-input"
                  placeholder="First name"
                  value={newUser.fname}
                  onChange={(e) => setNewUser((u) => ({ ...u, fname: e.target.value }))}
                  required
                />
              </div>
              <div className="modal-field">
                <label htmlFor="user-mname" className="modal-label">Middle name</label>
                <input
                  id="user-mname"
                  type="text"
                  className="modal-input"
                  placeholder="Middle name"
                  value={newUser.mname}
                  onChange={(e) => setNewUser((u) => ({ ...u, mname: e.target.value }))}
                />
              </div>
              <div className="modal-field">
                <label htmlFor="user-lname" className="modal-label">Last name</label>
                <input
                  id="user-lname"
                  type="text"
                  className="modal-input"
                  placeholder="Last name"
                  value={newUser.lname}
                  onChange={(e) => setNewUser((u) => ({ ...u, lname: e.target.value }))}
                  required
                />
              </div>
              <div className="modal-field">
                <label htmlFor="user-email" className="modal-label">Email</label>
                <input
                  id="user-email"
                  type="email"
                  className="modal-input"
                  placeholder="email@example.com"
                  value={newUser.email}
                  onChange={(e) => setNewUser((u) => ({ ...u, email: e.target.value }))}
                  required
                />
              </div>
              <div className="modal-field">
                <label htmlFor="user-password" className="modal-label">Password</label>
                <div className="modal-password-wrap">
                  <input
                    id="user-password"
                    type={showAddPassword ? 'text' : 'password'}
                    className="modal-input modal-input-password"
                    placeholder="Default: 0000"
                    value={newUser.password ?? ''}
                    onChange={(e) => setNewUser((u) => ({ ...u, password: e.target.value }))}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className="modal-password-toggle"
                    onClick={() => setShowAddPassword((v) => !v)}
                    title={showAddPassword ? 'Hide password' : 'Show password'}
                    aria-label={showAddPassword ? 'Hide password' : 'Show password'}
                  >
                    {showAddPassword ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
              <div className="modal-field">
                <label htmlFor="user-role" className="modal-label">Role</label>
                <CustomSelect
                  value={newUser.role}
                  onChange={(v) => setNewUser((u) => ({ ...u, role: v }))}
                  options={roles.map((r) => ({ value: r, label: r }))}
                  placeholder="Role"
                  aria-label="Role"
                  className="custom-select--modal"
                  allowEmpty={false}
                />
              </div>
              <div className="modal-field">
                <label htmlFor="user-contact" className="modal-label">Contact</label>
                <input
                  id="user-contact"
                  type="tel"
                  className="modal-input"
                  placeholder="Phone number"
                  value={newUser.contact}
                  onChange={(e) => setNewUser((u) => ({ ...u, contact: e.target.value }))}
                />
              </div>
              <div className="modal-field">
                <label htmlFor="user-address" className="modal-label">Address</label>
                <input
                  id="user-address"
                  type="text"
                  className="modal-input"
                  placeholder="Street, city, province..."
                  value={newUser.address}
                  onChange={(e) => setNewUser((u) => ({ ...u, address: e.target.value }))}
                />
                {location && (
                  <p className="mt-1.5 text-xs text-slate-500">
                    Latitude: {location.lat.toFixed(6)}, Longitude: {location.lon.toFixed(6)}
                  </p>
                )}
              </div>
              <div className="modal-field space-y-3 md:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <MapPin className="h-4 w-4 text-blue-600" aria-hidden />
                    <span>Pin employee location (optional)</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleUseCurrentLocation}
                      disabled={locLoading}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs sm:text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                    >
                      <Crosshair className="h-3.5 w-3.5" aria-hidden />
                      {locLoading ? 'Locating…' : 'Use current location'}
                    </button>
                    <button
                      type="button"
                      onClick={handleRecenter}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs sm:text-sm text-slate-700 hover:bg-slate-50"
                    >
                      Recenter map
                    </button>
                  </div>
                </div>
                {location && (
                  <div className="space-y-2">
                    <div role="search" className="flex flex-wrap gap-2 items-center">
                      <input
                        type="text"
                        value={locQuery}
                        onChange={(e) => setLocQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleSearchPlace())}
                        placeholder="Type to search place, street, city..."
                        className="flex-1 min-w-0 border border-slate-200 rounded-lg px-3 py-1.5 text-xs sm:text-sm text-slate-900 outline-none focus:outline-none focus:ring-0 focus:border-blue-400"
                      />
                      <button
                        type="button"
                        onClick={() => handleSearchPlace()}
                        disabled={locLoading}
                        className="px-3 py-1.5 rounded-lg bg-[var(--aa-blue)] text-xs text-white font-medium disabled:opacity-60"
                      >
                        {locLoading ? 'Searching…' : 'Search'}
                      </button>
                    </div>
                    {locResults.length > 0 && (
                      <div className="space-y-1 text-[11px] text-slate-600">
                        {locResults.map((r, idx) => (
                          <button
                            key={`${r.lat}-${r.lon}-${idx}`}
                            type="button"
                            onClick={async () => {
                              setLocation({ lat: r.lat, lon: r.lon })
                              setLocQuery(r.displayName)
                              setLocResults([])
                              await applyReverseGeocode(r.lat, r.lon)
                            }}
                            className="w-full text-left px-2 py-1 rounded-md hover:bg-slate-100 outline-none border-0 focus:outline-none focus:ring-0"
                          >
                            {r.displayName}
                          </button>
                        ))}
                      </div>
                    )}
                    <LocationPicker
                      location={location}
                      onChange={async (loc) => {
                        setLocation(loc)
                        await applyReverseGeocode(loc.lat, loc.lon)
                      }}
                    />
                    <p className="text-[11px] text-slate-400">
                      Drag the pin or click on the map to adjust. Address field above will be updated automatically.
                    </p>
                  </div>
                )}
                {locError && <p className="text-xs text-red-600">{locError}</p>}
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="employees-btn employees-btn-secondary"
                  onClick={() => {
                    setPinAdjusted(false)
                    setAddUserOpen(false)
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="employees-btn employees-btn-primary" disabled={photoBusy}>
                  {photoBusy ? 'Processing image…' : 'Add user'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editingEmployee && (
        <div
          className="modal-overlay"
          onClick={() => {
            setEditingEmployee(null)
            setPinAdjusted(false)
            setNewUser({ fname: '', mname: '', lname: '', email: '', role: roles[0] ?? 'Admin', status: 'Active', password: DEFAULT_PASSWORD, address: '', contact: '', photoBase64: undefined, photoRemoved: false })
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-user-title"
        >
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 id="edit-user-title" className="modal-title">Edit user</h2>
              <button
                type="button"
                className="modal-close"
                onClick={() => {
                  setEditingEmployee(null)
                  setPinAdjusted(false)
                  setNewUser({ fname: '', mname: '', lname: '', email: '', role: roles[0] ?? 'Admin', status: 'Active', password: DEFAULT_PASSWORD, address: '', contact: '', photoBase64: undefined, photoRemoved: false })
                }}
                aria-label="Close"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <form
              onSubmit={handleEditUser}
              className="employees-modal-form"
              onKeyDown={(ev) => {
                if (ev.key !== 'Enter') return
                const t = ev.target as HTMLElement
                if (t.closest('button[type="submit"]')) return
                if (t.tagName === 'TEXTAREA') return
                if (t.tagName === 'INPUT') {
                  const inp = t as HTMLInputElement
                  if (inp.type !== 'submit' && inp.type !== 'button') ev.preventDefault()
                }
              }}
            >
              <div className="modal-field employee-photo-field">
                <div className="employee-photo-uploader-wrap">
                  <input
                    id="edit-user-photo"
                    type="file"
                    accept="image/*"
                    className="employee-photo-input"
                    onChange={async (ev) => {
                      const file = ev.currentTarget.files?.[0]
                      if (!file) {
                        // User cancelled file picker: keep existing image unchanged.
                        pendingPhotoPromiseRef.current = null
                        pendingPhotoBase64ValueRef.current = undefined
                        pendingPhotoRemovedValueRef.current = false
                        return
                      }
                      setPhotoBusy(true)
                      pendingPhotoRemovedValueRef.current = false
                      const conversionPromise = (async () => {
                        try {
                          const dataUrl = await fileToDataUrl(file)
                          pendingPhotoBase64ValueRef.current = dataUrl
                          pendingPhotoRemovedValueRef.current = false
                          setNewUser((u) => ({ ...u, photoBase64: dataUrl, photoRemoved: false }))
                        } catch {
                          // Failed conversion should not remove existing profile photo.
                          pendingPhotoBase64ValueRef.current = undefined
                          pendingPhotoRemovedValueRef.current = false
                        }
                      })()
                      pendingPhotoPromiseRef.current = conversionPromise
                      try {
                        await conversionPromise
                      } finally {
                        setPhotoBusy(false)
                        pendingPhotoPromiseRef.current = null
                      }
                    }}
                  />
                  <label
                    htmlFor="edit-user-photo"
                    className="employees-avatar employee-photo-uploader"
                    aria-label="Upload profile picture"
                    title="Upload profile picture"
                  >
                    {editActivePhotoUrl ? (
                      <img className="employees-avatar-img" src={editActivePhotoUrl} alt="Profile preview" />
                    ) : (
                      <Plus size={20} className="employee-photo-plus-icon" aria-hidden />
                    )}
                  </label>
                  {editActivePhotoUrl && (
                    <button
                      type="button"
                      className="employee-photo-remove"
                      aria-label="Remove uploaded picture"
                      disabled={photoBusy}
                      onClick={(ev) => {
                        ev.preventDefault()
                        pendingPhotoPromiseRef.current = null
                        pendingPhotoBase64ValueRef.current = undefined
                        pendingPhotoRemovedValueRef.current = true
                        setNewUser((u) => ({ ...u, photoBase64: undefined, photoRemoved: true }))
                      }}
                    >
                      <X size={14} aria-hidden />
                    </button>
                  )}
                </div>
              </div>
              <div className="modal-field">
                <label htmlFor="edit-user-fname" className="modal-label">First name</label>
                <input
                  id="edit-user-fname"
                  type="text"
                  className="modal-input"
                  placeholder="First name"
                  value={newUser.fname}
                  onChange={(e) => setNewUser((u) => ({ ...u, fname: e.target.value }))}
                  required
                />
              </div>
              <div className="modal-field">
                <label htmlFor="edit-user-mname" className="modal-label">Middle name</label>
                <input
                  id="edit-user-mname"
                  type="text"
                  className="modal-input"
                  placeholder="Middle name"
                  value={newUser.mname}
                  onChange={(e) => setNewUser((u) => ({ ...u, mname: e.target.value }))}
                />
              </div>
              <div className="modal-field">
                <label htmlFor="edit-user-lname" className="modal-label">Last name</label>
                <input
                  id="edit-user-lname"
                  type="text"
                  className="modal-input"
                  placeholder="Last name"
                  value={newUser.lname}
                  onChange={(e) => setNewUser((u) => ({ ...u, lname: e.target.value }))}
                  required
                />
              </div>
              <div className="modal-field">
                <label htmlFor="edit-user-email" className="modal-label">Email</label>
                <input
                  id="edit-user-email"
                  type="email"
                  className="modal-input"
                  placeholder="email@example.com"
                  value={newUser.email}
                  onChange={(e) => setNewUser((u) => ({ ...u, email: e.target.value }))}
                  required
                />
              </div>
              <div className="modal-field">
                <label htmlFor="edit-user-password" className="modal-label">Password</label>
                <div className="modal-password-wrap">
                  <input
                    id="edit-user-password"
                    type={showEditPassword ? 'text' : 'password'}
                    className="modal-input modal-input-password"
                    placeholder="Default: 0000"
                    value={newUser.password ?? ''}
                    onChange={(e) => setNewUser((u) => ({ ...u, password: e.target.value }))}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className="modal-password-toggle"
                    onClick={() => setShowEditPassword((v) => !v)}
                    title={showEditPassword ? 'Hide password' : 'Show password'}
                    aria-label={showEditPassword ? 'Hide password' : 'Show password'}
                  >
                    {showEditPassword ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
              <div className="modal-field">
                <label htmlFor="edit-user-role" className="modal-label">Role</label>
                <CustomSelect
                  value={newUser.role}
                  onChange={(v) => setNewUser((u) => ({ ...u, role: v }))}
                  options={roles.map((r) => ({ value: r, label: r }))}
                  placeholder="Role"
                  aria-label="Role"
                  className="custom-select--modal"
                  allowEmpty={false}
                />
              </div>
              <div className="modal-field">
                <label htmlFor="edit-user-contact" className="modal-label">Contact</label>
                <input
                  id="edit-user-contact"
                  type="tel"
                  className="modal-input"
                  placeholder="Phone number"
                  value={newUser.contact}
                  onChange={(e) => setNewUser((u) => ({ ...u, contact: e.target.value }))}
                />
              </div>
              <div className="modal-field">
                <label htmlFor="edit-user-address" className="modal-label">Address</label>
                <input
                  id="edit-user-address"
                  type="text"
                  className="modal-input"
                  placeholder="Street, city, province..."
                  value={newUser.address}
                  onChange={(e) => setNewUser((u) => ({ ...u, address: e.target.value }))}
                />
                {location && (
                  <p className="mt-1.5 text-xs text-slate-500">
                    Latitude: {location.lat.toFixed(6)}, Longitude: {location.lon.toFixed(6)}
                  </p>
                )}
              </div>
              <div className="modal-field space-y-3 md:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <MapPin className="h-4 w-4 text-blue-600" aria-hidden />
                    <span>Pin employee location (optional)</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleUseCurrentLocation}
                      disabled={locLoading}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs sm:text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                    >
                      <Crosshair className="h-3.5 w-3.5" aria-hidden />
                      {locLoading ? 'Locating…' : 'Use current location'}
                    </button>
                    <button
                      type="button"
                      onClick={handleRecenter}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs sm:text-sm text-slate-700 hover:bg-slate-50"
                    >
                      Recenter map
                    </button>
                  </div>
                </div>
                {location && (
                  <div className="space-y-2">
                    <div role="search" className="flex flex-wrap gap-2 items-center">
                      <input
                        type="text"
                        value={locQuery}
                        onChange={(e) => setLocQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleSearchPlace())}
                        placeholder="Type to search place, street, city..."
                        className="flex-1 min-w-0 border border-slate-200 rounded-lg px-3 py-1.5 text-xs sm:text-sm text-slate-900 outline-none focus:outline-none focus:ring-0 focus:border-blue-400"
                      />
                      <button
                        type="button"
                        onClick={() => handleSearchPlace()}
                        disabled={locLoading}
                        className="px-3 py-1.5 rounded-lg bg-[var(--aa-blue)] text-xs text-white font-medium disabled:opacity-60"
                      >
                        {locLoading ? 'Searching…' : 'Search'}
                      </button>
                    </div>
                    {locResults.length > 0 && (
                      <div className="space-y-1 text-[11px] text-slate-600">
                        {locResults.map((r, idx) => (
                          <button
                            key={`edit-${r.lat}-${r.lon}-${idx}`}
                            type="button"
                            onClick={async () => {
                              setLocation({ lat: r.lat, lon: r.lon })
                              setLocQuery(r.displayName)
                              setLocResults([])
                              await applyReverseGeocode(r.lat, r.lon)
                            }}
                            className="w-full text-left px-2 py-1 rounded-md hover:bg-slate-100 outline-none border-0 focus:outline-none focus:ring-0"
                          >
                            {r.displayName}
                          </button>
                        ))}
                      </div>
                    )}
                    <LocationPicker
                      location={location}
                      onChange={async (loc) => {
                        setLocation(loc)
                        await applyReverseGeocode(loc.lat, loc.lon)
                      }}
                    />
                    <p className="text-[11px] text-slate-400">
                      Drag the pin or click on the map to adjust. Address field above will be updated automatically.
                    </p>
                  </div>
                )}
                {locError && <p className="text-xs text-red-600">{locError}</p>}
              </div>
              <div className="modal-field">
                <label htmlFor="edit-user-status" className="modal-label">Status</label>
                <CustomSelect
                  value={newUser.status}
                  onChange={(v) => setNewUser((u) => ({ ...u, status: v as 'Active' | 'Inactive' }))}
                  options={[{ value: 'Active', label: 'Active' }, { value: 'Inactive', label: 'Inactive' }]}
                  placeholder="Status"
                  aria-label="Status"
                  className="custom-select--modal"
                  allowEmpty={false}
                />
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="employees-btn employees-btn-secondary"
                  onClick={() => {
                    setEditingEmployee(null)
                    setPinAdjusted(false)
                    setNewUser({ fname: '', mname: '', lname: '', email: '', role: roles[0] ?? 'Admin', status: 'Active', password: DEFAULT_PASSWORD, address: '', contact: '', photoBase64: undefined, photoRemoved: false })
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="employees-btn employees-btn-primary" disabled={photoBusy}>
                  {photoBusy ? 'Processing image…' : 'Save changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
