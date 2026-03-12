/**
 * Detect browser and OS from user agent for accurate "active session" device label.
 * Order matters: check more specific identifiers first (e.g. Edg before Chrome).
 */
export function getDeviceString(): string {
  if (typeof navigator === 'undefined' || !navigator.userAgent) return 'Unknown device'
  const ua = navigator.userAgent
  const nav = navigator as Navigator & { userAgentData?: { platform?: string; mobile?: boolean } }
  let browser = 'Unknown browser'
  let os = 'Unknown'

  // --- Browser (specific first, Chrome/Safari last) ---
  if (ua.includes('OPR/') || ua.includes('Opera ')) browser = 'Opera'
  else if (ua.includes('Edg/')) browser = 'Edge'
  else if (ua.includes('Vivaldi/')) browser = 'Vivaldi'
  else if (ua.includes('YaBrowser/')) browser = 'Yandex'
  else if (ua.includes('SamsungBrowser/')) browser = 'Samsung Internet'
  else if (ua.includes('UCBrowser/') || ua.includes('UCWEB')) browser = 'UC Browser'
  else if (ua.includes('Firefox/') && !ua.includes('Seamonkey')) browser = 'Firefox'
  else if (ua.includes('Seamonkey/')) browser = 'SeaMonkey'
  else if (ua.includes('MSIE ') || ua.includes('Trident/')) browser = 'Internet Explorer'
  else if (ua.includes('Chrome/') && !ua.includes('Edg') && !ua.includes('OPR') && !ua.includes('Vivaldi') && !ua.includes('YaBrowser') && !ua.includes('SamsungBrowser') && !ua.includes('UCBrowser')) browser = 'Chrome'
  else if (ua.includes('Safari/') && !ua.includes('Chrome') && !ua.includes('Chromium')) browser = 'Safari'
  else if (ua.includes('CriOS/')) browser = 'Chrome' // Chrome on iOS
  else if (ua.includes('FxiOS/')) browser = 'Firefox' // Firefox on iOS

  // --- OS / Platform (specific first; avoid "Windows" matching other UAs) ---
  const plat = nav.userAgentData?.platform?.toLowerCase()
  if (ua.includes('Android')) os = 'Android'
  else if (ua.includes('iPhone') || ua.includes('iPod')) os = 'iPhone'
  else if (ua.includes('iPad')) os = 'iPad'
  else if (
    (ua.includes('Macintosh') || ua.includes('Mac OS X')) &&
    typeof navigator !== 'undefined' &&
    navigator.maxTouchPoints > 1 &&
    navigator.platform === 'MacIntel'
  ) os = 'iPad' // iPadOS 13+ reports as Mac
  else if (ua.includes('Mac OS X') || ua.includes('Macintosh')) os = 'Mac'
  else if (ua.includes('CrOS')) os = 'Chrome OS'
  else if (ua.includes('KaiOS')) os = 'KaiOS'
  else if (ua.includes('BlackBerry') || ua.includes('BB10') || ua.includes('RIM')) os = 'BlackBerry'
  else if (ua.includes('IEMobile') || ua.includes('Windows Phone') || ua.includes('WPDesktop')) os = 'Windows Phone'
  else if (ua.includes('Windows NT 11') || (plat === 'windows' && ua.includes('Windows NT 10'))) os = 'Windows'
  else if (ua.includes('Windows NT 10') || ua.includes('Windows NT 6.3') || ua.includes('Windows NT 6.2') || ua.includes('Windows NT 6.1')) os = 'Windows'
  else if (ua.includes('Windows')) os = 'Windows'
  else if (ua.includes('Ubuntu')) os = 'Ubuntu'
  else if (ua.includes('Fedora')) os = 'Fedora'
  else if (ua.includes('OpenBSD')) os = 'OpenBSD'
  else if (ua.includes('FreeBSD')) os = 'FreeBSD'
  else if (ua.includes('Linux')) os = 'Linux'

  return `${browser} on ${os}`
}

export type SessionLocation = { city: string; country: string; display: string } | null

/**
 * Fetch approximate location from client IP using a free geolocation API.
 * Falls back to null if fetch fails (no key, CORS, or timeout).
 */
export async function fetchLocationFromIP(): Promise<SessionLocation> {
  try {
    const res = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(6000) })
    if (!res.ok) return null
    const data = await res.json()
    const city = data.city ?? data.region ?? ''
    const country = data.country_name ?? data.country ?? data.countryCode ?? ''
    const display = [city, country].filter(Boolean).join(', ') || 'Unknown'
    return { city, country, display }
  } catch {
    return null
  }
}

export type ActiveSession = {
  device: string
  location: string
  lastActive: string
  current: boolean
}

/**
 * Build the current session with real device and location (async).
 * Device is accurate from user agent; location from IP geolocation when available.
 */
export async function getCurrentSession(): Promise<ActiveSession> {
  const device = getDeviceString()
  const loc = await fetchLocationFromIP()
  return {
    device,
    location: loc?.display ?? 'Unknown',
    lastActive: 'Just now',
    current: true,
  }
}

/**
 * Get current session with device only (sync). Use for initial render; then replace with getCurrentSession() result.
 */
export function getCurrentSessionPlaceholder(): ActiveSession {
  return {
    device: getDeviceString(),
    location: '…',
    lastActive: 'Just now',
    current: true,
  }
}

/**
 * Format a past timestamp as "X mins ago" / "X hours ago" / "X days ago".
 */
export function formatLastActive(isoDate: string): string {
  const d = new Date(isoDate)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)
  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins} min${diffMins !== 1 ? 's' : ''} ago`
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`
  if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`
  return d.toLocaleDateString()
}
