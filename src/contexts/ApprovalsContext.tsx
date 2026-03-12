import { createContext, useContext, useState, useMemo, type ReactNode } from 'react'

export type ApprovalStatus = 'pending' | 'approved' | 'rejected'

export type ApprovalRequest = {
  id: number
  name: string
  email: string
  requestedRole: string
  requestedAt: string
  status: ApprovalStatus
  resolvedAt?: string
}

type ApprovalsContextValue = {
  requests: ApprovalRequest[]
  setRequests: React.Dispatch<React.SetStateAction<ApprovalRequest[]>>
  pendingCount: number
  approvedCount: number
  rejectedCount: number
}

const ApprovalsContext = createContext<ApprovalsContextValue | null>(null)

export function ApprovalsProvider({ children }: { children: ReactNode }) {
  const [requests, setRequests] = useState<ApprovalRequest[]>([])

  const pendingCount = useMemo(() => requests.filter((r) => r.status === 'pending').length, [requests])
  const approvedCount = useMemo(() => requests.filter((r) => r.status === 'approved').length, [requests])
  const rejectedCount = useMemo(() => requests.filter((r) => r.status === 'rejected').length, [requests])

  const value: ApprovalsContextValue = {
    requests,
    setRequests,
    pendingCount,
    approvedCount,
    rejectedCount,
  }

  return (
    <ApprovalsContext.Provider value={value}>
      {children}
    </ApprovalsContext.Provider>
  )
}

export function useApprovals() {
  const ctx = useContext(ApprovalsContext)
  if (!ctx) {
    throw new Error('useApprovals must be used within ApprovalsProvider')
  }
  return ctx
}
