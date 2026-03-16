import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { MapPin, Crosshair } from 'lucide-react'
import logoImg from '../assets/logo/logo.avif'
import { registerAccount } from '../api/auth'
import { hasApiBase } from '../api/client'
import { fetchRoles, type RoleOption } from '../api/roles'
import { reverseGeocode, searchPlaces } from '../api/geo'

const inputClass =
  'w-full h-12 min-h-12 px-4 text-base text-slate-900 bg-slate-50 border border-slate-200 rounded-lg transition-colors hover:bg-slate-100 hover:border-slate-300 focus:outline-none focus:border-[var(--aa-blue-dark)] focus:ring-2 focus:ring-[color:var(--aa-blue)]/20 placeholder:text-slate-400'

const DEFAULT_LOCATION = { lat: 14.5995, lon: 120.9842 }
type LatLon = { lat: number; lon: number }

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

export default function Register() {
  const navigate = useNavigate()
  const [roleOptions, setRoleOptions] = useState<RoleOption[]>([])
  const [rolesLoading, setRolesLoading] = useState(true)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [role_ID, setRole_ID] = useState(0)
  const [Emp_fname, setEmp_fname] = useState('')
  const [Emp_mname, setEmp_mname] = useState('')
  const [Emp_lname, setEmp_lname] = useState('')
  const [Emp_email, setEmp_email] = useState('')
  const [Emp_cnum, setEmp_cnum] = useState('')
  const [address, setAddress] = useState('')
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [location, setLocation] = useState<LatLon | null>(DEFAULT_LOCATION)
  const [locLoading, setLocLoading] = useState(false)
  const [locError, setLocError] = useState<string | null>(null)
  const [locQuery, setLocQuery] = useState('')
  const [locResults, setLocResults] = useState<{ displayName: string; lat: number; lon: number }[]>([])

  useEffect(() => {
    const html = document.documentElement
    const body = document.body
    const prevHtmlOverflow = html.style.overflow
    const prevBodyOverflow = body.style.overflow
    const prevBodyHeight = body.style.height
    const prevBodyOverscroll = (body.style as CSSStyleDeclaration & { overscrollBehavior?: string }).overscrollBehavior
    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    body.style.height = '100%'
    ;(body.style as CSSStyleDeclaration & { overscrollBehavior?: string }).overscrollBehavior = 'none'
    return () => {
      html.style.overflow = prevHtmlOverflow
      body.style.overflow = prevBodyOverflow
      body.style.height = prevBodyHeight
      ;(body.style as CSSStyleDeclaration & { overscrollBehavior?: string }).overscrollBehavior = prevBodyOverscroll ?? ''
    }
  }, [])

  const applyReverseGeocode = async (lat: number, lon: number) => {
    try {
      const addr = await reverseGeocode(lat, lon)
      const street = addr.street ?? ''
      const municipality = addr.city ?? ''
      const province = addr.province ?? ''
      const postal = addr.postcode ?? ''
      const pieces = [street, municipality, province, postal].filter(Boolean)
      if (pieces.length) {
        setAddress(pieces.join(', '))
        return
      }
    } catch {
      // ignore
    }
    setAddress(`${lat.toFixed(5)}, ${lon.toFixed(5)}`)
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
    setLocError(null)
    setLocLoading(true)
    try {
      const mapped = await searchPlaces(q)
      setLocResults(mapped)
      if (!mapped.length) setLocError('No places found. Try a more specific search.')
    } catch (err) {
      setLocError(err instanceof Error ? err.message : 'Failed to search for that place.')
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
          if (!mapped.length) setLocError('No places found. Try a more specific search.')
        })
        .catch((err) => {
          setLocError(err instanceof Error ? err.message : 'Failed to search for that place.')
          setLocResults([])
        })
        .finally(() => setLocLoading(false))
    }, 400)
    return () => clearTimeout(t)
  }, [locQuery])

  useEffect(() => {
    if (!hasApiBase()) {
      setRolesLoading(false)
      return
    }
    fetchRoles()
      .then((list) => setRoleOptions(list))
      .catch(() => setRoleOptions([]))
      .finally(() => setRolesLoading(false))
  }, [])

  useEffect(() => {
    if (roleOptions.length > 0 && role_ID === 0) setRole_ID(roleOptions[0].role_ID)
  }, [roleOptions])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!hasApiBase()) {
      setError('API is not configured. Set VITE_API_BASE_URL in .env and restart the dev server.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    if (roleOptions.length > 0 && role_ID <= 0) {
      setError('Please select an account role')
      return
    }
    setIsSubmitting(true)
    try {
      await registerAccount({
        username: username.trim(),
        password,
        role_ID,
        Emp_fname: Emp_fname.trim(),
        Emp_lname: Emp_lname.trim(),
        Emp_AddressID: 0,
        Emp_email: Emp_email.trim() || undefined,
        Emp_mname: Emp_mname.trim() || undefined,
        Emp_cnum: Emp_cnum.trim() || undefined,
        Emp_role: role_ID,
      })
      navigate('/', { replace: true })
    } catch (err) {
      console.error('[Register] Failed:', err)
      setError(err instanceof Error ? err.message : 'Registration failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="h-screen h-dvh flex items-center justify-center p-4 sm:p-6 md:p-8 relative overflow-hidden bg-gradient-to-br from-[var(--aa-navy)] via-[var(--aa-navy-light)] to-[var(--aa-blue-dark)] bg-fixed">
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
        <div className="absolute w-[min(50vw,320px)] h-[min(50vw,320px)] -top-[10%] -left-[5%] rounded-full bg-[var(--aa-blue-dark)] blur-[100px] opacity-20" />
        <div className="absolute w-[min(40vw,280px)] h-[min(40vw,280px)] -bottom-[10%] -right-[5%] rounded-full bg-[var(--aa-cyan)] blur-[100px] opacity-15" />
      </div>

      <div className="login-card w-full max-w-[440px] xl:max-w-[480px] relative z-10 bg-white border border-slate-200/80 rounded-xl shadow-[0_4px_24px_rgba(15,23,42,0.06)] p-6 sm:p-8 md:p-9 max-h-[90dvh] overflow-y-auto">
        <div className="text-center mb-6">
          <img src={logoImg} alt="AA2000" className="block mx-auto mb-2 max-h-[120px] w-auto object-contain" />
          <h1 className="m-0 text-xl md:text-[1.375rem] font-semibold text-slate-900 tracking-tight leading-tight">Portal</h1>
          <p className="mt-1.5 text-sm text-slate-500">Create your account</p>
        </div>

        <form className="flex flex-col gap-4 overflow-visible" onSubmit={handleSubmit} autoComplete="off">
          <input
            id="reg-username"
            name="username"
            type="text"
            autoComplete="off"
            className={inputClass}
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            aria-label="Username"
          />

          <div className="login-password-wrap relative flex items-center">
            <input
              id="reg-password"
              name="password"
              type={passwordVisible ? 'text' : 'password'}
              className={`login-password-input ${inputClass} pr-12`}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
              aria-label="Password"
            />
            <button
              type="button"
              className="login-password-toggle absolute right-1 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center min-w-10 min-h-10 p-0 text-slate-500 bg-transparent border-none rounded-lg cursor-pointer hover:text-[var(--aa-blue-dark)] hover:bg-[var(--aa-bg-light)]"
              onClick={() => setPasswordVisible((v) => !v)}
              title={passwordVisible ? 'Hide password' : 'Show password'}
              aria-label={passwordVisible ? 'Hide password' : 'Show password'}
            >
              {passwordVisible ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              )}
            </button>
          </div>

          <input
            id="reg-confirm"
            name="confirmPassword"
            type="password"
            className={`login-password-input ${inputClass}`}
            placeholder="Confirm password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            required
            aria-label="Confirm password"
          />

          <label className="block text-sm font-medium text-slate-600 mt-1">Account role</label>
          <select
            id="reg-role"
            value={role_ID}
            onChange={(e) => setRole_ID(Number(e.target.value))}
            className={inputClass}
            required
            disabled={rolesLoading}
            aria-label="Account role"
          >
            {rolesLoading ? (
              <option value="">Loading roles…</option>
            ) : roleOptions.length === 0 ? (
              <option value="">No roles from server</option>
            ) : (
              <>
                <option value={0}>— Select role —</option>
                {roleOptions.map((o) => (
                  <option key={o.role_ID} value={o.role_ID}>{o.role_name}</option>
                ))}
              </>
            )}
          </select>

          <input
            id="reg-fname"
            name="Emp_fname"
            type="text"
            autoComplete="given-name"
            className={inputClass}
            placeholder="First name *"
            value={Emp_fname}
            onChange={(e) => setEmp_fname(e.target.value)}
            required
            aria-label="First name"
          />
          <input
            id="reg-mname"
            name="Emp_mname"
            type="text"
            autoComplete="additional-name"
            className={inputClass}
            placeholder="Middle name"
            value={Emp_mname}
            onChange={(e) => setEmp_mname(e.target.value)}
            aria-label="Middle name"
          />
          <input
            id="reg-lname"
            name="Emp_lname"
            type="text"
            autoComplete="family-name"
            className={inputClass}
            placeholder="Last name *"
            value={Emp_lname}
            onChange={(e) => setEmp_lname(e.target.value)}
            required
            aria-label="Last name"
          />
          <input
            id="reg-email"
            name="Emp_email"
            type="email"
            autoComplete="email"
            className={inputClass}
            placeholder="Email"
            value={Emp_email}
            onChange={(e) => setEmp_email(e.target.value)}
            aria-label="Email"
          />
          <input
            id="reg-cnum"
            name="Emp_cnum"
            type="tel"
            autoComplete="tel"
            className={inputClass}
            placeholder="Phone"
            value={Emp_cnum}
            onChange={(e) => setEmp_cnum(e.target.value)}
            aria-label="Phone"
          />

          <div className="space-y-1">
            <label htmlFor="reg-address" className="block text-sm font-medium text-slate-600">Address</label>
            <input
              id="reg-address"
              type="text"
              className={inputClass}
              placeholder="Pin location on map below or type address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              aria-label="Address"
            />
            {location && (
              <p className="text-xs text-slate-500">
                Latitude: {location.lat.toFixed(6)}, Longitude: {location.lon.toFixed(6)}
              </p>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <MapPin className="h-4 w-4 text-blue-600" aria-hidden />
                <span>Pin your location (optional)</span>
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
                    className="flex-1 min-w-0 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900"
                  />
                  <button
                    type="button"
                    onClick={() => handleSearchPlace()}
                    disabled={locLoading}
                    className="px-3 py-2 rounded-lg bg-[var(--aa-blue)] text-xs text-white font-medium disabled:opacity-60"
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
                  Drag the pin or click on the map. Address above updates automatically.
                </p>
              </div>
            )}
            {locError && <p className="text-xs text-red-600">{locError}</p>}
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3" role="alert">
              {error}
            </div>
          )}

          <button
            type="submit"
            className={`w-full min-h-12 py-3 px-6 mt-2 text-[0.9375rem] font-semibold text-white bg-[var(--aa-blue)] border-none rounded-lg cursor-pointer shadow-sm transition-colors hover:bg-[var(--aa-blue-dark)] hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-90 relative disabled:pointer-events-none ${isSubmitting ? 'text-transparent' : ''}`}
            disabled={isSubmitting}
          >
            {isSubmitting && <span className="absolute left-1/2 top-1/2 -ml-[11px] -mt-[11px] w-[22px] h-[22px] border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden />}
            Create account
          </button>
        </form>

        <p className="mt-6 pt-5 border-t border-slate-100 text-center text-sm text-slate-500">
          Already have an account? <Link to="/" className="font-medium text-[var(--aa-blue-dark)] no-underline hover:text-[var(--aa-blue)] hover:underline">Sign in</Link>
        </p>
        <p className="mt-3 pt-2 text-center text-xs text-slate-500 opacity-85">© 2025 AA2000 Security and Technology Solutions Inc.</p>
      </div>
    </div>
  )
}
