import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import logoImg from '../assets/logo/logo.avif'
import { useActivityLog } from '../contexts/ActivityLogContext'
import { accountDisplayUsername, loginVerification, resolvePortalRouteFromAccount } from '../api/auth'
import { apiRequest, getPortalHomeSegment, hasApiBase, isPortalSessionActive, setPortalHomeSegment } from '../api/client'
import { setupPushNotifications } from '../utils/pushNotifications'
import AuthThemeToggle from '../components/AuthThemeToggle'

export default function Login() {
  const navigate = useNavigate()
  const { addEntry } = useActivityLog()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showClearSession, setShowClearSession] = useState(false)
  const [showPinModal, setShowPinModal] = useState(false)
  const [pin, setPin] = useState('')
  const [isClearingSession, setIsClearingSession] = useState(false)
  const [clearSessionSuccess, setClearSessionSuccess] = useState(false)

  const toFriendlyLoginError = (err: unknown): string => {
    const raw = err instanceof Error ? err.message : String(err ?? '')
    const msg = raw.toLowerCase()
    if (
      msg.includes('active session') ||
      msg.includes('already logged in') ||
      msg.includes('already has an active session') ||
      msg.includes('active_session_exists')
    ) {
      setShowClearSession(true)
      return 'This account is already logged in on another device. Logout there first before signing in here.'
    }
    return raw || 'Sign in failed'
  }

  useEffect(() => {
    const home = getPortalHomeSegment()
    if (isPortalSessionActive() && home) {
      navigate(`/${home}`, { replace: true })
    }
  }, [navigate])

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setShowClearSession(false)
    setClearSessionSuccess(false)
    setIsSubmitting(true)
    try {
      if (!hasApiBase()) {
        throw new Error('API is not configured. Set VITE_API_BASE_URLS or VITE_API_BASE_URL in .env and restart the dev server.')
      }
      const res = await loginVerification({ username: username.trim(), password })
      const route = await resolvePortalRouteFromAccount(res.account)
      const roleLabel = accountDisplayUsername(res.account) || username.trim()
      setPortalHomeSegment(route)
      addEntry({ action: 'sign_in', actor: roleLabel, target: 'Portal', details: `${roleLabel} dashboard` })
      void setupPushNotifications()
      navigate(`/${route}`, { replace: true })
    } catch (err) {
      console.error('[Login] Sign in failed:', err)
      setError(toFriendlyLoginError(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleVerifyPin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (pin.length !== 6) {
      alert('Please enter a 6-digit PIN')
      return
    }
    setIsClearingSession(true)
    try {
      const res = await apiRequest<{ message: string; cleared: boolean }>(
        '/security/verify-pin-clearsession',
        {
          method: 'POST',
          body: JSON.stringify({ username: username.trim(), pin })
        }
      )
      if (res.cleared) {
        setClearSessionSuccess(true)
        setShowPinModal(false)
        setShowClearSession(false)
        setError('Session cleared! You can now sign in.')
        setPin('')
      } else {
        alert(res.message || 'Failed to clear session')
      }
    } catch (err) {
      console.error('[Login] PIN verification failed:', err)
      alert(err instanceof Error ? err.message : 'PIN verification failed')
    } finally {
      setIsClearingSession(false)
    }
  }

  return (
    <div className="aa-app-shell h-screen h-dvh flex items-center justify-center p-4 sm:p-6 md:p-8 overflow-hidden">
      <AuthThemeToggle />
      <div className="login-card auth-card w-full max-w-[400px] xl:max-w-[440px] relative z-10 p-6 sm:p-8 md:p-9">
        <div className="text-center mb-7">
          <img src={logoImg} alt="AA2000" className="block mx-auto mb-2 max-h-[140px] w-auto object-contain" />
          <h1 className="auth-text-primary m-0 text-xl md:text-[1.375rem] font-semibold tracking-tight leading-tight">Portal</h1>
          <p className="auth-text-muted mt-1.5 text-sm inline-flex items-center justify-center gap-1.5 flex-wrap">
            <span className="inline-flex items-center text-[var(--aa-blue-dark)] shrink-0" aria-hidden>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </span>
            Sign in to your account
          </p>
        </div>

        <form className="flex flex-col gap-5 overflow-visible" onSubmit={handleSubmit} autoComplete="off">
          <div className="login-password-wrap">
            <input
              id="username"
              name="username"
              type="text"
              autoComplete="off"
              className="auth-input placeholder:text-slate-400"
              placeholder="Username or email"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              aria-label="Username or email"
            />
          </div>

          <div className="login-password-wrap relative flex items-center">
            <input
              id="password"
              name="password"
              type={passwordVisible ? 'text' : 'password'}
              className="login-password-input auth-input pr-12 placeholder:text-slate-400"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              aria-label="Password"
            />
            <button
              type="button"
              className="login-password-toggle auth-password-toggle absolute right-1 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center min-w-11 min-h-11 w-10 h-10 p-0 bg-transparent border-none rounded-lg cursor-pointer transition-colors"
              onClick={() => setPasswordVisible((v) => !v)}
              title={passwordVisible ? 'Hide password' : 'Show password'}
              aria-label={passwordVisible ? 'Hide password' : 'Show password'}
            >
              <span className="inline-flex items-center justify-center" key={passwordVisible ? 'show' : 'hide'} aria-hidden>
                {passwordVisible ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                )}
              </span>
            </button>
          </div>

          {error && (
            <div className={`auth-alert--${clearSessionSuccess ? 'success' : 'error'}`} role="alert">
              {error}
              {showClearSession && (
                <div className="mt-4 pt-3 border-t border-red-200/50">
                  <button
                    type="button"
                    className="flex items-center justify-center gap-2 w-full py-2 px-4 rounded-lg bg-red-600 text-white text-xs font-bold uppercase tracking-wider hover:bg-red-700 transition-all shadow-sm hover:shadow-md"
                    onClick={() => setShowPinModal(true)}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3-3.5 3.5z" /></svg>
                    Clear my session
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-between flex-wrap gap-3">
            <label className="auth-text-muted inline-flex items-center gap-2 text-sm cursor-pointer select-none" htmlFor="remember">
              <input
                id="remember"
                name="remember"
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="peer sr-only"
              />
              <span className="auth-checkbox-box w-[1.125rem] h-[1.125rem] shrink-0 border-2 border-slate-200 rounded bg-white inline-block relative transition-colors peer-checked:bg-[var(--aa-blue)] peer-checked:border-[var(--aa-blue)] after:absolute after:left-[5px] after:top-0.5 after:w-[5px] after:h-[9px] after:border-2 after:border-white after:border-l-0 after:border-t-0 after:rotate-45 after:content-[''] after:opacity-0 peer-checked:after:opacity-100" aria-hidden />
              <span>Remember me</span>
            </label>
            <a href="#" className="text-sm font-medium text-[var(--aa-blue-dark)] no-underline transition-colors hover:text-[var(--aa-blue)] hover:underline">Forgot password?</a>
          </div>

          <button
            type="submit"
            className={`w-full min-h-12 py-3 px-6 mt-1 text-[0.9375rem] font-semibold text-white bg-[var(--aa-blue)] border-none rounded-lg cursor-pointer shadow-sm transition-colors hover:bg-[var(--aa-blue-dark)] hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-90 relative disabled:pointer-events-none ${isSubmitting ? 'text-transparent' : ''}`}
            disabled={isSubmitting}
          >
            {isSubmitting && <span className="absolute left-1/2 top-1/2 -ml-[11px] -mt-[11px] w-[22px] h-[22px] border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden />}
            Sign in
          </button>
        </form>

        <p className="auth-footer auth-text-muted mt-7 pt-6 text-center text-sm">
          Don't have an account? <Link to="/register" className="font-medium text-[var(--aa-blue-dark)] no-underline hover:text-[var(--aa-blue)] hover:underline">Register</Link>
        </p>
        <p className="auth-text-muted mt-4 pt-3 text-center text-xs opacity-85">© 2025 AA2000 Security and Technology Solutions Inc.</p>
      </div>
      {showPinModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-[8px] z-[1000] flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.2)] w-full max-w-[360px] overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-10 duration-400 ease-out">
            <div className="h-1.5 w-full bg-[var(--aa-blue)]" />
            
            <div className="p-7">
              <div className="flex justify-between items-start mb-5">
                <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-[var(--aa-blue)]">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                </div>
                <button 
                  type="button" 
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors"
                  onClick={() => { setShowPinModal(false); setPin(''); }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                </button>
              </div>

              <h2 className="text-xl font-bold text-slate-900 mb-2">Security Verification</h2>
              <p className="text-[13px] leading-relaxed text-slate-500 mb-8">
                To clear the existing session for <span className="font-semibold text-slate-800">{username}</span>, please enter your security PIN.
              </p>
              
              <form onSubmit={handleVerifyPin}>
                <div className="relative mb-8">
                  <input
                    type="text"
                    pattern="\d*"
                    maxLength={6}
                    placeholder="••••••"
                    className="w-full text-center text-3xl tracking-[0.75rem] font-bold py-4 border-2 border-slate-100 bg-slate-50 rounded-xl focus:border-[var(--aa-blue)] focus:bg-white focus:outline-none transition-all placeholder:text-slate-200 placeholder:tracking-normal"
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                    required
                    autoFocus
                  />
                  <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 flex gap-1.5">
                    {[...Array(6)].map((_, i) => (
                      <div 
                        key={i} 
                        className={`w-1.5 h-1.5 rounded-full transition-colors duration-300 ${pin.length > i ? 'bg-[var(--aa-blue)]' : 'bg-slate-200'}`} 
                      />
                    ))}
                  </div>
                </div>
                
                <div className="flex flex-col gap-3">
                  <button
                    type="submit"
                    className="w-full py-3.5 text-[15px] font-bold text-white bg-[var(--aa-blue)] hover:bg-[var(--aa-blue-dark)] rounded-xl shadow-md hover:shadow-lg transition-all active:scale-[0.98] disabled:opacity-70 disabled:pointer-events-none flex items-center justify-center gap-2"
                    disabled={isClearingSession || pin.length !== 6}
                  >
                    {isClearingSession ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Verifying...
                      </>
                    ) : (
                      'Confirm Identity'
                    )}
                  </button>
                  <button
                    type="button"
                    className="w-full py-3 text-sm font-semibold text-slate-500 hover:text-slate-700 bg-transparent rounded-xl transition-colors"
                    onClick={() => {
                      setShowPinModal(false)
                      setPin('')
                    }}
                    disabled={isClearingSession}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
