import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'

export type ActionType =
  | 'user_added'
  | 'user_updated'
  | 'user_disabled'
  | 'app_added'
  | 'app_updated'
  | 'app_deleted'
  | 'app_launched'
  | 'signup_approved'
  | 'signup_rejected'
  | 'role_added'
  | 'role_deleted'
  | 'sign_in'
  | 'sign_out'
  | 'page_visited'
  | 'profile_updated'
  | 'password_changed'
  | '2fa_enabled'
  | '2fa_disabled'
  | 'session_revoked'

export type HistoryEntry = {
  id: number
  timestamp: string
  action: ActionType
  actor: string
  target: string
  details?: string
}

function formatTimestamp() {
  const d = new Date()
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

type ActivityLogContextValue = {
  entries: HistoryEntry[]
  addEntry: (entry: Omit<HistoryEntry, 'id' | 'timestamp'>) => void
}

const ActivityLogContext = createContext<ActivityLogContextValue | null>(null)

const STORAGE_KEY = 'aa2000_activity_log'

function loadFromStorage(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (e: unknown): e is HistoryEntry =>
        typeof e === 'object' &&
        e !== null &&
        typeof (e as HistoryEntry).id === 'number' &&
        typeof (e as HistoryEntry).timestamp === 'string' &&
        typeof (e as HistoryEntry).action === 'string' &&
        typeof (e as HistoryEntry).actor === 'string' &&
        typeof (e as HistoryEntry).target === 'string'
    )
  } catch {
    return []
  }
}

function saveToStorage(entries: HistoryEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch {
    /* ignore quota / disabled storage */
  }
}

function getInitialEntries(): HistoryEntry[] {
  return loadFromStorage()
}

export function ActivityLogProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<HistoryEntry[]>(getInitialEntries)

  useEffect(() => {
    saveToStorage(entries)
  }, [entries])

  const addEntry = useCallback((entry: Omit<HistoryEntry, 'id' | 'timestamp'>) => {
    setEntries((prev) => {
      const id = prev.length ? Math.max(...prev.map((e) => e.id)) + 1 : 1
      const newEntry: HistoryEntry = {
        ...entry,
        id,
        timestamp: formatTimestamp(),
      }
      return [newEntry, ...prev]
    })
  }, [])

  return (
    <ActivityLogContext.Provider value={{ entries, addEntry }}>
      {children}
    </ActivityLogContext.Provider>
  )
}

export function useActivityLog() {
  const ctx = useContext(ActivityLogContext)
  if (!ctx) {
    throw new Error('useActivityLog must be used within ActivityLogProvider')
  }
  return ctx
}
