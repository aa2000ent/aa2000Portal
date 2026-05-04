import { useState, useMemo, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useActivityLog } from '../contexts/ActivityLogContext'
import { getPortalAccountId, getPortalUsername, getSessionId } from '../api/client'
import { fetchSessionByToken } from '../api/session'
import { mapSessionLookupToProfile } from '../utils/sessionProfileMap'
import { getCurrentSession, type ActiveSession } from '../utils/sessionUtils'
import ProfileThemeToggle from '../components/ProfileThemeToggle'
import { fetchEmployees, updateEmployee } from '../api/employees'
import { getPortalEmpId } from '../api/client'
import { useRef } from 'react'

const ROLE_LABELS: Record<string, string> = {
  marketing: 'Marketing',
  sale: 'Sale',
  purchasing: 'Purchasing',
  customer: 'Customer',
  supplier: 'Supplier',
  operations: 'Operations',
  finance: 'Finance',
  financial: 'Financial',
  accounting: 'Accounting',
  engineering: 'Engineering',
  technical: 'Technical',
  ceo: 'CEO',
  'co-ceo': 'CO-CEO',
  'general-manager': 'General Manager',
}


function IconCheck() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

export default function PortalProfile() {
  const location = useLocation()
  const { addEntry } = useActivityLog()

  const roleLabel = useMemo(() => {
    const segment = location.pathname.replace(/^\//, '').split('/')[0]
    return ROLE_LABELS[segment] ?? segment
  }, [location.pathname])
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [profilePhoto, setProfilePhoto] = useState<string | undefined>()
  const [saved, setSaved] = useState(false)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileLoadError, setProfileLoadError] = useState(false)
  const [apiRoleName, setApiRoleName] = useState('')
  const [creds, setCreds] = useState<{
    username: string
    accountId: string
    status: string
    sessionAt: string | null
  }>(() => ({
    username: getPortalUsername() ?? '—',
    accountId: getPortalAccountId() ?? '—',
    status: '—',
    sessionAt: null,
  }))

  const [twoFAEnabled, setTwoFAEnabled] = useState(false)
  const [notifEmail, setNotifEmail] = useState(true)
  const [notifSecurity, setNotifSecurity] = useState(true)

  const [changePwOpen, setChangePwOpen] = useState(false)
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwSaved, setPwSaved] = useState(false)
  const [showCurrentPw, setShowCurrentPw] = useState(false)
  const [showNewPw, setShowNewPw] = useState(false)
  const [showConfirmPw, setShowConfirmPw] = useState(false)
  const [sessions, setSessions] = useState<ActiveSession[]>([])
  const [photoUploading, setPhotoUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const displayRole = (apiRoleName || roleLabel).trim()
  const heroName = name.trim() || creds.username || 'Profile'
  const heroInitial = heroName.charAt(0).toUpperCase() || '?'

  useEffect(() => {
    let cancelled = false
    getCurrentSession().then((current) => {
      if (!cancelled) setSessions((prev) => [current, ...prev.filter((s) => !s.current)])
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    const token = getSessionId()?.trim()
    const storedAccId = getPortalAccountId()

    if (!token && !storedAccId) {
      setProfileLoadError(!getPortalUsername())
      return
    }

    setProfileLoading(true)
    setProfileLoadError(false)

    void (async () => {
      // 1. Try session lookup endpoint
      if (token) {
        const data = await fetchSessionByToken(token)
        if (!cancelled && data) {
          setProfileLoading(false)
          const p = mapSessionLookupToProfile(data)
          setName(p.fullName !== '—' ? p.fullName : p.username !== '—' ? p.username : '')
          setEmail(p.email !== '—' ? p.email : '')
          setPhone(p.phone !== '—' ? p.phone : '')
          setApiRoleName(p.roleName !== '—' ? p.roleName : '')
          setCreds({
            username: p.username,
            accountId: p.accountId,
            status: p.accountStatus,
            sessionAt: p.sessionCreatedAt,
          })
          const accIdNum = Number(p.accountId)
          if (accIdNum > 0) {
            try {
              const emps = await fetchEmployees()
              const me = emps.find((e) => e.accId === accIdNum)
              if (!cancelled && me) {
                if (me.photoUrl) setProfilePhoto(me.photoUrl)
                if (me.address) setAddress(me.address)
              }
            } catch { /* optional */ }
          }
          return
        }
      }

      // 2. Fall back to employee record lookup by acc_ID
      const accIdNum = Number(storedAccId ?? 0)
      if (accIdNum > 0) {
        try {
          const emps = await fetchEmployees()
          const me = emps.find((e) => e.accId === accIdNum)
          if (!cancelled && me) {
            setProfileLoading(false)
            setName(me.name !== '—' ? me.name : '')
            setEmail(me.email || '')
            setPhone(me.contact || '')
            if (me.address) setAddress(me.address)
            if (me.photoUrl) setProfilePhoto(me.photoUrl)
            if (me.role) setApiRoleName(me.role)
            return
          }
        } catch { /* fall through */ }
      }

      if (!cancelled) {
        setProfileLoading(false)
        setProfileLoadError(!getPortalUsername())
      }
    })()

    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSave = () => {
    addEntry({ action: 'profile_updated', actor: roleLabel, target: name, details: 'Profile information updated' })
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const handleChangePw = (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentPw || !newPw || newPw !== confirmPw || newPw.length < 8) return
    addEntry({ action: 'password_changed', actor: roleLabel, target: name, details: 'Password updated' })
    setPwSaved(true)
    setTimeout(() => {
      setPwSaved(false)
      setChangePwOpen(false)
      setCurrentPw('')
      setNewPw('')
      setConfirmPw('')
    }, 1500)
  }

  const handleToggle2FA = () => {
    const next = !twoFAEnabled
    setTwoFAEnabled(next)
    addEntry({ action: next ? '2fa_enabled' : '2fa_disabled', actor: roleLabel, target: name, details: next ? 'Two-factor authentication enabled' : 'Two-factor authentication disabled' })
  }

  const handleRevokeSession = (idx: number) => {
    const s = sessions[idx]
    if (s) {
      addEntry({ action: 'session_revoked', actor: roleLabel, target: s.device, details: s.location })
      setSessions((prev) => prev.filter((_, i) => i !== idx))
    }
  }

  const handlePhotoClick = () => {
    fileInputRef.current?.click()
  }

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 5 * 1024 * 1024) {
      alert('Photo is too large. Please select an image under 5MB.')
      return
    }

    const reader = new FileReader()
    reader.onload = async () => {
      const src = reader.result as string
      setPhotoUploading(true)
      try {
        // Resize image to 200px max dimension using Canvas
        const img = new Image()
        const base64 = await new Promise<string>((resolve, reject) => {
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
            if (!ctx) { reject(new Error('No canvas context')); return }

            ctx.drawImage(img, 0, 0, outW, outH)
            resolve(canvas.toDataURL('image/jpeg', 0.8))
          }
          img.onerror = () => reject(new Error('Failed to load image'))
          img.src = src
        })

        const empId = getPortalEmpId()
        const storedAccId = getPortalAccountId()
        const accIdNum = Number(storedAccId ?? 0)

        const emps = await fetchEmployees()
        const me = emps.find((x) => (empId && x.id === empId) || (accIdNum && x.accId === accIdNum))

        if (me) {
          const names = me.name.split(' ')
          const fname = names[0] || 'Employee'
          const lname = names.length > 1 ? names[names.length - 1] : 'User'
          const mname = names.length > 2 ? names.slice(1, -1).join(' ') : ''

          // Strip "data:image/jpeg;base64," prefix before sending to API
          const rawBase64 = base64.split(',')[1]

          const result = await updateEmployee({
            id: me.id,
            fname,
            mname,
            lname,
            email: me.email || email,
            roleName: me.role,
            empImageBase64: rawBase64,
            accId: me.accId,
          })

          if (result) {
            setProfilePhoto(base64)
            addEntry({ action: 'profile_photo_updated', actor: roleLabel, target: name, details: 'Profile photo updated' })
          }
        }
      } catch (err) {
        console.error('Failed to update profile photo:', err)
      } finally {
        setPhotoUploading(false)
      }
    }
    reader.readAsDataURL(file)
  }

  const pwMismatch = confirmPw.length > 0 && newPw !== confirmPw
  const pwTooShort = newPw.length > 0 && newPw.length < 8

  return (
    <div className="dashboard-page dashboard-page--profile">
      <header className="dashboard-page-header">
        <h1 className="dashboard-page-title">Profile</h1>
        <p className="dashboard-page-subtitle">Your account and settings</p>
      </header>
      <div className="dashboard-page-content profile-content">
        <div className="profile-grid-left">
          <section className="profile-hero dashboard-card">
            <div 
              className={`profile-hero-avatar ${photoUploading ? 'profile-hero-avatar--uploading' : ''}`} 
              aria-label="Change profile photo"
              onClick={handlePhotoClick}
              style={{ cursor: 'pointer', position: 'relative' }}
            >
              <span className="profile-hero-initial">{heroInitial}</span>
              {profilePhoto && (
                <img
                  className="profile-hero-photo"
                  src={profilePhoto}
                  alt={heroName}
                  onError={() => setProfilePhoto(undefined)}
                />
              )}
              <div className="profile-hero-avatar-overlay">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              </div>
              <input 
                type="file" 
                ref={fileInputRef} 
                style={{ display: 'none' }} 
                accept="image/*" 
                onChange={handlePhotoChange} 
              />
            </div>
            <div className="profile-hero-info">
              <h2 className="profile-hero-name">{heroName}</h2>
              <span className="profile-hero-role">{displayRole}</span>
              <p className="profile-hero-email">{email || creds.username}</p>
              {profileLoading && <p className="profile-hero-meta">Loading account…</p>}
              {profileLoadError && !profileLoading && (
                <p className="profile-hero-meta profile-hero-meta--warn">Could not load full profile from the server. Showing saved sign-in details only.</p>
              )}
            </div>
          </section>

          <section className="dashboard-card">
            <h2 className="dashboard-card-title">Your account</h2>
            <p className="dashboard-card-desc">Credentials for the user currently signed in.</p>
            <div className="profile-form profile-form--readonly">
              <div className="profile-field">
                <span className="modal-label">Username</span>
                <div className="profile-readonly">{creds.username}</div>
              </div>
              <div className="profile-field">
                <span className="modal-label">Account ID</span>
                <div className="profile-readonly">{creds.accountId}</div>
              </div>
              <div className="profile-field">
                <span className="modal-label">Role</span>
                <div className="profile-readonly">{displayRole}</div>
              </div>
              <div className="profile-field">
                <span className="modal-label">Account status</span>
                <div className="profile-readonly">{creds.status}</div>
              </div>
              <div className="profile-field">
                <span className="modal-label">Session started</span>
                <div className="profile-readonly">
                  {creds.sessionAt
                    ? new Date(creds.sessionAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
                    : '—'}
                </div>
              </div>
            </div>
          </section>

          <section className="dashboard-card">
            <h2 className="dashboard-card-title">Appearance</h2>
            <p className="dashboard-card-desc">Light or dark interface for the whole portal.</p>
            <ProfileThemeToggle />
          </section>

          <section className="dashboard-card">
            <h2 className="dashboard-card-title">Personal information</h2>
            <p className="dashboard-card-desc">Update your name, email, and contact info.</p>
            <div className="profile-form">
              <div className="profile-field">
                <label htmlFor="portal-profile-name" className="modal-label">Full name</label>
                <input id="portal-profile-name" type="text" className="modal-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" />
              </div>
              <div className="profile-field">
                <label htmlFor="portal-profile-email" className="modal-label">Email</label>
                <input id="portal-profile-email" type="email" className="modal-input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
              </div>
              <div className="profile-field">
                <label htmlFor="portal-profile-phone" className="modal-label">Phone</label>
                <input id="portal-profile-phone" type="tel" className="modal-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+63 9XX XXX XXXX" />
              </div>
              <div className="profile-field">
                <label htmlFor="portal-profile-address" className="modal-label">Address</label>
                <input id="portal-profile-address" type="text" className="modal-input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, city, province..." />
              </div>
              <div className="profile-actions">
                <button type="button" className={`employees-btn employees-btn-primary profile-save-btn ${saved ? 'profile-save-btn--saved' : ''}`} onClick={handleSave}>
                  {saved ? (<><span className="profile-save-icon"><IconCheck /></span>Saved</>) : 'Save changes'}
                </button>
              </div>
            </div>
          </section>

          <section className="dashboard-card">
            <h2 className="dashboard-card-title">Notification preferences</h2>
            <p className="dashboard-card-desc">Choose which notifications you receive.</p>
            <div className="profile-notif-list">
              <label className="profile-notif-item">
                <div className="profile-notif-text">
                  <span className="profile-notif-label">Email notifications</span>
                  <span className="profile-notif-desc">Receive updates and alerts via email</span>
                </div>
                <div className={`profile-toggle ${notifEmail ? 'profile-toggle--on' : ''}`} onClick={() => setNotifEmail((v) => !v)} role="switch" aria-checked={notifEmail} tabIndex={0}>
                  <div className="profile-toggle-knob" />
                </div>
              </label>
              <label className="profile-notif-item">
                <div className="profile-notif-text">
                  <span className="profile-notif-label">Security alerts</span>
                  <span className="profile-notif-desc">Important security and login notifications</span>
                </div>
                <div className={`profile-toggle ${notifSecurity ? 'profile-toggle--on' : ''}`} onClick={() => setNotifSecurity((v) => !v)} role="switch" aria-checked={notifSecurity} tabIndex={0}>
                  <div className="profile-toggle-knob" />
                </div>
              </label>
            </div>
          </section>
        </div>

        <div className="profile-grid-right">
          <section className="dashboard-card">
            <h2 className="dashboard-card-title">Account &amp; security</h2>
            <p className="dashboard-card-desc">Password and security options.</p>
            <div className="profile-security">
              <div className="profile-security-row">
                <div className="profile-security-text">
                  <p className="profile-security-label">Password</p>
                  <p className="profile-security-desc">Password details are managed by the backend.</p>
                </div>
                <button type="button" className="employees-btn employees-btn-secondary" onClick={() => { setChangePwOpen(true); setCurrentPw(''); setNewPw(''); setConfirmPw(''); setPwSaved(false) }}>
                  Change password
                </button>
              </div>
              <div className="profile-security-row">
                <div className="profile-security-text">
                  <p className="profile-security-label">Two-factor authentication</p>
                  <p className="profile-security-desc">{twoFAEnabled ? 'Your account is secured with 2FA' : 'Add extra security to your account'}</p>
                </div>
                <div className="profile-security-right">
                  <span className={`profile-badge ${twoFAEnabled ? 'profile-badge--on' : 'profile-badge--off'}`}>{twoFAEnabled ? 'On' : 'Off'}</span>
                  <div className={`profile-toggle ${twoFAEnabled ? 'profile-toggle--on' : ''}`} onClick={handleToggle2FA} role="switch" aria-checked={twoFAEnabled} tabIndex={0}>
                    <div className="profile-toggle-knob" />
                  </div>
                </div>
              </div>
              <div className="profile-security-row">
                <div className="profile-security-text">
                  <p className="profile-security-label">Login activity</p>
                  <p className="profile-security-desc">Login activity is provided by the backend.</p>
                </div>
              </div>
            </div>
          </section>

          <section className="dashboard-card">
            <h2 className="dashboard-card-title">Active sessions</h2>
            <p className="dashboard-card-desc">Devices where you're currently signed in.</p>
            <div className="profile-sessions">
              {sessions.length === 0 ? (
                <p className="profile-sessions-empty">No active sessions.</p>
              ) : sessions.map((s, i) => (
                <div key={i} className="profile-session-row">
                  <div className="profile-session-icon" aria-hidden>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      {s.device.includes('iPhone') || s.device.includes('Android') ? (
                        <><rect x="5" y="2" width="14" height="20" rx="2" ry="2" /><line x1="12" y1="18" x2="12.01" y2="18" /></>
                      ) : (
                        <><rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></>
                      )}
                    </svg>
                  </div>
                  <div className="profile-session-info">
                    <span className="profile-session-device">
                      {s.device}
                      {s.current && <span className="profile-badge profile-badge--current">This device</span>}
                    </span>
                    <span className="profile-session-meta">{s.location} &middot; {s.lastActive}</span>
                  </div>
                  {!s.current && (
                    <button type="button" className="employees-btn employees-btn-secondary employees-btn--sm profile-revoke-btn" onClick={() => handleRevokeSession(i)}>
                      Revoke
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      {changePwOpen && (
        <div className="modal-backdrop" onClick={() => !pwSaved && setChangePwOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="portal-pw-title" aria-modal="true">
            <h2 id="portal-pw-title" className="modal-title">Change password</h2>
            <form className="modal-body" onSubmit={handleChangePw}>
              <div className="modal-field">
                <label htmlFor="portal-pw-current" className="modal-label">Current password</label>
                <div className="profile-pw-wrap">
                  <input id="portal-pw-current" type={showCurrentPw ? 'text' : 'password'} className="modal-input" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} required autoFocus />
                  <button type="button" className="profile-pw-toggle" onClick={() => setShowCurrentPw((v) => !v)} aria-label={showCurrentPw ? 'Hide' : 'Show'}>{showCurrentPw ? 'Hide' : 'Show'}</button>
                </div>
              </div>
              <div className="modal-field">
                <label htmlFor="portal-pw-new" className="modal-label">New password</label>
                <div className="profile-pw-wrap">
                  <input id="portal-pw-new" type={showNewPw ? 'text' : 'password'} className={`modal-input ${pwTooShort ? 'modal-input--error' : ''}`} value={newPw} onChange={(e) => setNewPw(e.target.value)} required minLength={8} />
                  <button type="button" className="profile-pw-toggle" onClick={() => setShowNewPw((v) => !v)} aria-label={showNewPw ? 'Hide' : 'Show'}>{showNewPw ? 'Hide' : 'Show'}</button>
                </div>
                {pwTooShort && <p className="profile-pw-hint profile-pw-hint--error">Must be at least 8 characters</p>}
              </div>
              <div className="modal-field">
                <label htmlFor="portal-pw-confirm" className="modal-label">Confirm new password</label>
                <div className="profile-pw-wrap">
                  <input id="portal-pw-confirm" type={showConfirmPw ? 'text' : 'password'} className={`modal-input ${pwMismatch ? 'modal-input--error' : ''}`} value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} required />
                  <button type="button" className="profile-pw-toggle" onClick={() => setShowConfirmPw((v) => !v)} aria-label={showConfirmPw ? 'Hide' : 'Show'}>{showConfirmPw ? 'Hide' : 'Show'}</button>
                </div>
                {pwMismatch && <p className="profile-pw-hint profile-pw-hint--error">Passwords do not match</p>}
              </div>
              <div className="modal-actions">
                <button type="button" className="employees-btn employees-btn-secondary" onClick={() => setChangePwOpen(false)}>Cancel</button>
                <button type="submit" className={`employees-btn employees-btn-primary profile-save-btn ${pwSaved ? 'profile-save-btn--saved' : ''}`} disabled={!currentPw || !newPw || pwMismatch || pwTooShort}>
                  {pwSaved ? (<><span className="profile-save-icon"><IconCheck /></span>Saved</>) : 'Update password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
