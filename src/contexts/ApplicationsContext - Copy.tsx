import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from 'react'
import { hasApiBase } from '../api/client'
import { fetchApplications } from '../api/applications'

export type App = {
  id: number
  name: string
  description: string
  domain: string
  visibleTo: string[]
}

type ApplicationsContextValue = {
  apps: App[]
  setApps: React.Dispatch<React.SetStateAction<App[]>>
}

const ApplicationsContext = createContext<ApplicationsContextValue | null>(null)

export function ApplicationsProvider({ children }: { children: ReactNode }) {
  const [apps, setApps] = useState<App[]>([])
  const hasFetched = useRef(false)
  useEffect(() => {
    if (!hasApiBase() || hasFetched.current) return
    hasFetched.current = true
    fetchApplications()
      .then((list) => setApps(list))
      .catch(() => setApps([]))
  }, [])
  return (
    <ApplicationsContext.Provider value={{ apps, setApps }}>
      {children}
    </ApplicationsContext.Provider>
  )
}

export function useApplications() {
  const ctx = useContext(ApplicationsContext)
  if (!ctx) {
    throw new Error('useApplications must be used within ApplicationsProvider')
  }
  return ctx
}
