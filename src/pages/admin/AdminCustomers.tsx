import { useEffect, useState, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { MapPin, Crosshair, Pencil, Trash2 } from 'lucide-react'
import ConfirmDialog, { type ConfirmVariant } from '../../components/ConfirmDialog'
import {
  fetchCustomers,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  type Customer,
  type CustomerAddressPayload,
} from '../../api/customers'
import { reverseGeocode, searchPlaces } from '../../api/geo'

const DEFAULT_LOCATION = { lat: 14.5995, lon: 120.9842 }
type LatLon = { lat: number; lon: number }
const MIN_PER_PAGE = 1
const MAX_PER_PAGE = 500

function LocationPicker({ location, onChange }: { location: LatLon; onChange: (loc: LatLon) => void }) {
  const mapRef = useRef<HTMLDivElement | null>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)
  const markerRef = useRef<L.Marker | null>(null)

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return
    const icon = L.icon({
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
    })
    const map = L.map(mapRef.current).setView([location.lat, location.lon], 16)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map)
    const marker = L.marker([location.lat, location.lon], { draggable: true, icon }).addTo(map)
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
    <div className="w-full h-56 rounded-lg overflow-hidden border border-slate-200 bg-slate-100">
      <div ref={mapRef} className="w-full h-full" />
    </div>
  )
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const first = parts[0]?.[0] ?? ''
  const last = (parts.length > 1 ? parts[parts.length - 1]?.[0] : parts[0]?.[1]) ?? ''
  return (first + last).toUpperCase().slice(0, 2) || '?'
}

export default function AdminCustomers() {
  const [searchParams, setSearchParams] = useSearchParams()
  const editIdFromUrl = searchParams.get('edit')

  const [list, setList] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [perPage, setPerPage] = useState(10)

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Customer | null>(null)
  const [fname, setFname] = useState('')
  const [mname, setMname] = useState('')
  const [lname, setLname] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [location, setLocation] = useState<LatLon>(DEFAULT_LOCATION)
  const [addressParts, setAddressParts] = useState<{ street: string; municipality: string; province: string; postal: string } | null>(null)
  const [locLoading, setLocLoading] = useState(false)
  const [locError, setLocError] = useState<string | null>(null)
  const [locQuery, setLocQuery] = useState('')
  const [locResults, setLocResults] = useState<{ displayName: string; lat: number; lon: number }[]>([])
  const [submitBusy, setSubmitBusy] = useState(false)

  const [confirm, setConfirm] = useState<{
    open: boolean
    title: string
    message: string
    confirmLabel: string
    variant: ConfirmVariant
    onConfirm: () => void
  }>({ open: false, title: '', message: '', confirmLabel: '', variant: 'primary', onConfirm: () => {} })

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchCustomers()
      setList(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load customers')
      setList([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    if (editIdFromUrl == null || loading || list.length === 0) return
    const id = parseInt(editIdFromUrl, 10)
    if (Number.isNaN(id)) return
    const c = list.find((x) => x.id === id)
    if (c) openEdit(c)
  }, [editIdFromUrl, loading, list])

  const filteredList = list.filter((c) => {
    const name = [c.fname, c.mname, c.lname].filter(Boolean).join(' ') || c.name
    const matchSearch =
      name.toLowerCase().includes(search.toLowerCase()) ||
      (c.email ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (c.phone ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (c.address ?? '').toLowerCase().includes(search.toLowerCase())
    return matchSearch
  })

  const totalPages = Math.max(1, Math.ceil(filteredList.length / perPage))
  const start = (currentPage - 1) * perPage
  const paginatedList = filteredList.slice(start, start + perPage)

  useEffect(() => {
    setCurrentPage(1)
  }, [search])

  const applyReverseGeocode = async (lat: number, lon: number) => {
    try {
      const addr = await reverseGeocode(lat, lon)
      const street = addr.street ?? ''
      const municipality = addr.city ?? ''
      const province = addr.province ?? ''
      const postal = addr.postcode ?? ''
      setAddressParts({ street, municipality, province, postal })
      const pieces = [street, municipality, province, postal].filter(Boolean)
      if (pieces.length) setAddress(pieces.join(', '))
      else setAddress(`${lat.toFixed(5)}, ${lon.toFixed(5)}`)
    } catch {
      setAddressParts(null)
      setAddress(`${lat.toFixed(5)}, ${lon.toFixed(5)}`)
    }
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

  const handleRecenter = () => setLocation(DEFAULT_LOCATION)

  const handleSearchPlace = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const q = locQuery.trim()
    if (!q) {
      setLocResults([])
      setLocError(null)
      return
    }
    setLocError(null)
    setLocLoading(true)
    try {
      const mapped = await searchPlaces(q)
      setLocResults(mapped)
      if (!mapped.length) setLocError('No places found.')
    } catch (err) {
      setLocError(err instanceof Error ? err.message : 'Search failed.')
      setLocResults([])
    } finally {
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
      setLocError(null)
      setLocLoading(true)
      searchPlaces(q)
        .then((mapped) => {
          setLocResults(mapped)
          if (!mapped.length) setLocError('No places found.')
        })
        .catch((err) => {
          setLocError(err instanceof Error ? err.message : 'Search failed.')
          setLocResults([])
        })
        .finally(() => setLocLoading(false))
    }, 400)
    return () => clearTimeout(t)
  }, [locQuery])

  function openAdd() {
    setEditing(null)
    setFname('')
    setMname('')
    setLname('')
    setEmail('')
    setPhone('')
    setAddress('')
    setLocation(DEFAULT_LOCATION)
    setAddressParts(null)
    setLocQuery('')
    setLocResults([])
    setLocError(null)
    setSearchParams((p) => {
      const next = new URLSearchParams(p)
      next.delete('edit')
      return next
    })
    setShowForm(true)
  }

  function openEdit(c: Customer) {
    setEditing(c)
    setFname(c.fname ?? '')
    setMname(c.mname ?? '')
    setLname(c.lname ?? '')
    setEmail(c.email ?? '')
    setPhone(c.phone ?? '')
    setAddress(c.address ?? '')
    setLocation(DEFAULT_LOCATION)
    setAddressParts(null)
    setLocQuery('')
    setLocResults([])
    setLocError(null)
    setSearchParams((p) => {
      const next = new URLSearchParams(p)
      next.set('edit', String(c.id))
      return next
    })
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditing(null)
    setSearchParams((p) => {
      const next = new URLSearchParams(p)
      next.delete('edit')
      return next
    })
  }

  function getAddressPayload(): CustomerAddressPayload | undefined {
    if (!addressParts && !address.trim()) return undefined
    const street = addressParts?.street ?? ''
    const municipality = addressParts?.municipality ?? ''
    const province = addressParts?.province ?? ''
    const postal = addressParts?.postal ?? ''
    if (!street && !municipality && !province) return undefined
    return {
      latitude: location.lat,
      longitude: location.lon,
      street,
      municipality,
      province,
      postal,
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const name = [fname, mname, lname].filter(Boolean).join(' ').trim()
    if (!name) return
    setConfirm({
      open: true,
      title: editing ? 'Update customer?' : 'Add customer?',
      message: editing ? `Update "${name}"?` : `Add customer "${name}"?`,
      confirmLabel: editing ? 'Save' : 'Add',
      variant: 'primary',
      onConfirm: async () => {
        setConfirm((c) => ({ ...c, open: false }))
        setSubmitBusy(true)
        setError(null)
        try {
          const payload = {
            name,
            fname: fname || undefined,
            mname: mname || undefined,
            lname: lname || undefined,
            email: email.trim() || undefined,
            phone: phone.trim() || undefined,
            address: address.trim() || undefined,
            addressId: 0,
          }
          const addressPayload = getAddressPayload()
          if (editing) {
            await updateCustomer(editing.id, payload, addressPayload)
          } else {
            await createCustomer(payload, addressPayload)
          }
          await load()
          closeForm()
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Request failed')
        } finally {
          setSubmitBusy(false)
        }
      },
    })
  }

  function handleDelete(id: number) {
    const c = list.find((x) => x.id === id)
    const name = c ? [c.fname, c.mname, c.lname].filter(Boolean).join(' ') || c.name : 'Customer'
    setConfirm({
      open: true,
      title: 'Delete customer?',
      message: `Delete "${name}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
      onConfirm: async () => {
        setConfirm((x) => ({ ...x, open: false }))
        setError(null)
        const ok = await deleteCustomer(id)
        if (ok) await load()
        else setError('Failed to delete customer')
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
        <h1 className="dashboard-page-title">Customer</h1>
        <p className="dashboard-page-subtitle">Manage customer records</p>
      </header>
      <div className="dashboard-page-content">
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm" role="alert">
            {error}
          </div>
        )}
        <section className="dashboard-card employees-card">
          <div className="employees-toolbar">
            <div className="employees-search-wrap">
              <svg className="employees-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <input
                type="search"
                className="employees-search"
                placeholder="Search by name, email, phone, address..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search customers"
              />
            </div>
            <button type="button" className="employees-btn employees-btn-primary" onClick={openAdd}>
              Add Customer
            </button>
          </div>

          {loading ? (
            <div className="employees-empty">Loading customers…</div>
          ) : filteredList.length === 0 ? (
            <div className="employees-empty">No customers match your search.</div>
          ) : (
            <div className="employees-cards" role="list" aria-label="Customers list">
              {paginatedList.map((c) => {
                const displayName = [c.fname, c.mname, c.lname].filter(Boolean).join(' ') || c.name
                return (
                  <div key={c.id} className="employees-card-item" role="listitem">
                    <div className="employees-card-top">
                      <div className="employees-card-head">
                        <div className="employees-avatar" aria-hidden>
                          <span className="employees-avatar-fallback">{getInitials(displayName)}</span>
                        </div>
                        <div className="employees-card-title">
                          <div className="employees-card-name">{displayName}</div>
                          <div className="employees-card-sub">
                            <span className="employees-card-id">ID: {String(c.id).padStart(5, '0')}</span>
                          </div>
                        </div>
                      </div>
                      <div className="employees-card-actions">
                        <button
                          type="button"
                          className="employees-icon-btn"
                          title="Edit"
                          aria-label={`Edit ${displayName}`}
                          onClick={() => openEdit(c)}
                        >
                          <Pencil size={18} />
                        </button>
                        <button
                          type="button"
                          className="employees-icon-btn employees-icon-btn--danger"
                          title="Delete"
                          aria-label={`Delete ${displayName}`}
                          onClick={() => handleDelete(c.id)}
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                    <div className="employees-card-body">
                      <div className="employees-card-field">
                        <span className="employees-card-field-label">Email:</span>
                        <span className="employees-card-field-value">{c.email ?? '—'}</span>
                      </div>
                      <div className="employees-card-field">
                        <span className="employees-card-field-label">Phone:</span>
                        <span className="employees-card-field-value">{c.phone ?? '—'}</span>
                      </div>
                      <div className="employees-card-field">
                        <span className="employees-card-field-label">Address:</span>
                        <span className="employees-card-field-value">{c.address ?? '—'}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {filteredList.length > 0 && (
            <div className="employees-pagination">
              <div className="employees-pagination-per-page">
                <label htmlFor="customers-per-page" className="employees-pagination-label">Show</label>
                <input
                  id="customers-per-page"
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
                Showing {start + 1}–{Math.min(start + perPage, filteredList.length)} of {filteredList.length}
              </div>
              <div className="employees-pagination-nav">
                <button
                  type="button"
                  className="employees-pagination-btn"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
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
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
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

      {showForm && (
        <div className="modal-overlay" onClick={closeForm} role="dialog" aria-modal="true" aria-labelledby="customer-form-title">
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 id="customer-form-title" className="modal-title">{editing ? 'Edit customer' : 'Add customer'}</h2>
              <button type="button" className="modal-close" onClick={closeForm} aria-label="Close">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-field">
                <label htmlFor="cust-fname" className="modal-label">First name</label>
                <input id="cust-fname" type="text" className="modal-input" placeholder="First name" value={fname} onChange={(e) => setFname(e.target.value)} />
              </div>
              <div className="modal-field">
                <label htmlFor="cust-mname" className="modal-label">Middle name</label>
                <input id="cust-mname" type="text" className="modal-input" placeholder="Middle name" value={mname} onChange={(e) => setMname(e.target.value)} />
              </div>
              <div className="modal-field">
                <label htmlFor="cust-lname" className="modal-label">Last name</label>
                <input id="cust-lname" type="text" className="modal-input" placeholder="Last name" value={lname} onChange={(e) => setLname(e.target.value)} required />
              </div>
              <div className="modal-field">
                <label htmlFor="cust-email" className="modal-label">Email</label>
                <input id="cust-email" type="email" className="modal-input" placeholder="email@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="modal-field">
                <label htmlFor="cust-phone" className="modal-label">Phone</label>
                <input id="cust-phone" type="tel" className="modal-input" placeholder="Phone number" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div className="modal-field">
                <label htmlFor="cust-address" className="modal-label">Address</label>
                <input
                  id="cust-address"
                  type="text"
                  className="modal-input"
                  placeholder="Street, city, province..."
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
                {location && (
                  <p className="mt-1.5 text-xs text-slate-500">
                    Latitude: {location.lat.toFixed(6)}, Longitude: {location.lon.toFixed(6)}
                  </p>
                )}
              </div>
              <div className="modal-field space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <MapPin className="h-4 w-4 text-[var(--aa-blue)]" aria-hidden />
                    <span>Pin location (optional)</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={handleUseCurrentLocation} disabled={locLoading} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs sm:text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60">
                      <Crosshair className="h-3.5 w-3.5" aria-hidden />
                      {locLoading ? 'Locating…' : 'Use current location'}
                    </button>
                    <button type="button" onClick={handleRecenter} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs sm:text-sm text-slate-700 hover:bg-slate-50">
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
                        className="flex-1 min-w-0 border border-slate-200 rounded-lg px-3 py-1.5 text-xs sm:text-sm text-slate-900"
                      />
                      <button type="button" onClick={() => handleSearchPlace()} disabled={locLoading} className="px-3 py-1.5 rounded-lg bg-[var(--aa-blue)] text-xs text-white font-medium disabled:opacity-60">
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
                    <p className="text-[11px] text-slate-400">Drag the pin or click on the map to set address.</p>
                  </div>
                )}
                {locError && <p className="text-xs text-red-600">{locError}</p>}
              </div>
              <div className="modal-actions">
                <button type="button" className="employees-btn employees-btn-secondary" onClick={closeForm}>
                  Cancel
                </button>
                <button type="submit" className="employees-btn employees-btn-primary" disabled={submitBusy}>
                  {submitBusy ? 'Saving…' : editing ? 'Save changes' : 'Save'}
                </button>
              </div>
            </form>
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
    </div>
  )
}
