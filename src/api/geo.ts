export type ReverseGeocodeResult = {
  street: string
  city: string
  province: string
  postcode?: string
  region?: string
  country?: string
  displayName?: string
}

export async function reverseGeocode(lat: number, lon: number): Promise<ReverseGeocodeResult> {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1&zoom=18`
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) return { street: '', city: '', province: '' }
  const data = await res.json().catch(() => null)
  if (!data || typeof data !== 'object') return { street: '', city: '', province: '' }
  const addr = data.address as Record<string, string> | undefined
  const get = (k: string) => (addr && typeof addr[k] === 'string' ? addr[k] : '') as string
  return {
    street: [get('road'), get('house_number'), get('suburb')].filter(Boolean).join(', ') || get('village'),
    city: get('city') || get('town') || get('municipality') || get('county'),
    province: get('state'),
    postcode: get('postcode') || undefined,
    region: get('state_district') || undefined,
    country: get('country') || undefined,
    displayName: typeof data.display_name === 'string' ? data.display_name : undefined,
  }
}

export type SearchPlaceResult = { displayName: string; lat: number; lon: number }

export async function searchPlaces(query: string): Promise<SearchPlaceResult[]> {
  const q = query.trim()
  if (!q) return []

  // Primary geocoder: OpenStreetMap Nominatim.
  const nominatimUrl =
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}` +
    '&format=json&limit=8&addressdetails=0&dedupe=1'

  try {
    const res = await fetch(nominatimUrl, { cache: 'no-store' })
    if (res.ok) {
      const data = await res.json()
      if (Array.isArray(data)) {
        const mapped = data
          .map((item: { display_name?: string; lat?: string; lon?: string }) => ({
            displayName: typeof item.display_name === 'string' ? item.display_name : '',
            lat: Number(item.lat) || 0,
            lon: Number(item.lon) || 0,
          }))
          .filter((r: SearchPlaceResult) => r.displayName.length > 0)
        if (mapped.length > 0) return mapped
      }
    }
  } catch {
    // Fall through to backup geocoder.
  }

  // Backup geocoder: Photon (Komoot) to avoid empty UI when Nominatim throttles/fails.
  const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=8`
  try {
    const res = await fetch(photonUrl, { cache: 'no-store' })
    if (!res.ok) return []
    const data = await res.json()
    const features = Array.isArray((data as { features?: unknown[] })?.features)
      ? ((data as { features: Array<{ properties?: Record<string, unknown>; geometry?: { coordinates?: unknown[] } }> }).features)
      : []
    return features
      .map((f) => {
        const p = f.properties ?? {}
        const c = Array.isArray(f.geometry?.coordinates) ? f.geometry?.coordinates : []
        const lon = Number(c?.[0] ?? 0)
        const lat = Number(c?.[1] ?? 0)
        const name = String(p.name ?? '').trim()
        const city = String(p.city ?? p.county ?? '').trim()
        const country = String(p.country ?? '').trim()
        const displayName = [name, city, country].filter(Boolean).join(', ')
        return { displayName, lat, lon }
      })
      .filter((r) => r.displayName.length > 0 && Number.isFinite(r.lat) && Number.isFinite(r.lon))
  } catch {
    return []
  }
}
