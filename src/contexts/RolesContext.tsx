import { createContext, useContext, useState, useCallback, useEffect, useMemo, type ReactNode } from 'react'
import { createRole, fetchRoles, type RoleOption } from '../api/roles'
import { hasApiBase } from '../api/client'

type RolesContextValue = {
  roles: string[]
  roleOptions: RoleOption[]
  loading: boolean
  addRole: (name: string) => Promise<boolean>
  deleteRole: (name: string) => void
  refetchRoles: () => Promise<void>
}

const RolesContext = createContext<RolesContextValue | null>(null)

export function RolesProvider({ children }: { children: ReactNode }) {
  const [roleOptions, setRoleOptions] = useState<RoleOption[]>([])
  const [loading, setLoading] = useState(true)
  const [localOnlyRoles, setLocalOnlyRoles] = useState<string[]>([])

  const fetchAndSet = useCallback(async () => {
    if (!hasApiBase()) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const list = await fetchRoles()
      setRoleOptions(list)
    } catch {
      setRoleOptions([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAndSet()
  }, [fetchAndSet])

  const roles = useMemo(() => {
    const fromDb = roleOptions.map((r) => r.role_name)
    const combined = [...fromDb]
    localOnlyRoles.forEach((name) => {
      if (!combined.includes(name)) combined.push(name)
    })
    return combined
  }, [roleOptions, localOnlyRoles])

  const addRole = useCallback(async (name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return false

    // Avoid duplicates against DB roles.
    if (roleOptions.some((r) => r.role_name.toLowerCase() === trimmed.toLowerCase())) return true

    if (hasApiBase()) {
      try {
        const created = await createRole(trimmed)
        if (created) {
          await fetchAndSet()
          return true
        }
      } catch {
        // fall back to local-only
      }
    }

    setLocalOnlyRoles((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]))
    return true
  }, [fetchAndSet, roleOptions])

  const deleteRole = useCallback((name: string) => {
    setLocalOnlyRoles((prev) => prev.filter((r) => r !== name))
  }, [])

  const value: RolesContextValue = {
    roles,
    roleOptions,
    loading,
    addRole,
    deleteRole,
    refetchRoles: fetchAndSet,
  }

  return (
    <RolesContext.Provider value={value}>
      {children}
    </RolesContext.Provider>
  )
}

export function useRoles() {
  const ctx = useContext(RolesContext)
  if (!ctx) {
    throw new Error('useRoles must be used within RolesProvider')
  }
  return ctx
}
