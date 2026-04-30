import { useState, useEffect, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { useActivityLog } from '../../contexts/ActivityLogContext'
import { useApprovals, type ApprovalRequest, type ApprovalStatus } from '../../contexts/ApprovalsContext'
import { useEmployees, DEFAULT_PASSWORD } from '../../contexts/EmployeesContext'
import { useRoles } from '../../contexts/RolesContext'
import { hasApiBase } from '../../api/client'
import { getBaseUrl } from '../../api/config'
import { fetchFileLeaveById, getFileLeaveRowId, getFileLeaveServerId, pickFileLeaveActorIds, type FileLeaveRow } from '../../api/fileLeave'
import ConfirmDialog, { type ConfirmVariant } from '../../components/ConfirmDialog'
import CustomSelect from '../../components/CustomSelect'

const MIN_PER_PAGE = 1
const MAX_PER_PAGE = 500

const TABS: { key: ApprovalStatus; label: string }[] = [
  { key: 'PENDING', label: 'Pending' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'REJECTED', label: 'Rejected' },
]

function normalizeApprovalStatus(raw: unknown): ApprovalStatus {
  const s = String(raw ?? '').trim().toUpperCase()
  if (s === 'APPROVED') return 'APPROVED'
  if (s === 'REJECTED') return 'REJECTED'
  return 'PENDING'
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatLeaveRange(start?: string, end?: string) {
  const s = (start ?? '').slice(0, 10)
  const e = (end ?? '').slice(0, 10)
  if (s && e) return `${formatDate(s)} – ${formatDate(e)}`
  if (s) return formatDate(s)
  if (e) return formatDate(e)
  return '—'
}

function resolveProofFileUrl(rawPath: string | null | undefined): string | null {
  const p = String(rawPath ?? '').trim()
  if (!p) return null
  if (/^https?:\/\//i.test(p) || p.startsWith('blob:') || p.startsWith('data:')) return p
  if (/^[A-Za-z]:\\/.test(p)) return null // local disk path from server is not browser-accessible

  const normalized = p.replace(/\\/g, '/')
  const rel = normalized.startsWith('/') ? normalized : `/${normalized}`
  try {
    const base = String(getBaseUrl() ?? '').replace(/\/$/, '')
    if (base) return `${base}${rel}`
  } catch {
    /* ignore */
  }
  return rel
}

function canOpenProofDirectly(url: string | null): boolean {
  const u = String(url ?? '').trim()
  if (!u) return false
  if (u.startsWith('data:') || u.startsWith('blob:')) return true
  if (/^https?:\/\//i.test(u)) return true
  // Relative/local storage paths (e.g. /FileStorage/...) often are not web-served.
  return false
}

function mimeFromFileName(name?: string | null): string {
  const n = String(name ?? '').toLowerCase()
  if (n.endsWith('.pdf')) return 'application/pdf'
  if (n.endsWith('.txt')) return 'text/plain'
  if (n.endsWith('.csv')) return 'text/csv'
  if (n.endsWith('.png')) return 'image/png'
  if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg'
  if (n.endsWith('.gif')) return 'image/gif'
  if (n.endsWith('.doc')) return 'application/msword'
  if (n.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  if (n.endsWith('.xls')) return 'application/vnd.ms-excel'
  if (n.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  return 'application/octet-stream'
}

function detectMimeFromBase64(b64: string): string {
  const s = b64.replace(/[\s=]/g, '')
  if (s.startsWith('/9j/') || s.startsWith('/9j+')) return 'image/jpeg'
  if (s.startsWith('iVBORw0KGgo')) return 'image/png'
  if (s.startsWith('R0lGOD')) return 'image/gif'
  if (s.startsWith('UklGR')) return 'image/webp'
  if (s.startsWith('Qk0') || s.startsWith('Qk3') || s.startsWith('Qk4') || s.startsWith('Qk8')) return 'image/bmp'
  if (s.startsWith('JVBERi0')) return 'application/pdf'
  return 'application/octet-stream'
}

function resolvePreviewMime(fileName?: string | null, proofPath?: string | null, rawFileData?: unknown): string {
  const fromName = mimeFromFileName(fileName)
  if (fromName !== 'application/octet-stream') return fromName
  const fromPath = mimeFromFileName(proofPath)
  if (fromPath !== 'application/octet-stream') return fromPath
  const s = typeof rawFileData === 'string' ? rawFileData.trim() : ''
  if (s.startsWith('data:')) {
    const semi = s.indexOf(';')
    if (semi > 5) return s.slice(5, semi)
  }
  if (s.length > 8) {
    const detected = detectMimeFromBase64(s)
    if (detected !== 'application/octet-stream') return detected
  }
  return 'application/octet-stream'
}

function isInlinePreviewableMime(mime: string): boolean {
  const m = String(mime ?? '').toLowerCase()
  return m.startsWith('image/') || m.includes('pdf') || m.startsWith('text/')
}

function parseSpreadsheetPreview(fileData: unknown): { headers: string[]; rows: string[][] } | null {
  try {
    let workbook: XLSX.WorkBook | null = null
    if (typeof fileData === 'string') {
      const s = fileData.trim()
      if (!s) return null
      if (s.startsWith('data:')) {
        const comma = s.indexOf(',')
        if (comma < 0) return null
        const b64 = s.slice(comma + 1)
        workbook = XLSX.read(b64, { type: 'base64' })
      } else {
        // Backend commonly returns raw base64.
        workbook = XLSX.read(s, { type: 'base64' })
      }
    } else if (Array.isArray(fileData) && fileData.every((n) => Number.isFinite(n))) {
      workbook = XLSX.read(new Uint8Array(fileData as number[]), { type: 'array' })
    }
    if (!workbook || workbook.SheetNames.length === 0) return null
    const firstSheet = workbook.SheetNames[0]
    const ws = workbook.Sheets[firstSheet]
    if (!ws) return null
    const matrix = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(ws, { header: 1, raw: false, blankrows: false })
    if (!Array.isArray(matrix) || matrix.length === 0) return null
    const rowsAsStrings = matrix.map((row) => (Array.isArray(row) ? row.map((cell) => String(cell ?? '')) : []))
    const headers = rowsAsStrings[0] ?? []
    const rows = rowsAsStrings.slice(1, 101)
    return { headers, rows }
  } catch {
    return null
  }
}

function asDataUrlFromUnknownFileData(value: unknown, mime: string): string | null {
  if (typeof value === 'string') {
    const s = value.trim()
    if (!s) return null
    if (s.startsWith('data:')) return s
    if (/^https?:\/\//i.test(s)) return s
    // Check magic bytes BEFORE the startsWith('/') path check —
    // JPEG base64 starts with /9j/ which would be mistaken for a URL path.
    const detectedMime = detectMimeFromBase64(s)
    if (detectedMime !== 'application/octet-stream') {
      return `data:${detectedMime};base64,${s}`
    }
    // Relative path (e.g. /uploads/file.jpg) — let caller resolve via API base.
    if (s.startsWith('/')) return s
    return `data:${mime};base64,${s}`
  }
  if (Array.isArray(value) && value.every((n) => Number.isFinite(n))) {
    try {
      const bytes = new Uint8Array(value as number[])
      let binary = ''
      for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!)
      const b64 = btoa(binary)
      return `data:${mime};base64,${b64}`
    } catch {
      return null
    }
  }
  return null
}

type MainSection = 'signups' | 'leave'

export default function AdminApprovals() {
  const location = useLocation()
  const { addEntry } = useActivityLog()
  const {
    requests,
    setRequests,
    fileLeaves,
    fileLeavesLoading,
    refreshFileLeaves,
    resolveFileLeaveStatus,
    setFileLeaveDecision,
  } = useApprovals()
  const { employees, setEmployees } = useEmployees()
  const { roles, addRole } = useRoles()
  const [mainSection, setMainSection] = useState<MainSection>('signups')
  const [activeTab, setActiveTab] = useState<ApprovalStatus>('PENDING')
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [leaveActionError, setLeaveActionError] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [perPage, setPerPage] = useState(10)
  const [leaveDetail, setLeaveDetail] = useState<{ open: boolean; row: FileLeaveRow | null }>({ open: false, row: null })
  const [leaveDetailProof, setLeaveDetailProof] = useState<{
    loading: boolean
    src: string | null
    mime: string
    fileName: string
    sheet: { headers: string[]; rows: string[][] } | null
    error: string | null
  }>({ loading: false, src: null, mime: '', fileName: '', sheet: null, error: null })
  const [proofPreview, setProofPreview] = useState<{
    open: boolean
    src: string
    fileName: string
    mime: string
    sheet: { headers: string[]; rows: string[][] } | null
  }>({ open: false, src: '', fileName: '', mime: '', sheet: null })
  const [confirm, setConfirm] = useState<{
    open: boolean
    title: string
    message: string
    confirmLabel: string
    variant: ConfirmVariant
    onConfirm: () => void
  }>({ open: false, title: '', message: '', confirmLabel: '', variant: 'primary', onConfirm: () => {} })

  const signupCounts = useMemo(
    () => ({
      PENDING: requests.filter((r) => normalizeApprovalStatus(r.status) === 'PENDING').length,
      APPROVED: requests.filter((r) => normalizeApprovalStatus(r.status) === 'APPROVED').length,
      REJECTED: requests.filter((r) => normalizeApprovalStatus(r.status) === 'REJECTED').length,
    }),
    [requests],
  )

  const leaveCounts = useMemo(
    () => ({
      PENDING: fileLeaves.filter((row) => resolveFileLeaveStatus(row) === 'PENDING').length,
      APPROVED: fileLeaves.filter((row) => resolveFileLeaveStatus(row) === 'APPROVED').length,
      REJECTED: fileLeaves.filter((row) => resolveFileLeaveStatus(row) === 'REJECTED').length,
    }),
    [fileLeaves, resolveFileLeaveStatus],
  )

  const counts = mainSection === 'signups' ? signupCounts : leaveCounts

  const requestRoles = useMemo(() => {
    const set = new Set<string>()
    requests.forEach((r) => set.add(r.requestedRole))
    return Array.from(set).sort()
  }, [requests])

  const employeeNameByEmpId = useMemo(() => {
    const m = new Map<number, { name: string; email: string }>()
    for (const e of employees) {
      if (e.id > 0) m.set(e.id, { name: e.name || '—', email: e.email || '—' })
    }
    return m
  }, [employees])

  const employeeNameByAccId = useMemo(() => {
    const m = new Map<number, { name: string; email: string }>()
    for (const e of employees) {
      const aid = e.accId != null ? Number(e.accId) : 0
      if (Number.isFinite(aid) && aid > 0) m.set(aid, { name: e.name || '—', email: e.email || '—' })
    }
    return m
  }, [employees])

  const resolveLeaveEmployee = useMemo(() => {
    return (row: FileLeaveRow) => {
      const { accId, empId } = pickFileLeaveActorIds(row)
      if (accId > 0) {
        const byAcc = employeeNameByAccId.get(accId)
        if (byAcc) return { ...byAcc, accId, empId }
      }
      if (empId > 0) {
        const byEmp = employeeNameByEmpId.get(empId)
        if (byEmp) return { ...byEmp, accId, empId }
      }
      return {
        name: '—',
        email: '—',
        accId,
        empId,
      }
    }
  }, [employeeNameByAccId, employeeNameByEmpId])

  const filteredSignups = useMemo(() => {
    return requests.filter((r) => {
      if (normalizeApprovalStatus(r.status) !== activeTab) return false
      if (roleFilter && r.requestedRole !== roleFilter) return false
      if (search) {
        const s = search.toLowerCase()
        return r.name.toLowerCase().includes(s) || r.email.toLowerCase().includes(s)
      }
      return true
    })
  }, [requests, activeTab, search, roleFilter])

  const filteredLeaves = useMemo(() => {
    return fileLeaves.filter((row) => {
      const st = resolveFileLeaveStatus(row)
      if (st !== activeTab) return false
      if (!search.trim()) return true
      const q = search.toLowerCase()
      const { accId, empId } = pickFileLeaveActorIds(row)
      const emp = resolveLeaveEmployee(row)
      const name = emp.name.toLowerCase()
      const email = emp.email.toLowerCase()
      const title = String(row.title ?? '').toLowerCase()
      const reason = String(row.reason ?? '').toLowerCase()
      return (
        name.includes(q) ||
        email.includes(q) ||
        title.includes(q) ||
        reason.includes(q) ||
        String(accId).includes(q) ||
        String(empId).includes(q)
      )
    })
  }, [fileLeaves, activeTab, search, resolveFileLeaveStatus, resolveLeaveEmployee])

  const filtered = mainSection === 'signups' ? filteredSignups : filteredLeaves

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage))
  const start = (currentPage - 1) * perPage
  const paginatedSignups = filteredSignups.slice(start, start + perPage)
  const paginatedLeaves = filteredLeaves.slice(start, start + perPage)

  useEffect(() => {
    setCurrentPage(1)
  }, [activeTab, search, roleFilter, mainSection])

  useEffect(() => {
    if (location.pathname.includes('/admin/approvals/leave-requests')) {
      setMainSection('leave')
      return
    }
    if (location.pathname.includes('/admin/approvals/signups') || location.pathname.endsWith('/admin/approvals')) {
      setMainSection('signups')
    }
  }, [location.pathname])

  // Re-fetch leave rows when opening Approvals so we use the latest login session/token.
  useEffect(() => {
    void refreshFileLeaves()
  }, [refreshFileLeaves])

  useEffect(() => {
    setCurrentPage((p) => Math.min(p, totalPages))
  }, [filtered.length, totalPages])

  useEffect(() => {
    if (!leaveDetail.open || !leaveDetail.row) {
      setLeaveDetailProof({ loading: false, src: null, mime: '', fileName: '', sheet: null, error: null })
      return
    }
    const row = leaveDetail.row
    const sid = getFileLeaveServerId(row)
    const rid = getFileLeaveRowId(row)
    const proofRaw = (row as Record<string, unknown>).proofPath ?? (row as Record<string, unknown>).proof_file ?? null
    const proofHref = resolveProofFileUrl(typeof proofRaw === 'string' ? proofRaw : null)

    if (proofHref && canOpenProofDirectly(proofHref)) {
      const fileName = String((row as Record<string, unknown>).fileName ?? row.title ?? `leave-proof-${sid || rid || 'file'}`)
      const mime = resolvePreviewMime(String((row as Record<string, unknown>).fileName ?? ''), typeof proofRaw === 'string' ? proofRaw : '', proofHref)
      const sheet = mime.includes('spreadsheetml') || mime.includes('ms-excel') ? parseSpreadsheetPreview(proofHref) : null
      setLeaveDetailProof({ loading: false, src: proofHref, mime, fileName, sheet, error: null })
      return
    }

    if (sid > 0) {
      setLeaveDetailProof({ loading: true, src: null, mime: '', fileName: '', sheet: null, error: null })
      void fetchFileLeaveById(sid)
        .then((one) => {
          const r = one as unknown as Record<string, unknown>
          // Try all common field names for the original filename
          const fileName = String(
            r.fileName ?? r.file_name ?? r.originalName ?? r.original_name ?? r.name ?? ''
          ).trim() || `leave-proof-${sid}`
          // Try all common field names for the raw file content
          const rawFileData =
            r.fileData ?? r.file_data ?? r.fileContent ?? r.file_content ??
            r.data ?? r.content ?? r.base64 ?? r.file ?? null
          // Try all common field names for the stored path
          const proofPath = String(
            r.proofPath ?? r.proof_path ?? r.proof_file ?? r.proofFile ?? r.filePath ?? r.file_path ?? ''
          ).trim()

          let mime = resolvePreviewMime(fileName, proofPath, rawFileData)

          // If mime is still unknown but we have raw base64, try magic bytes again explicitly
          if (mime === 'application/octet-stream' && typeof rawFileData === 'string' && rawFileData.trim().length > 8) {
            const detected = detectMimeFromBase64(rawFileData.trim())
            if (detected !== 'application/octet-stream') mime = detected
          }

          const sheet = mime.includes('spreadsheetml') || mime.includes('ms-excel') ? parseSpreadsheetPreview(rawFileData) : null
          const fromFileData = asDataUrlFromUnknownFileData(rawFileData, mime)
          if (fromFileData) {
            const src = fromFileData.startsWith('/') ? resolveProofFileUrl(fromFileData) ?? '' : fromFileData
            if (src) { setLeaveDetailProof({ loading: false, src, mime, fileName, sheet, error: null }); return }
          }
          // proofPath may be a Windows disk path — try resolving anyway; server may remap it
          const fromPath = resolveProofFileUrl(proofPath) ??
            // Last resort: strip to filename only and serve from API base /uploads/
            (() => {
              const base = String(proofPath).replace(/\\/g, '/').split('/').pop() ?? ''
              if (!base) return null
              try {
                const apiBase = String(getBaseUrl() ?? '').replace(/\/$/, '')
                return apiBase ? `${apiBase}/uploads/${base}` : `/uploads/${base}`
              } catch { return null }
            })()
          if (fromPath) { setLeaveDetailProof({ loading: false, src: fromPath, mime, fileName, sheet: null, error: null }); return }
          setLeaveDetailProof({ loading: false, src: null, mime, fileName, sheet: null, error: 'Proof file is not previewable.' })
        })
        .catch(() => setLeaveDetailProof({ loading: false, src: null, mime: '', fileName: '', sheet: null, error: 'Failed to load proof file.' }))
      return
    }

    setLeaveDetailProof({ loading: false, src: null, mime: '', fileName: '', sheet: null, error: null })
  }, [leaveDetail.open, leaveDetail.row])

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)))
  }

  const handlePerPageChange = (value: number | string) => {
    const n = typeof value === 'string' ? parseInt(value, 10) : value
    if (Number.isNaN(n)) return
    const clamped = Math.max(MIN_PER_PAGE, Math.min(MAX_PER_PAGE, n))
    setPerPage(clamped)
    setCurrentPage(1)
  }

  const today = new Date().toISOString().slice(0, 10)

  const handleApprove = (req: ApprovalRequest) => {
    setConfirm({
      open: true,
      title: 'Approve sign-up',
      message: `Approve "${req.name}"? They will be able to sign in to the portal as ${req.requestedRole} and will appear in Employees.`,
      confirmLabel: 'Approve',
      variant: 'success',
      onConfirm: () => {
        addEntry({ action: 'signup_approved', actor: 'Admin', target: req.name, details: `Approved for ${req.requestedRole}` })
        setRequests((prev) => prev.map((r) => (r.id === req.id ? { ...r, status: 'APPROVED' as const, resolvedAt: today } : r)))
        if (!roles.includes(req.requestedRole)) void addRole(req.requestedRole)
        const newId = employees.length ? Math.max(...employees.map((e) => e.id)) + 1 : 1
        setEmployees((prev) => [
          ...prev,
          { id: newId, name: req.name, email: req.email, role: req.requestedRole, status: 'Active', password: DEFAULT_PASSWORD },
        ])
        setConfirm((c) => ({ ...c, open: false }))
      },
    })
  }

  const handleReject = (req: ApprovalRequest) => {
    setConfirm({
      open: true,
      title: 'Reject sign-up',
      message: `Reject "${req.name}"? They will not be granted access to the portal.`,
      confirmLabel: 'Reject',
      variant: 'danger',
      onConfirm: () => {
        addEntry({ action: 'signup_rejected', actor: 'Admin', target: req.name, details: `${req.requestedRole} request rejected` })
        setRequests((prev) => prev.map((r) => (r.id === req.id ? { ...r, status: 'REJECTED' as const, resolvedAt: today } : r)))
        setConfirm((c) => ({ ...c, open: false }))
      },
    })
  }

  const handleApproveLeave = (row: FileLeaveRow) => {
    const id = getFileLeaveServerId(row)
    if (id <= 0) {
      setLeaveActionError('Missing server leave id. Cannot approve this row.')
      return
    }
    const label = String(row.title ?? 'Leave')
    const { accId, empId } = pickFileLeaveActorIds(row)
    const emp = resolveLeaveEmployee(row)
    const who =
      emp.name !== '—'
        ? emp.name
        : accId > 0
          ? `Account #${accId}`
          : empId > 0
            ? `Employee #${empId}`
            : 'Unknown requester'
    setConfirm({
      open: true,
      title: 'Approve leave',
      message: `Mark leave "${label}" for ${who} as approved?`,
      confirmLabel: 'Approve',
      variant: 'success',
      onConfirm: () => {
        setConfirm((c) => ({ ...c, open: false }))
        void (async () => {
          try {
            setLeaveActionError(null)
            if (id > 0) await setFileLeaveDecision(id, 'approved')
            addEntry({
              action: 'leave_approved',
              actor: 'Admin',
              target: who,
              details: `${label} · ${formatLeaveRange(row.startDate, row.endDate)}`,
            })
          } catch (err) {
            setLeaveActionError(err instanceof Error ? err.message : 'Failed to approve leave request.')
          }
        })()
      },
    })
  }

  const handleRejectLeave = (row: FileLeaveRow) => {
    const id = getFileLeaveServerId(row)
    if (id <= 0) {
      setLeaveActionError('Missing server leave id. Cannot reject this row.')
      return
    }
    const label = String(row.title ?? 'Leave')
    const { accId, empId } = pickFileLeaveActorIds(row)
    const emp = resolveLeaveEmployee(row)
    const who =
      emp.name !== '—'
        ? emp.name
        : accId > 0
          ? `Account #${accId}`
          : empId > 0
            ? `Employee #${empId}`
            : 'Unknown requester'
    setConfirm({
      open: true,
      title: 'Reject leave',
      message: `Mark leave "${label}" for ${who} as rejected?`,
      confirmLabel: 'Reject',
      variant: 'danger',
      onConfirm: () => {
        setConfirm((c) => ({ ...c, open: false }))
        void (async () => {
          try {
            setLeaveActionError(null)
            if (id > 0) await setFileLeaveDecision(id, 'rejected')
            addEntry({
              action: 'leave_rejected',
              actor: 'Admin',
              target: who,
              details: `${label} · ${formatLeaveRange(row.startDate, row.endDate)}`,
            })
          } catch (err) {
            setLeaveActionError(err instanceof Error ? err.message : 'Failed to reject leave request.')
          }
        })()
      },
    })
  }


  const roleFilterOptions = useMemo(() => {
    const merged = new Set<string>([...requestRoles, ...roles])
    return Array.from(merged).sort().map((r) => ({ value: r, label: r }))
  }, [requestRoles, roles])

  const emptyMessage =
    mainSection === 'signups'
      ? activeTab === 'PENDING'
        ? 'No pending sign-up requests.'
        : `No ${activeTab} requests found.`
      : !hasApiBase()
        ? 'API is not configured — leave rows cannot be loaded.'
        : fileLeavesLoading
          ? 'Loading leave requests…'
          : activeTab === 'PENDING'
            ? 'No pending leave requests from the server.'
            : `No ${activeTab} leave requests.`

  return (
    <div className="dashboard-page">
      <header className="dashboard-page-header">
        <h1 className="dashboard-page-title">Approvals</h1>
        <p className="dashboard-page-subtitle">
          {mainSection === 'signups'
            ? 'Review portal sign-up requests only.'
            : (
              <>
                Review filed leave requests from <code className="leave-request-code">GET /file-leave/get/file-leave</code> only.
              </>
            )}
        </p>
      </header>
      <div className="dashboard-page-content">
        <section className="dashboard-card applications-card">
          {/* Tabs */}
          <div className="approvals-tabs">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={`approvals-tab ${activeTab === tab.key ? 'approvals-tab--active' : ''}`}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
                <span className={`approvals-tab-count approvals-tab-count--${tab.key}`}>{counts[tab.key]}</span>
              </button>
            ))}
          </div>

          {/* Toolbar */}
          {mainSection === 'leave' && leaveActionError && (
            <p className="leave-request-banner leave-request-banner--error" role="alert">
              {leaveActionError}
            </p>
          )}
          <div className="employees-toolbar">
            <div className="employees-search-wrap">
              <svg
                className="employees-search-icon"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <input
                type="search"
                className="employees-search"
                placeholder={mainSection === 'signups' ? 'Search by name or email…' : 'Search by employee, title, reason, Emp ID…'}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search"
              />
            </div>
            {mainSection === 'signups' && (
              <div className="employees-row-toolbar">
                <CustomSelect
                  value={roleFilter}
                  onChange={setRoleFilter}
                  options={roleFilterOptions}
                  placeholder="Requested role"
                  aria-label="Filter by requested role"
                  className="employees-filter-wrap"
                />
              </div>
            )}
            {mainSection === 'leave' && hasApiBase() && (
              <div className="employees-row-toolbar">
                <button type="button" className="approvals-refresh-btn" onClick={() => void refreshFileLeaves()} disabled={fileLeavesLoading}>
                  {fileLeavesLoading ? 'Refreshing…' : 'Refresh list'}
                </button>
              </div>
            )}
          </div>

          {/* Sign-ups table */}
          {mainSection === 'signups' && (
            <div className="employees-table-wrap">
              <table className="employees-table applications-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Requested role</th>
                    <th>{activeTab === 'PENDING' ? 'Requested' : 'Date'}</th>
                    {activeTab === 'PENDING' ? <th className="employees-table-actions">Actions</th> : <th>Status</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredSignups.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="employees-table-empty">
                        {emptyMessage}
                      </td>
                    </tr>
                  ) : (
                    paginatedSignups.map((req) => (
                      <tr key={req.id}>
                        <td className="employees-table-name" data-label="Name">
                          {req.name}
                        </td>
                        <td data-label="Email">{req.email}</td>
                        <td data-label="Role">
                          <span className="employees-badge">{req.requestedRole}</span>
                        </td>
                        <td data-label="Date">{formatDate(activeTab === 'PENDING' ? req.requestedAt : req.resolvedAt || req.requestedAt)}</td>
                        {activeTab === 'PENDING' ? (
                          <td className="employees-table-actions" data-label="Actions">
                            <button
                              type="button"
                              className="approvals-action-btn approvals-action-btn--approve"
                              title="Approve"
                              onClick={() => handleApprove(req)}
                            >
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                              Approve
                            </button>
                            <button
                              type="button"
                              className="approvals-action-btn approvals-action-btn--reject"
                              title="Reject"
                              onClick={() => handleReject(req)}
                            >
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                              </svg>
                              Reject
                            </button>
                          </td>
                        ) : (
                          <td data-label="Status">
                            <span className={`approvals-status approvals-status--${String(req.status).toLowerCase()}`}>
                              {normalizeApprovalStatus(req.status) === 'APPROVED' ? 'Approved' : 'Rejected'}
                            </span>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Leave requests table */}
          {mainSection === 'leave' && (
            <div className="employees-table-wrap">
              <table className="employees-table applications-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Title</th>
                    <th>Dates</th>
                    <th>{activeTab === 'PENDING' ? 'Filed' : 'Date'}</th>
                    {activeTab === 'PENDING' ? <th className="employees-table-actions">Actions</th> : <th>Status</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredLeaves.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="employees-table-empty">
                        {emptyMessage}
                      </td>
                    </tr>
                  ) : (
                    paginatedLeaves.map((row: FileLeaveRow) => {
                      const rid = getFileLeaveRowId(row)
                      const sid = getFileLeaveServerId(row)
                      const { accId, empId } = pickFileLeaveActorIds(row)
                      const resolved = resolveLeaveEmployee(row)
                      const name =
                        resolved.name !== '—'
                          ? resolved.name
                          : String(row.fullName ?? '').trim()
                            ? String(row.fullName ?? '').trim()
                          : accId > 0
                            ? `Account #${accId}`
                            : empId > 0
                              ? `Emp #${empId}`
                              : '—'
                      const email = resolved.email
                      const st = resolveFileLeaveStatus(row)
                      const filedAt = (row.createdAt ?? row.updatedAt ?? row.created_at ?? row.updated_at ?? row.startDate ?? '').slice(0, 10) || '—'
                      return (
                        <tr
                          key={rid || `${accId || empId}-${row.startDate}-${row.endDate}`}
                          style={{ cursor: 'pointer' }}
                          onClick={() => setLeaveDetail({ open: true, row })}
                        >
                          <td className="employees-table-name" data-label="Employee">
                            <div>{name}</div>
                            {email && email !== '—' && <div className="approvals-leave-email">{email}</div>}
                          </td>
                          <td data-label="Title">
                            <span className="employees-badge">{String(row.title ?? '—')}</span>
                          </td>
                          <td data-label="Dates">{formatLeaveRange(row.startDate, row.endDate)}</td>
                          <td data-label="Filed">{typeof filedAt === 'string' && filedAt.length >= 10 ? formatDate(filedAt) : filedAt}</td>
                          {activeTab === 'PENDING' ? (
                            <td className="employees-table-actions" data-label="Actions" onClick={(e) => e.stopPropagation()}>
                              {sid > 0 ? (
                                <>
                                  <button
                                    type="button"
                                    className="approvals-action-btn approvals-action-btn--approve"
                                    title="Approve"
                                    onClick={() => handleApproveLeave(row)}
                                  >
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                      <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                    Approve
                                  </button>
                                  <button
                                    type="button"
                                    className="approvals-action-btn approvals-action-btn--reject"
                                    title="Reject"
                                    onClick={() => handleRejectLeave(row)}
                                  >
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                      <line x1="18" y1="6" x2="6" y2="18" />
                                      <line x1="6" y1="6" x2="18" y2="18" />
                                    </svg>
                                    Reject
                                  </button>
                                </>
                              ) : (
                                <span className="approvals-leave-missing-id">No row id from API</span>
                              )}
                            </td>
                          ) : (
                            <td data-label="Status" onClick={(e) => e.stopPropagation()}>
                              <span className={`approvals-status approvals-status--${String(st).toLowerCase()}`}>{st === 'APPROVED' ? 'Approved' : 'Rejected'}</span>
                            </td>
                          )}
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {filtered.length > 0 && (
            <div className="employees-pagination">
              <div className="employees-pagination-per-page">
                <label htmlFor="approvals-per-page" className="employees-pagination-label">
                  Show
                </label>
                <input
                  id="approvals-per-page"
                  type="number"
                  min={MIN_PER_PAGE}
                  max={MAX_PER_PAGE}
                  className="employees-per-page-select employees-per-page-input"
                  value={perPage}
                  onChange={(e) => handlePerPageChange(e.target.value)}
                  onBlur={(e) => {
                    const n = parseInt(e.target.value, 10)
                    if (Number.isNaN(n) || n < MIN_PER_PAGE) setPerPage(MIN_PER_PAGE)
                    else if (n > MAX_PER_PAGE) setPerPage(MAX_PER_PAGE)
                    else setPerPage(n)
                  }}
                  aria-label="Items per page"
                  inputMode="numeric"
                />
                <span className="employees-pagination-label">per page</span>
              </div>
              <div className="employees-pagination-info">
                Showing {start + 1}–{Math.min(start + perPage, filtered.length)} of {filtered.length}
              </div>
              <div className="employees-pagination-nav">
                <button type="button" className="employees-pagination-btn" onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1} aria-label="Previous page">
                  Previous
                </button>
                <span className="employees-pagination-page">
                  Page {currentPage} of {totalPages}
                </span>
                <button type="button" className="employees-pagination-btn" onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= totalPages} aria-label="Next page">
                  Next
                </button>
              </div>
            </div>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={confirm.open}
        title={confirm.title}
        message={confirm.message}
        confirmLabel={confirm.confirmLabel}
        variant={confirm.variant}
        onConfirm={confirm.onConfirm}
        onCancel={() => setConfirm((c) => ({ ...c, open: false }))}
      />

      {leaveDetail.open && leaveDetail.row && (() => {
        const row = leaveDetail.row
        const { accId, empId } = pickFileLeaveActorIds(row)
        const resolved = resolveLeaveEmployee(row)
        const name =
          resolved.name !== '—'
            ? resolved.name
            : String(row.fullName ?? '').trim() || (accId > 0 ? `Account #${accId}` : empId > 0 ? `Emp #${empId}` : '—')
        const reason = String(row.reason ?? '').trim() || '—'
        const close = () => setLeaveDetail({ open: false, row: null })
        return (
          <div className="modal-overlay" role="dialog" aria-modal="true" onClick={close}>
            <div className="modal-box" style={{ maxWidth: 780, width: '92vw' }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2 className="modal-title">Leave Request Details</h2>
                <button type="button" className="modal-close" onClick={close} aria-label="Close">✕</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18, padding: '4px 0 8px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px 24px' }}>
                  <div>
                    <div className="modal-label" style={{ marginBottom: 3 }}>Employee</div>
                    <div style={{ fontSize: 14, color: 'var(--dash-text)', fontWeight: 500 }}>{name}</div>
                    {resolved.email && resolved.email !== '—' && (
                      <div style={{ fontSize: 12, color: 'var(--dash-text-muted)', marginTop: 2 }}>{resolved.email}</div>
                    )}
                  </div>
                  <div>
                    <div className="modal-label" style={{ marginBottom: 3 }}>Leave Type</div>
                    <span className="employees-badge">{String(row.title ?? '—')}</span>
                  </div>
                  <div>
                    <div className="modal-label" style={{ marginBottom: 3 }}>Dates</div>
                    <div style={{ fontSize: 14, color: 'var(--dash-text)' }}>{formatLeaveRange(row.startDate, row.endDate)}</div>
                  </div>
                  <div>
                    <div className="modal-label" style={{ marginBottom: 3 }}>Filed</div>
                    <div style={{ fontSize: 14, color: 'var(--dash-text)' }}>
                      {(() => {
                        const f = (row.createdAt ?? row.updatedAt ?? row.created_at ?? row.updated_at ?? row.startDate ?? '').slice(0, 10)
                        return f.length >= 10 ? formatDate(f) : f || '—'
                      })()}
                    </div>
                  </div>
                </div>

                <div>
                  <div className="modal-label" style={{ marginBottom: 6 }}>Reason</div>
                  <div style={{
                    padding: '12px 14px',
                    borderRadius: 6,
                    background: 'var(--aa-field-bg)',
                    border: '1px solid var(--aa-content-border)',
                    fontSize: 14,
                    color: reason === '—' ? 'var(--dash-text-muted)' : 'var(--dash-text)',
                    lineHeight: 1.7,
                    whiteSpace: 'pre-wrap',
                    minHeight: 48,
                  }}>
                    {reason}
                  </div>
                </div>

                <div>
                  <div className="modal-label" style={{ marginBottom: 6 }}>Proof</div>
                  {leaveDetailProof.loading ? (
                    <div style={{ padding: '16px 0', fontSize: 13, color: 'var(--dash-text-muted)' }}>Loading proof…</div>
                  ) : leaveDetailProof.error ? (
                    <div style={{ fontSize: 13, color: 'var(--dash-text-muted)' }}>{leaveDetailProof.error}</div>
                  ) : leaveDetailProof.src ? (
                    <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid var(--aa-content-border)' }}>
                      {leaveDetailProof.sheet ? (
                        <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                          <table className="proof-preview-sheet">
                            <thead>
                              <tr>{leaveDetailProof.sheet.headers.map((h, i) => <th key={i}>{h || `Col ${i + 1}`}</th>)}</tr>
                            </thead>
                            <tbody>
                              {leaveDetailProof.sheet.rows.map((r, ri) => (
                                <tr key={ri}>{leaveDetailProof.sheet!.headers.map((_, ci) => <td key={ci}>{r[ci] ?? ''}</td>)}</tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : leaveDetailProof.mime.startsWith('image/') ? (
                        <img src={leaveDetailProof.src} alt="Proof" style={{ width: '100%', maxHeight: 420, objectFit: 'contain', display: 'block', background: 'var(--aa-field-bg)' }} />
                      ) : isInlinePreviewableMime(leaveDetailProof.mime) ? (
                        <iframe title="Proof file" src={leaveDetailProof.src} style={{ width: '100%', height: 420, border: 'none', display: 'block' }} />
                      ) : (
                        <div style={{ padding: '10px 12px', fontSize: 13 }}>
                          <a href={leaveDetailProof.src} download={leaveDetailProof.fileName || 'proof-file'} className="employees-link">
                            Download {leaveDetailProof.fileName || 'file'}
                          </a>
                        </div>
                      )}
                    </div>
                  ) : (
                    <span style={{ fontSize: 13, color: 'var(--dash-text-muted)' }}>No proof attached</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {proofPreview.open && (
        <div className="proof-preview-overlay" role="dialog" aria-modal="true" aria-label="Proof file preview">
          <div className="proof-preview-modal">
            <div className="proof-preview-header">
              <strong className="proof-preview-title" title={proofPreview.fileName || 'Proof file'}>
                {proofPreview.fileName || 'Proof file'}
              </strong>
              <button
                type="button"
                className="proof-preview-close"
                onClick={() => setProofPreview({ open: false, src: '', fileName: '', mime: '', sheet: null })}
              >
                Close
              </button>
            </div>
            <div className="proof-preview-body">
              {proofPreview.sheet ? (
                <div className="proof-preview-sheet-wrap">
                  {(() => {
                    const sheet = proofPreview.sheet
                    if (!sheet) return null
                    return (
                  <table className="proof-preview-sheet">
                    <thead>
                      <tr>
                        {sheet.headers.map((h, i) => (
                          <th key={`h-${i}`}>{h || `Column ${i + 1}`}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sheet.rows.map((row, ri) => (
                        <tr key={`r-${ri}`}>
                          {(sheet.headers.length > 0 ? sheet.headers : row).map((_, ci) => (
                            <td key={`c-${ri}-${ci}`}>{row[ci] ?? ''}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                    )
                  })()}
                </div>
              ) : proofPreview.mime.startsWith('image/') ? (
                <img src={proofPreview.src} alt={proofPreview.fileName || 'Proof file'} className="proof-preview-image" />
              ) : isInlinePreviewableMime(proofPreview.mime) ? (
                <iframe title={proofPreview.fileName || 'Proof file'} src={proofPreview.src} className="proof-preview-frame" />
              ) : (
                <div className="leave-request-banner leave-request-banner--warn">
                  Preview is not available for this file type ({proofPreview.mime || 'unknown'}). Use download instead.
                  <div style={{ marginTop: 10 }}>
                    <a href={proofPreview.src} download={proofPreview.fileName || 'proof-file'} className="employees-link">
                      Download file
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
