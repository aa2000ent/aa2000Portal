import { useState, useMemo, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useActivityLog } from '../contexts/ActivityLogContext'
import { getCurrentSession, type ActiveSession } from '../utils/sessionUtils'
import ProfileThemeToggle from '../components/ProfileThemeToggle'

const ROLE_LABELS: Record<string, string> = {
  marketing: 'Marketing',
  finance: 'Finance',
  engineering: 'Engineering',
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
  const [saved, setSaved] = useState(false)

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

  useEffect(() => {
    let cancelled = false
    getCurrentSession().then((current) => {
      if (!cancelled) setSessions((prev) => [current, ...prev.filter((s) => !s.current)])
    })
    return () => { cancelled = true }
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
            <div className="profile-hero-avatar" aria-hidden>
              <span className="profile-hero-initial">{name.charAt(0)}</span>
            </div>
            <div className="profile-hero-info">
              <h2 className="profile-hero-name">{name}</h2>
              <span className="profile-hero-role">{roleLabel}</span>
              <p className="profile-hero-email">{email}</p>
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
                <label className="modal-label">Role</label>
                <div className="profile-readonly">{roleLabel}</div>
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
