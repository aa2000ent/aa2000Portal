import { createContext, useContext, useState, type ReactNode } from 'react'

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
