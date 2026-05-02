import {
  createContext,
  useContext,
  useState,
  useMemo,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react'
import { hasApiBase } from '../api/client'
import {
  fetchFileLeaveById,
  fetchFileLeaves,
  getFileLeaveServerId,
  getFileLeaveRowId,
  updateFileLeaveStatus,
  type FileLeaveRow,
} from '../api/fileLeave'

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

export type ApprovalRequest = {
  id: number
  name: string
  email: string
  requestedRole: string
  requestedAt: string
  status: ApprovalStatus
  resolvedAt?: string
}

function normalizeApiLeaveStatus(raw: unknown): ApprovalStatus | null {
  const s = String(raw ?? '').trim().toLowerCase()
  if (s === 'pending' || s === 'awaiting' || s === 'submitted' || s === 'open' || s === 'new') return 'PENDING'
  if (s === 'approved' || s === 'accept' || s === 'accepted') return 'APPROVED'
  if (s === 'rejected' || s === 'reject' || s === 'declined' || s === 'denied') return 'REJECTED'
  return null
}

export function effectiveFileLeaveStatus(row: FileLeaveRow): ApprovalStatus {
  const r = row as Record<string, unknown>
  const fromApi = normalizeApiLeaveStatus(
    r.status ?? r.Status ?? r.leave_status ?? r.leaveStatus ?? r.fileLeaveStatus ?? r.approvalStatus,
  )
  if (fromApi) return fromApi
  return 'PENDING'
}

type ApprovalsContextValue = {
  requests: ApprovalRequest[]
  setRequests: React.Dispatch<React.SetStateAction<ApprovalRequest[]>>
  pendingCount: number
  approvedCount: number
  rejectedCount: number
  fileLeaves: FileLeaveRow[]
  fileLeavesLoading: boolean
  refreshFileLeaves: () => Promise<void>
  resolveFileLeaveStatus: (row: FileLeaveRow) => ApprovalStatus
  setFileLeaveDecision: (leaveId: number, status: 'approved' | 'rejected') => Promise<void>
}

const ApprovalsContext = createContext<ApprovalsContextValue | null>(null)

export function ApprovalsProvider({ children }: { children: ReactNode }) {
  const [requests, setRequests] = useState<ApprovalRequest[]>([])
  const [fileLeaves, setFileLeaves] = useState<FileLeaveRow[]>([])
  const [fileLeavesLoading, setFileLeavesLoading] = useState(false)

  const refreshFileLeaves = useCallback(async () => {
    if (!hasApiBase()) {
      setFileLeaves([])
      return
    }
    setFileLeavesLoading(true)
    try {
      const list = await fetchFileLeaves()
      setFileLeaves(Array.isArray(list) ? list : [])
    } catch {
      setFileLeaves([])
    } finally {
      setFileLeavesLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshFileLeaves()
  }, [refreshFileLeaves])

  const resolveFileLeaveStatus = useCallback((row: FileLeaveRow) => effectiveFileLeaveStatus(row), [])

  const setFileLeaveDecision = useCallback(async (leaveId: number, status: 'approved' | 'rejected') => {
    if (!Number.isFinite(leaveId) || leaveId <= 0) {
      throw new Error('Missing leave id. Cannot update status.')
    }

    try {
      const expectedApiStatus: ApprovalStatus = status === 'approved' ? 'APPROVED' : 'REJECTED'
      const expectedRawStatus = status === 'approved' ? 'APPROVED' : 'REJECTED'
      console.log('[FileLeave] update status payload', { leaveId, uiAction: status, status: expectedRawStatus })

      // Optimistic UI feedback so the row moves immediately out of Pending.
      setFileLeaves((prev) =>
        prev.map((row) => (getFileLeaveServerId(row) === leaveId ? { ...row, status: expectedRawStatus } : row)),
      )

      const response = await updateFileLeaveStatus(leaveId, { status: status === 'approved' ? 'APPROVED' : 'REJECTED' })
      const immediate = normalizeApiLeaveStatus(response?.leaveDetails?.status)
      if (immediate && immediate !== expectedApiStatus) {
        throw new Error(`Server returned unexpected status "${response?.leaveDetails?.status}".`)
      }

      // Best-effort verify only; do not block successful update UX.
      try {
        const verify = await fetchFileLeaveById(leaveId, { fresh: true })
        const verified = normalizeApiLeaveStatus(verify?.status)
        if (verified && verified !== expectedApiStatus) {
          console.warn('[Approvals] Post-update verify mismatch', {
            leaveId,
            expectedApiStatus,
            verifiedRaw: verify?.status,
          })
        }
      } catch (verifyErr) {
        console.warn('[Approvals] Post-update verify failed', { leaveId, verifyErr })
      }

      await refreshFileLeaves()
    } catch (err) {
      // Roll back optimistic status if the server update ultimately failed.
      await refreshFileLeaves()
      const msg = err instanceof Error ? err.message : 'Failed to update leave status on the server.'
      throw new Error(msg)
    }
  }, [refreshFileLeaves])

  const signupPending = useMemo(() => requests.filter((r) => normalizeApiLeaveStatus(r.status) === 'PENDING').length, [requests])
  const signupApproved = useMemo(() => requests.filter((r) => normalizeApiLeaveStatus(r.status) === 'APPROVED').length, [requests])
  const signupRejected = useMemo(() => requests.filter((r) => normalizeApiLeaveStatus(r.status) === 'REJECTED').length, [requests])

  const leavePending = useMemo(
    () =>
      fileLeaves.filter((row) => getFileLeaveRowId(row) > 0 && effectiveFileLeaveStatus(row) === 'PENDING')
        .length,
    [fileLeaves],
  )
  const leaveApproved = useMemo(
    () =>
      fileLeaves.filter((row) => getFileLeaveRowId(row) > 0 && effectiveFileLeaveStatus(row) === 'APPROVED')
        .length,
    [fileLeaves],
  )
  const leaveRejected = useMemo(
    () =>
      fileLeaves.filter((row) => getFileLeaveRowId(row) > 0 && effectiveFileLeaveStatus(row) === 'REJECTED')
        .length,
    [fileLeaves],
  )

  const pendingCount = signupPending + leavePending
  const approvedCount = signupApproved + leaveApproved
  const rejectedCount = signupRejected + leaveRejected

  const value: ApprovalsContextValue = {
    requests,
    setRequests,
    pendingCount,
    approvedCount,
    rejectedCount,
    fileLeaves,
    fileLeavesLoading,
    refreshFileLeaves,
    resolveFileLeaveStatus,
    setFileLeaveDecision,
  }

  return <ApprovalsContext.Provider value={value}>{children}</ApprovalsContext.Provider>
}

export function useApprovals() {
  const ctx = useContext(ApprovalsContext)
  if (!ctx) {
    throw new Error('useApprovals must be used within ApprovalsProvider')
  }
  return ctx
}
