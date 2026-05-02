import { createContext, useContext, useState, useMemo, useEffect, useRef, type ReactNode } from 'react'
import { fetchEmployees } from '../api/employees'
import { hasApiBase } from '../api/client'
import { useRoles } from './RolesContext'

export type Employee = {
  id: number
  /** Linked Account PK (employees.acc_ID) for backend update compatibility. */
  accId?: number
  name: string
  email: string
  role: string
  status: 'Active' | 'Inactive'
  username?: string
  password?: string
  address?: string
  contact?: string
  photoUrl?: string
  /** FK to Address row (Employee.Emp_AddressID) when API returns it */
  addressId?: number
}

const DEFAULT_PASSWORD = '0000'

type EmployeesContextValue = {
  employees: Employee[]
  setEmployees: React.Dispatch<React.SetStateAction<Employee[]>>
  totalCount: number
}

const EmployeesContext = createContext<EmployeesContextValue | null>(null)

export function EmployeesProvider({ children }: { children: ReactNode }) {
  const [employees, setEmployees] = useState<Employee[]>([])
  const { roleOptions, loading: rolesLoading } = useRoles()
  const roleOptionsRef = useRef(roleOptions)
  roleOptionsRef.current = roleOptions
  const hasFetched = useRef(false)

  useEffect(() => {
    if (!hasApiBase() || rolesLoading || hasFetched.current) return
    hasFetched.current = true
    fetchEmployees(roleOptionsRef.current)
      .then((list) => {
        setEmployees(list)
      })
      .catch(() => {})
  }, [rolesLoading])

  const totalCount = useMemo(() => employees.length, [employees])
  const value: EmployeesContextValue = { employees, setEmployees, totalCount }
  return (
    <EmployeesContext.Provider value={value}>
      {children}
    </EmployeesContext.Provider>
  )
}

export function useEmployees() {
  const ctx = useContext(EmployeesContext)
  if (!ctx) {
    throw new Error('useEmployees must be used within EmployeesProvider')
  }
  return ctx
}

export { DEFAULT_PASSWORD }
