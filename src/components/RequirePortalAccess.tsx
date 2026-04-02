import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { getPortalHomeSegment, isPortalSessionActive } from '../api/client'

/**
 * Ensures the user is signed in and only sees routes for their portal segment
 * (set at login: `admin`, `marketing`, `finance`, `engineering`, `general-manager`).
 */
export default function RequirePortalAccess() {
  const location = useLocation()
  const homeSeg = getPortalHomeSegment()

  if (!isPortalSessionActive()) {
    return <Navigate to="/" replace state={{ from: location.pathname }} />
  }

  if (!homeSeg) {
    return <Navigate to="/" replace />
  }

  const path = location.pathname.replace(/^\//, '')
  const firstSeg = path.split('/')[0] ?? ''

  if (firstSeg === homeSeg) {
    return <Outlet />
  }

  return <Navigate to={`/${homeSeg}`} replace />
}
