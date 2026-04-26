import { useState, useEffect } from 'react'
import { useActivityLog, type ActionType } from '../../contexts/ActivityLogContext'
import CustomSelect from '../../components/CustomSelect'

const ACTION_LABELS: Record<ActionType, string> = {
  user_added: 'User added',
  user_updated: 'User updated',
  user_disabled: 'User disabled',
  app_added: 'Application added',
  app_updated: 'Application updated',
  app_deleted: 'Application deleted',
  app_launched: 'Application launched',
  signup_approved: 'Sign-up approved',
  signup_rejected: 'Sign-up rejected',
  role_added: 'Role added',
  role_deleted: 'Role deleted',
  sign_in: 'Sign in',
  sign_out: 'Sign out',
  page_visited: 'Page visited',
  profile_updated: 'Profile updated',
  password_changed: 'Password changed',
  '2fa_enabled': '2FA enabled',
  '2fa_disabled': '2FA disabled',
  session_revoked: 'Session revoked',
  announcement_posted: 'Announcement posted',
  memo_created: 'Memo created',
}

const ACTION_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'All actions' },
  ...(Object.entries(ACTION_LABELS).map(([value, label]) => ({ value, label }))),
]

/* Rows where actor is the Admin portal identity are hidden (GM must not see admin actions; admin view hides own role noise). */
const DEPARTMENT_OPTIONS_ADMIN = [
  { value: 'all', label: 'All departments' },
  { value: 'Marketing', label: 'Marketing' },
  { value: 'Finance', label: 'Finance' },
  { value: 'Engineering', label: 'Engineering' },
]

const DEPARTMENT_OPTIONS_GM = [
  { value: 'all', label: 'All roles' },
  { value: 'Marketing', label: 'Marketing' },
  { value: 'Finance', label: 'Finance' },
  { value: 'Engineering', label: 'Engineering' },
  { value: 'General Manager', label: 'General Manager' },
]

const MIN_PER_PAGE = 1
const MAX_PER_PAGE = 500

export type AdminHistoryProps = {
  /** Subtitle/filter copy only; Admin actor rows are always hidden in both views. */
  variant?: 'admin' | 'general-manager'
}

export default function AdminHistory({ variant = 'admin' }: AdminHistoryProps) {
  const { entries } = useActivityLog()
  const departmentOptions = variant === 'general-manager' ? DEPARTMENT_OPTIONS_GM : DEPARTMENT_OPTIONS_ADMIN
  const [search, setSearch] = useState('')
  const [departmentFilter, setDepartmentFilter] = useState('all')
  const [actionFilter, setActionFilter] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [perPage, setPerPage] = useState(10)

  const filtered = entries.filter((e) => {
    if (e.actor === 'Admin') return false
    const matchSearch =
      e.actor.toLowerCase().includes(search.toLowerCase()) ||
      e.target.toLowerCase().includes(search.toLowerCase()) ||
      (e.details && e.details.toLowerCase().includes(search.toLowerCase()))
    const matchDepartment = departmentFilter === 'all' || e.actor === departmentFilter
    const matchAction = actionFilter === 'all' || e.action === actionFilter
    return matchSearch && matchDepartment && matchAction
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage))
  const start = (currentPage - 1) * perPage
  const paginated = filtered.slice(start, start + perPage)

  useEffect(() => {
    setCurrentPage(1)
  }, [search, departmentFilter, actionFilter])

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

  return (
    <div className="dashboard-page">
      <header className="dashboard-page-header">
        <h1 className="dashboard-page-title">Activity logs</h1>
        <p className="dashboard-page-subtitle">
          {variant === 'general-manager'
            ? 'Portal actions in this browser. Admin-area actions are not shown here.'
            : 'Activity and audit logs from Marketing, Finance, and Engineering'}
        </p>
      </header>
      <div className="dashboard-page-content">
        <section className="dashboard-card history-card">
          <div className="employees-toolbar">
            <div className="employees-search-wrap">
              <svg className="employees-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <input
                type="search"
                className="employees-search"
                placeholder="Search by position, target, or details..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search activity logs"
              />
            </div>
            <div className="employees-row-toolbar">
              <CustomSelect
                value={departmentFilter}
                onChange={setDepartmentFilter}
                options={departmentOptions}
                placeholder={variant === 'general-manager' ? 'All roles' : 'All departments'}
                aria-label="Filter by department"
                className="employees-filter-wrap"
                allowEmpty={false}
              />
              <CustomSelect
                value={actionFilter}
                onChange={setActionFilter}
                options={ACTION_OPTIONS}
                placeholder="All actions"
                aria-label="Filter by action"
                className="employees-filter-wrap"
                allowEmpty={false}
              />
            </div>
          </div>

          <div className="employees-table-wrap">
            <table className="employees-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Action</th>
                  <th>Position</th>
                  <th>Target</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="employees-table-empty">
                      No matching activity found.
                    </td>
                  </tr>
                ) : (
                  paginated.map((entry) => (
                    <tr key={entry.id}>
                      <td data-label="Time">{entry.timestamp}</td>
                      <td data-label="Action">
                        <span className="employees-badge">{ACTION_LABELS[entry.action]}</span>
                      </td>
                      <td data-label="Position" className="employees-table-name">{entry.actor}</td>
                      <td data-label="Target">{entry.target && entry.target !== '—' ? entry.target : 'Portal'}</td>
                      <td data-label="Details">{entry.details ?? '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {filtered.length > 0 && (
            <div className="employees-pagination">
              <div className="employees-pagination-per-page">
                <label htmlFor="activity-logs-per-page" className="employees-pagination-label">Show</label>
                <input
                  id="activity-logs-per-page"
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
                <button
                  type="button"
                  className="employees-pagination-btn"
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage <= 1}
                  aria-label="Previous page"
                >
                  Previous
                </button>
                <span className="employees-pagination-page">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  className="employees-pagination-btn"
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage >= totalPages}
                  aria-label="Next page"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
