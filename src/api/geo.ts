const NOMINATIM_USER_AGENT = 'AA2000Portal/1.0'

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
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1`
  const res = await fetch(url, { headers: { 'User-Agent': NOMINATIM_USER_AGENT } })
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
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=8&addressdetails=0`
  const res = await fetch(url, { headers: { 'User-Agent': NOMINATIM_USER_AGENT } })
  if (!res.ok) return []
  try {
    const data = await res.json()
    if (!Array.isArray(data)) return []
    return data.map((item: { display_name?: string; lat?: string; lon?: string }) => ({
      displayName: typeof item.display_name === 'string' ? item.display_name : '',
      lat: Number(item.lat) || 0,
      lon: Number(item.lon) || 0,
    })).filter((r: SearchPlaceResult) => r.displayName.length > 0)
  } catch {
    return []
  }
}
