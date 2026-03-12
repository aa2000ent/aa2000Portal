import { useState, useEffect, useMemo } from 'react'
import { useActivityLog } from '../../contexts/ActivityLogContext'
import { useApprovals, type ApprovalRequest, type ApprovalStatus } from '../../contexts/ApprovalsContext'
import { useEmployees, DEFAULT_PASSWORD } from '../../contexts/EmployeesContext'
import { useRoles } from '../../contexts/RolesContext'
import ConfirmDialog, { type ConfirmVariant } from '../../components/ConfirmDialog'
import CustomSelect from '../../components/CustomSelect'

const MIN_PER_PAGE = 1
const MAX_PER_PAGE = 500

const TABS: { key: ApprovalStatus; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
]

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function AdminApprovals() {
  const { addEntry } = useActivityLog()
  const { requests, setRequests, pendingCount, approvedCount, rejectedCount } = useApprovals()
  const { employees, setEmployees } = useEmployees()
  const { roles, addRole } = useRoles()
  const [activeTab, setActiveTab] = useState<ApprovalStatus>('pending')
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [perPage, setPerPage] = useState(10)
  const [confirm, setConfirm] = useState<{
    open: boolean
    title: string
    message: string
    confirmLabel: string
    variant: ConfirmVariant
    onConfirm: () => void
  }>({ open: false, title: '', message: '', confirmLabel: '', variant: 'primary', onConfirm: () => {} })

  const counts = useMemo(() => ({
    pending: pendingCount,
    approved: approvedCount,
    rejected: rejectedCount,
  }), [pendingCount, approvedCount, rejectedCount])

  const requestRoles = useMemo(() => {
    const set = new Set<string>()
    requests.forEach((r) => set.add(r.requestedRole))
    return Array.from(set).sort()
  }, [requests])

  const filtered = useMemo(() => {
    return requests.filter((r) => {
      if (r.status !== activeTab) return false
      if (roleFilter && r.requestedRole !== roleFilter) return false
      if (search) {
        const s = search.toLowerCase()
        return r.name.toLowerCase().includes(s) || r.email.toLowerCase().includes(s)
      }
      return true
    })
  }, [requests, activeTab, search, roleFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage))
  const start = (currentPage - 1) * perPage
  const paginated = filtered.slice(start, start + perPage)

  useEffect(() => {
    setCurrentPage(1)
  }, [activeTab, search, roleFilter])

  useEffect(() => {
    setCurrentPage((p) => Math.min(p, totalPages))
  }, [filtered.length, totalPages])

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
        setRequests((prev) => prev.map((r) => r.id === req.id ? { ...r, status: 'approved' as const, resolvedAt: today } : r))
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
        setRequests((prev) => prev.map((r) => r.id === req.id ? { ...r, status: 'rejected' as const, resolvedAt: today } : r))
        setConfirm((c) => ({ ...c, open: false }))
      },
    })
  }

  return (
    <div className="dashboard-page">
      <header className="dashboard-page-header">
        <h1 className="dashboard-page-title">Approvals</h1>
        <p className="dashboard-page-subtitle">Review and manage sign-up requests</p>
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
          <div className="employees-toolbar">
            <div className="employees-search-wrap">
              <svg className="employees-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
              <input
                type="search"
                className="employees-search"
                placeholder="Search by name or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search requests"
              />
            </div>
            <div className="employees-row-toolbar">
              <CustomSelect
                value={roleFilter}
                onChange={setRoleFilter}
                options={requestRoles.map((r) => ({ value: r, label: r }))}
                placeholder="Requested role"
                aria-label="Filter by requested role"
                className="employees-filter-wrap"
              />
              <CustomSelect
                value={roleFilter}
                onChange={setRoleFilter}
                options={roles.map((r) => ({ value: r, label: r }))}
                placeholder="Role"
                aria-label="Filter by role"
                className="employees-filter-wrap"
              />
            </div>
          </div>

          {/* Table */}
          <div className="employees-table-wrap">
            <table className="employees-table applications-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Requested role</th>
                  <th>{activeTab === 'pending' ? 'Requested' : 'Date'}</th>
                  {activeTab === 'pending' ? (
                    <th className="employees-table-actions">Actions</th>
                  ) : (
                    <th>Status</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="employees-table-empty">
                      {activeTab === 'pending' ? 'No pending sign-up requests.' : `No ${activeTab} requests found.`}
                    </td>
                  </tr>
                ) : (
                  paginated.map((req) => (
                    <tr key={req.id}>
                      <td className="employees-table-name" data-label="Name">{req.name}</td>
                      <td data-label="Email">{req.email}</td>
                      <td data-label="Role"><span className="employees-badge">{req.requestedRole}</span></td>
                      <td data-label="Date">{formatDate(activeTab === 'pending' ? req.requestedAt : (req.resolvedAt || req.requestedAt))}</td>
                      {activeTab === 'pending' ? (
                        <td className="employees-table-actions" data-label="Actions">
                          <button type="button" className="approvals-action-btn approvals-action-btn--approve" title="Approve" onClick={() => handleApprove(req)}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                            Approve
                          </button>
                          <button type="button" className="approvals-action-btn approvals-action-btn--reject" title="Reject" onClick={() => handleReject(req)}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                            Reject
                          </button>
                        </td>
                      ) : (
                        <td data-label="Status">
                          <span className={`approvals-status approvals-status--${req.status}`}>
                            {req.status === 'approved' ? 'Approved' : 'Rejected'}
                          </span>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {filtered.length > 0 && (
            <div className="employees-pagination">
              <div className="employees-pagination-per-page">
                <label htmlFor="approvals-per-page" className="employees-pagination-label">Show</label>
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
                <button type="button" className="employees-pagination-btn" onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1} aria-label="Previous page">Previous</button>
                <span className="employees-pagination-page">Page {currentPage} of {totalPages}</span>
                <button type="button" className="employees-pagination-btn" onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= totalPages} aria-label="Next page">Next</button>
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
    </div>
  )
}
