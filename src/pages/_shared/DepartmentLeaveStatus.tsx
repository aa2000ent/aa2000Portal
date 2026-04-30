import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { fetchFileLeaves, getFileLeaveServerId, pickFileLeaveActorIds, type FileLeaveRow } from '../../api/fileLeave'
import { getPortalEmpId, hasApiBase } from '../../api/client'
import { roleLabelsForPortalPath } from '../../utils/departmentRouteMap'

const PORTAL_LEAVE_SEGMENTS = new Set([
  'marketing',
  'sale',
  'purchasing',
  'customer',
  'supplier',
  'operations',
  'finance',
  'financial',
  'accounting',
  'engineering',
  'technical',
])

function segmentTitle(segment: string): string {
  return segment
    .split('-')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : ''))
    .join('-')
}

function normalizeStatus(raw: unknown): 'pending' | 'approved' | 'rejected' {
  const s = String(raw ?? '').trim().toLowerCase()
  if (s === 'approved' || s === 'accept' || s === 'accepted') return 'approved'
  if (s === 'rejected' || s === 'reject' || s === 'declined' || s === 'denied') return 'rejected'
  return 'pending'
}

function readRowStatus(row: FileLeaveRow): unknown {
  const r = row as Record<string, unknown>
  return r.status ?? r.Status ?? r.leave_status ?? r.leaveStatus ?? r.fileLeaveStatus ?? r.approvalStatus
}

function rowKey(row: FileLeaveRow): string {
  const sid = getFileLeaveServerId(row)
  if (sid > 0) return `id:${sid}`
  return `tmp:${String(row.startDate ?? '')}|${String(row.endDate ?? '')}|${String(row.title ?? '')}|${String(row.reason ?? '')}`
}

function rowSignature(row: FileLeaveRow): string {
  return JSON.stringify({
    status: normalizeStatus(readRowStatus(row)),
    startDate: String(row.startDate ?? ''),
    endDate: String(row.endDate ?? ''),
    reason: String(row.reason ?? ''),
    title: String(row.title ?? ''),
  })
}

function readFiledDate(row: FileLeaveRow): string {
  const r = row as Record<string, unknown>
  const pick =
    r.filedAt ??
    r.filed_at ??
    r.dateFiled ??
    r.date_filed ??
    r.createdAt ??
    r.created_at ??
    r.updatedAt ??
    r.updated_at ??
    row.startDate ??
    ''
  return String(pick ?? '')
}

function formatDate(s?: string): string {
  const raw = String(s ?? '').slice(0, 10)
  if (!raw) return '—'
  const d = new Date(`${raw}T00:00:00`)
  if (Number.isNaN(d.getTime())) return raw
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function DepartmentLeaveStatus() {
  const { segment: segmentParam } = useParams<{ segment: string }>()
  const segment = segmentParam ?? ''
  const empId = getPortalEmpId()
  const [rows, setRows] = useState<FileLeaveRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [animatedRowKeys, setAnimatedRowKeys] = useState<Record<string, true>>({})
  const hasLoadedOnceRef = useRef(false)
  const prevRowsRef = useRef<FileLeaveRow[]>([])
  const clearAnimTimerRef = useRef<number | null>(null)

  const deptLabel = useMemo(() => roleLabelsForPortalPath(`/${segment}/leave`)[0] ?? segmentTitle(segment), [segment])

  const loadMyLeaves = useCallback(async (opts?: { silent?: boolean }) => {
    if (!hasApiBase()) return
    if (!empId || empId <= 0) return
    const silent = Boolean(opts?.silent)
    if (!silent && !hasLoadedOnceRef.current) setLoading(true)
    setError(null)
    try {
      const list = await fetchFileLeaves()
      const mine = list.filter((row) => pickFileLeaveActorIds(row).empId === empId)
      const prevRows = prevRowsRef.current
      const prevSigByKey = new Map(prevRows.map((row) => [rowKey(row), rowSignature(row)]))
      const changedOrNewKeys = mine
        .map((row) => {
          const key = rowKey(row)
          const prevSig = prevSigByKey.get(key)
          const nextSig = rowSignature(row)
          if (!hasLoadedOnceRef.current) return ''
          if (prevSig == null) return key
          return prevSig !== nextSig ? key : ''
        })
        .filter(Boolean)

      setRows(mine)
      prevRowsRef.current = mine
      hasLoadedOnceRef.current = true

      if (changedOrNewKeys.length > 0) {
        setAnimatedRowKeys((prev) => {
          const next = { ...prev }
          for (const key of changedOrNewKeys) next[key] = true
          return next
        })
        if (clearAnimTimerRef.current) window.clearTimeout(clearAnimTimerRef.current)
        clearAnimTimerRef.current = window.setTimeout(() => {
          setAnimatedRowKeys({})
          clearAnimTimerRef.current = null
        }, 1200)
      }
    } catch (e) {
      setRows([])
      setError(e instanceof Error ? e.message : 'Failed to load leave requests.')
    } finally {
      if (!silent && !hasLoadedOnceRef.current) setLoading(false)
      if (!silent && hasLoadedOnceRef.current) setLoading(false)
    }
  }, [empId])

  useEffect(() => {
    void loadMyLeaves()
  }, [loadMyLeaves])

  useEffect(() => {
    if (!empId || empId <= 0) return
    const t = window.setInterval(() => {
      void loadMyLeaves({ silent: true })
    }, 10000)
    return () => window.clearInterval(t)
  }, [empId, loadMyLeaves])

  useEffect(() => {
    return () => {
      if (clearAnimTimerRef.current) window.clearTimeout(clearAnimTimerRef.current)
    }
  }, [])

  if (!PORTAL_LEAVE_SEGMENTS.has(segment)) return <Navigate to="/" replace />

  return (
    <div className={`dashboard-page dashboard-page--${segment}`}>
      <header className="dashboard-page-header">
        <h1 className="dashboard-page-title">My leave status</h1>
        <p className="dashboard-page-subtitle">Track approval updates for your leave requests in <strong>{deptLabel}</strong>.</p>
      </header>
      <div className="dashboard-page-content">
        <section className="dashboard-card applications-card">
          {!hasApiBase() && <p className="leave-request-banner leave-request-banner--warn">API is not configured.</p>}
          {hasApiBase() && (!empId || empId <= 0) && (
            <p className="leave-request-banner leave-request-banner--error">
              No `Emp_ID` in your session. Sign out/sign in again.
            </p>
          )}
          {error && <p className="leave-request-banner leave-request-banner--error">{error}</p>}
          {loading ? (
            <p className="leave-request-banner">Loading your leave requests…</p>
          ) : (
            <div className="employees-table-wrap">
              <table className="employees-table applications-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Dates</th>
                    <th>Reason</th>
                    <th>Filed</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="employees-table-empty">No leave requests yet.</td>
                    </tr>
                  ) : (
                    rows.map((row, idx) => {
                      const key = rowKey(row)
                      const status = normalizeStatus(readRowStatus(row))
                      const filed = readFiledDate(row)
                      return (
                        <tr
                          key={key || `${idx}-${row.startDate ?? ''}-${row.endDate ?? ''}-${row.title ?? ''}`}
                          className={animatedRowKeys[key] ? 'leave-status-row--pulse' : undefined}
                        >
                          <td data-label="Type"><span className="employees-badge">{String(row.title ?? '—')}</span></td>
                          <td data-label="Dates">{`${formatDate(row.startDate)} - ${formatDate(row.endDate)}`}</td>
                          <td data-label="Reason">{String(row.reason ?? '—')}</td>
                          <td data-label="Filed">{formatDate(filed)}</td>
                          <td data-label="Status">
                            <span className={`approvals-status approvals-status--${status}`}>{status.toUpperCase()}</span>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
