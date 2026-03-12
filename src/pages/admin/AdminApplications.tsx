import { useEffect, useMemo, useState } from 'react'
import { useRoles } from '../../contexts/RolesContext'
import { useActivityLog } from '../../contexts/ActivityLogContext'
import { useApplications, type App } from '../../contexts/ApplicationsContext'
import ConfirmDialog, { type ConfirmVariant } from '../../components/ConfirmDialog'
import CustomSelect from '../../components/CustomSelect'

const MIN_PER_PAGE = 1
const MAX_PER_PAGE = 500

const DEFAULT_NEW_APP = { name: '', description: '', domain: '', visibleTo: [] as string[] }

export default function AdminApplications() {
  const { roles } = useRoles()
  const { addEntry } = useActivityLog()
  const { apps, setApps } = useApplications()
  const [search, setSearch] = useState('')
  const [departmentFilter, setDepartmentFilter] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [perPage, setPerPage] = useState(10)
  const [addAppOpen, setAddAppOpen] = useState(false)
  const [newApp, setNewApp] = useState(DEFAULT_NEW_APP)
  const [confirm, setConfirm] = useState<{
    open: boolean
    title: string
    message: string
    confirmLabel: string
    variant: ConfirmVariant
    onConfirm: () => void
  }>({ open: false, title: '', message: '', confirmLabel: '', variant: 'primary', onConfirm: () => {} })

  const departments = useMemo(() => {
    const set = new Set<string>()
    apps.forEach((app) => app.visibleTo.forEach((d) => set.add(d)))
    return Array.from(set).sort()
  }, [apps])

  const filtered = apps.filter((app) => {
    const matchSearch =
      app.name.toLowerCase().includes(search.toLowerCase()) ||
      app.description.toLowerCase().includes(search.toLowerCase()) ||
      app.domain.toLowerCase().includes(search.toLowerCase())
    const matchDepartment = !departmentFilter || app.visibleTo.includes(departmentFilter)
    return matchSearch && matchDepartment
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage))
  const start = (currentPage - 1) * perPage
  const paginated = filtered.slice(start, start + perPage)

  useEffect(() => {
    setCurrentPage(1)
  }, [search, departmentFilter])

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

  const handleLaunch = (app: App) => {
    if (app.domain) {
      addEntry({ action: 'app_launched', actor: 'Admin', target: app.name, details: app.domain })
      const url = app.domain.startsWith('http') ? app.domain : `https://${app.domain}`
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  }

  const handleDeleteApp = (app: App) => {
    setConfirm({
      open: true,
      title: 'Delete application',
      message: `Delete "${app.name}"? This application will be removed from the portal. This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
      onConfirm: () => {
        addEntry({ action: 'app_deleted', actor: 'Admin', target: app.name, details: 'Removed from portal' })
        setApps((prev) => prev.filter((a) => a.id !== app.id))
        setConfirm((c) => ({ ...c, open: false }))
      },
    })
  }

  const toggleVisibleTo = (level: string) => {
    setNewApp((prev) => ({
      ...prev,
      visibleTo: prev.visibleTo.includes(level) ? prev.visibleTo.filter((l) => l !== level) : [...prev.visibleTo, level],
    }))
  }

  const handleAddApp = (e: React.FormEvent) => {
    e.preventDefault()
    const name = newApp.name.trim()
    if (!name) return
    const id = Math.max(0, ...apps.map((a) => a.id)) + 1
    const domain = newApp.domain.trim()
    const app: App = {
      id,
      name,
      description: newApp.description.trim(),
      domain: domain.startsWith('http') ? domain : domain ? `https://${domain}` : '',
      visibleTo: [...newApp.visibleTo],
    }
    setApps((prev) => [...prev, app])
    addEntry({ action: 'app_added', actor: 'Admin', target: name, details: newApp.visibleTo.length ? `Added to ${newApp.visibleTo.join(', ')}` : undefined })
    setNewApp(DEFAULT_NEW_APP)
    setAddAppOpen(false)
  }

  return (
    <div className="dashboard-page">
      <header className="dashboard-page-header">
        <h1 className="dashboard-page-title">Applications</h1>
        <p className="dashboard-page-subtitle">Manage portal apps and integrations</p>
      </header>
      <div className="dashboard-page-content">
        <section className="dashboard-card applications-card">
          <div className="employees-toolbar">
            <div className="employees-search-wrap">
              <svg className="employees-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <input
                type="search"
                className="employees-search"
                placeholder="Search by app name, description, or domain..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search apps"
              />
            </div>
            <div className="employees-row-toolbar">
              <CustomSelect
                value={departmentFilter}
                onChange={setDepartmentFilter}
                options={departments.map((d) => ({ value: d, label: d }))}
                placeholder="All departments"
                aria-label="Filter by department"
                className="employees-filter-wrap"
              />
              <button
                type="button"
                className="employees-btn employees-btn-primary"
                onClick={() => {
                  setNewApp(DEFAULT_NEW_APP)
                  setAddAppOpen(true)
                }}
              >
                Add application
              </button>
            </div>
          </div>

          <div className="app-grid-wrap">
            {filtered.length === 0 ? (
              <div className="app-grid-empty">No apps match your search or filters.</div>
            ) : (
              <ul className="app-grid" aria-label="Application list">
                {paginated.map((app) => {
                  const visibleDepts = app.visibleTo.filter((r) => roles.includes(r))
                  return (
                    <li key={app.id} className="app-card">
                      <div className="app-card-icon" aria-hidden>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="3" width="7" height="7" rx="1" />
                          <rect x="14" y="3" width="7" height="7" rx="1" />
                          <rect x="14" y="14" width="7" height="7" rx="1" />
                          <rect x="3" y="14" width="7" height="7" rx="1" />
                        </svg>
                      </div>
                      <h3 className="app-card-name">{app.name}</h3>
                      <p className="app-card-desc">{app.description || '—'}</p>
                      {app.domain ? (
                        <p className="app-card-domain" title={app.domain}>{app.domain.replace(/^https?:\/\//, '')}</p>
                      ) : null}
                      {visibleDepts.length > 0 ? (
                        <div className="app-card-depts">
                          {visibleDepts.map((d) => (
                            <span key={d} className="app-card-dept-tag">{d}</span>
                          ))}
                        </div>
                      ) : null}
                      <div className="app-card-actions">
                        <button
                          type="button"
                          className="app-card-launch"
                          title="Launch"
                          onClick={() => handleLaunch(app)}
                          disabled={!app.domain}
                        >
                          Launch
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                            <polyline points="15 3 21 3 21 9" />
                            <line x1="10" y1="14" x2="21" y2="3" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          className="app-card-delete"
                          title="Delete"
                          onClick={() => handleDeleteApp(app)}
                        >
                          Delete
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {filtered.length > 0 && (
            <div className="employees-pagination">
              <div className="employees-pagination-per-page">
                <label htmlFor="applications-per-page" className="employees-pagination-label">Show</label>
                <input
                  id="applications-per-page"
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

      {addAppOpen && (
        <div
          className="modal-overlay"
          onClick={() => setAddAppOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-app-title"
        >
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 id="add-app-title" className="modal-title">Add application</h2>
              <button type="button" className="modal-close" onClick={() => setAddAppOpen(false)} aria-label="Close">
                ×
              </button>
            </div>
            <form onSubmit={handleAddApp}>
              <div className="modal-field">
                <label htmlFor="app-name" className="modal-label">App name</label>
                <input
                  id="app-name"
                  type="text"
                  className="modal-input"
                  value={newApp.name}
                  onChange={(e) => setNewApp((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. Cash Lifeline"
                  required
                />
              </div>
              <div className="modal-field">
                <label htmlFor="app-description" className="modal-label">Description</label>
                <input
                  id="app-description"
                  type="text"
                  className="modal-input"
                  value={newApp.description}
                  onChange={(e) => setNewApp((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Brief description of the app"
                />
              </div>
              <div className="modal-field">
                <label htmlFor="app-domain" className="modal-label">Domain</label>
                <input
                  id="app-domain"
                  type="url"
                  className="modal-input"
                  value={newApp.domain}
                  onChange={(e) => setNewApp((prev) => ({ ...prev, domain: e.target.value }))}
                  placeholder="https://app.example.com"
                />
              </div>
              <div className="modal-field">
                <span className="modal-label">Departments (who can see this app)</span>
                <div className="modal-roles-list" style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {roles.map((dept) => (
                    <label key={dept} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={newApp.visibleTo.includes(dept)}
                        onChange={() => toggleVisibleTo(dept)}
                      />
                      <span>{dept}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="employees-btn employees-btn-secondary" onClick={() => setAddAppOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="employees-btn employees-btn-primary">
                  Add application
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
