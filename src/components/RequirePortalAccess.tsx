import { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { getSessionId, isPortalSessionActive, clearSessionId, clearPortalHomeSegment, setPortalHomeSegment } from '../api/client'
import { fetchSessionByToken } from '../api/session'
import { resolvePortalRouteFromAccount } from '../api/auth'

// In-memory segment cache to survive client-side routing but reset on page reload
let verifiedHomeSegment: string | null = null

/**
 * Ensures the user is signed in and only sees routes for their portal segment
 * (verified against the database: `admin`, `marketing`, `finance`, `engineering`, `general-manager`).
 */
export default function RequirePortalAccess() {
  const location = useLocation()
  const [isValidating, setIsValidating] = useState(!verifiedHomeSegment)
  const [validatedSegment, setValidatedSegment] = useState<string | null>(verifiedHomeSegment)

  useEffect(() => {
    if (verifiedHomeSegment) {
      setIsValidating(false)
      return
    }

    const token = getSessionId()
    if (!token) {
      setIsValidating(false)
      return
    }

    let active = true
    async function verify() {
      try {
        const data = await fetchSessionByToken(token!)
        if (!data || !data.account) {
          throw new Error('Invalid session')
        }
        
        // Resolve the true route from the verified database account details
        const route = await resolvePortalRouteFromAccount(data.account as any)
        if (active) {
          verifiedHomeSegment = route
          setPortalHomeSegment(route) // Sync with fallback
          setValidatedSegment(route)
          setIsValidating(false)
        }
      } catch (err) {
        console.error('[Auth Guard] Session verification failed:', err)
        if (active) {
          verifiedHomeSegment = null
          clearSessionId()
          clearPortalHomeSegment()
          setValidatedSegment(null)
          setIsValidating(false)
        }
      }
    }

    void verify()
    return () => {
      active = false
    }
  }, [])

  if (!isPortalSessionActive()) {
    return <Navigate to="/" replace state={{ from: location.pathname }} />
  }

  if (isValidating) {
    return (
      <div className="flex h-screen h-dvh w-full flex-col items-center justify-center bg-[var(--aa-navy)] p-6 text-center text-white" style={{ background: 'var(--aa-app-bg-gradient)' }}>
        <div className="relative mb-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/20 border-t-[var(--aa-blue)]" />
        </div>
        <span className="text-sm font-medium text-white/80 animate-pulse">Verifying Session...</span>
      </div>
    )
  }

  if (!validatedSegment) {
    return <Navigate to="/" replace />
  }

  const path = location.pathname.replace(/^\//, '')
  const firstSeg = path.split('/')[0] ?? ''

  if (firstSeg === validatedSegment) {
    return <Outlet />
  }

  return <Navigate to={`/${validatedSegment}`} replace />
}
