const KEY_PREFIX = 'portal_app_visible_v2_'
/** After this, ignore overlay (avoids stale lists from old sessions). */
const STALE_MS = 7 * 24 * 60 * 60 * 1000

type Stored = { v: string[]; savedAt: number }

function quickDedupe(parts: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const p of parts) {
    const t = String(p ?? '').trim()
    if (!t) continue
    const k = t.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(t)
  }
  return out
}

function readRaw(id: number): Stored | null {
  if (!Number.isFinite(id) || id < 1) return null
  try {
    const raw = localStorage.getItem(`${KEY_PREFIX}${id}`)
    if (!raw) return null
    const o = JSON.parse(raw) as Stored
    if (!Array.isArray(o.v) || typeof o.savedAt !== 'number') return null
    const v = quickDedupe(o.v.map((x) => String(x)))
    if (!v.length) return null
    return { v, savedAt: o.savedAt }
  } catch {
    return null
  }
}

/** Call after a successful admin save with the same list you sent to the API (already normalized in UI). */
export function rememberAppVisibility(id: number, visibleTo: string[]): void {
  if (!Number.isFinite(id) || id < 1) return
  try {
    const v = quickDedupe(visibleTo.map((x) => String(x)))
    localStorage.setItem(`${KEY_PREFIX}${id}`, JSON.stringify({ v, savedAt: Date.now() } as Stored))
  } catch {
    /* ignore quota / private mode */
  }
}

export function forgetAppVisibility(id: number): void {
  if (!Number.isFinite(id) || id < 1) return
  try {
    localStorage.removeItem(`${KEY_PREFIX}${id}`)
  } catch {
    /* ignore */
  }
}

/**
 * When GET returns fewer departments than we last saved (truncated column, ignored `roles`, etc.),
 * keep showing the last known-good selection.
 */
export function reconcileVisibleWithLocalCache(id: number, fromServerNormalized: string[]): string[] {
  const S = quickDedupe(fromServerNormalized)
  const stored = readRaw(id)
  if (!stored) return S
  if (Date.now() - stored.savedAt > STALE_MS) {
    forgetAppVisibility(id)
    return S
  }

  const T = stored.v
  const tSet = new Set(T.map((x) => x.toLowerCase()))

  if (S.some((x) => !tSet.has(x.toLowerCase()))) {
    const recent = Date.now() - stored.savedAt < 90_000
    // Server still echoing departments you just removed — keep the slimmer selection you saved.
    if (recent && S.length > T.length) return T
    rememberAppVisibility(id, S)
    return S
  }

  if (T.length > S.length && S.every((x) => tSet.has(x.toLowerCase()))) {
    return T
  }

  if (S.length >= T.length) rememberAppVisibility(id, S)
  return S
}
