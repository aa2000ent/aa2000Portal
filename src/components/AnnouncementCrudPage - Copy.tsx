import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import ConfirmDialog, { type ConfirmVariant } from './ConfirmDialog'
import {
  createAnnouncement,
  deleteAnnouncement,
  fetchAnnouncementById,
  fetchAnnouncementsByType,
  type AnnouncementItem,
  type AnnouncementStatus,
  type AnnouncementType,
  updateAnnouncement,
} from '../api/announcements'
import { getPortalAccountId } from '../api/client'
import { fetchEmployees } from '../api/employees'
import type { Employee } from '../contexts/EmployeesContext'

type Props = {
  type: AnnouncementType
  title: string
  subtitle: string
}

const MIN_PER_PAGE = 1
const MAX_PER_PAGE = 500
const CREATOR_SEGMENTS = new Set(['admin', 'ceo', 'general-manager'])

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('Failed to read image file.'))
    reader.readAsDataURL(file)
  })
}

export default function AnnouncementCrudPage({ type, title, subtitle }: Props) {
  const location = useLocation()
  const [list, setList] = useState<AnnouncementItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [perPage, setPerPage] = useState(10)

  const [openForm, setOpenForm] = useState(false)
  const [editing, setEditing] = useState<AnnouncementItem | null>(null)
  const [formTitle, setFormTitle] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formStatus, setFormStatus] = useState<AnnouncementStatus>('ACTIVE')
  const [formImageBase64, setFormImageBase64] = useState('')
  const [submitBusy, setSubmitBusy] = useState(false)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loadingEmployees, setLoadingEmployees] = useState(false)
  const [memoAudience, setMemoAudience] = useState<'ALL' | 'SELECTED'>('ALL')
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<number[]>([])
  const [memoRecipientSearch, setMemoRecipientSearch] = useState('')

  const [confirm, setConfirm] = useState<{
    open: boolean
    title: string
    message: string
    confirmLabel: string
    variant: ConfirmVariant
    onConfirm: () => void
  }>({ open: false, title: '', message: '', confirmLabel: '', variant: 'primary', onConfirm: () => {} })

  const canManage = useMemo(() => {
    const segment = location.pathname.split('/').filter(Boolean)[0] ?? ''
    return CREATOR_SEGMENTS.has(segment)
  }, [location.pathname])
  const isMemoPage = type === 'MEMO'

  // For non-managers viewing memos, pass their acc_ID so the backend only returns their memos.
  const viewerAccId = useMemo(() => {
    if (!isMemoPage || canManage) return undefined
    const n = Number(getPortalAccountId() ?? 0)
    return Number.isFinite(n) && n > 0 ? n : undefined
  }, [isMemoPage, canManage])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchAnnouncementsByType(type, viewerAccId)
      setList(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : `Failed to load ${title.toLowerCase()}.`)
      setList([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [type, viewerAccId])

  const filtered = useMemo(() => list.filter((item) => {
    const q = search.toLowerCase().trim()
    if (!q) return true
    return (
      item.Title.toLowerCase().includes(q) ||
      item.Description.toLowerCase().includes(q) ||
      item.Status.toLowerCase().includes(q)
    )
  }), [list, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage))
  const start = (currentPage - 1) * perPage
  const paginated = filtered.slice(start, start + perPage)

  useEffect(() => setCurrentPage(1), [search])

  function openAdd() {
    if (!canManage) return
    setEditing(null)
    setFormTitle('')
    setFormDescription('')
    setFormStatus('ACTIVE')
    setFormImageBase64('')
    setMemoAudience('ALL')
    setSelectedRecipientIds([])
    setMemoRecipientSearch('')
    setOpenForm(true)
  }

  async function openEdit(item: AnnouncementItem) {
    if (!canManage) return
    setEditing(item)
    setFormTitle(item.Title)
    setFormDescription(item.Description ?? '')
    setFormStatus(item.Status)
    setFormImageBase64(item.Image ?? '')
    setOpenForm(true)
    const fresh = await fetchAnnouncementById(item.an_ID)
    if (!fresh) return
    setEditing(fresh)
    setFormTitle(fresh.Title)
    setFormDescription(fresh.Description ?? '')
    setFormStatus(fresh.Status)
    setFormImageBase64(fresh.Image ?? '')
    setMemoAudience('ALL')
    setSelectedRecipientIds([])
    setMemoRecipientSearch('')
  }

  function closeForm() {
    setOpenForm(false)
    setEditing(null)
  }

  useEffect(() => {
    if (!canManage || !isMemoPage) return
    let cancelled = false
    setLoadingEmployees(true)
    void fetchEmployees()
      .then((list) => {
        if (cancelled) return
        setEmployees(list)
      })
      .catch(() => {
        if (cancelled) return
        setEmployees([])
      })
      .finally(() => {
        if (cancelled) return
        setLoadingEmployees(false)
      })
    return () => {
      cancelled = true
    }
  }, [canManage, isMemoPage])

  const memoSelectableEmployees = useMemo(() => {
    const seen = new Set<number>()
    const result: Array<{ accId: number; label: string }> = []
    for (const emp of employees) {
      const accId = Number(emp.accId ?? 0)
      if (!Number.isFinite(accId) || accId <= 0 || seen.has(accId)) continue
      seen.add(accId)
      const role = String(emp.role ?? '').trim()
      result.push({
        accId,
        label: role ? `${emp.name} (${role})` : emp.name,
      })
    }
    return result
  }, [employees])

  const allRecipientIds = useMemo(
    () => memoSelectableEmployees.map((emp) => emp.accId),
    [memoSelectableEmployees],
  )
  const filteredMemoRecipients = useMemo(() => {
    const q = memoRecipientSearch.trim().toLowerCase()
    if (!q) return memoSelectableEmployees
    return memoSelectableEmployees.filter((emp) => emp.label.toLowerCase().includes(q))
  }, [memoRecipientSearch, memoSelectableEmployees])

  function toggleMemoRecipient(accId: number) {
    setSelectedRecipientIds((prev) => {
      if (prev.includes(accId)) return prev.filter((id) => id !== accId)
      return [...prev, accId]
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canManage) return
    const cleanTitle = formTitle.trim()
    if (!cleanTitle) return
    if (isMemoPage && !editing && memoAudience === 'SELECTED' && selectedRecipientIds.length === 0) {
      setError('Please select at least one employee recipient, or choose Select all.')
      return
    }
    setConfirm({
      open: true,
      title: editing ? `Update ${title.toLowerCase()}?` : `Add ${title.toLowerCase()}?`,
      message: editing ? `Save changes to "${cleanTitle}"?` : `Create "${cleanTitle}"?`,
      confirmLabel: editing ? 'Save' : 'Create',
      variant: 'primary',
      onConfirm: () => {
        setConfirm((c) => ({ ...c, open: false }))
        void (async () => {
          setSubmitBusy(true)
          setError(null)
          try {
            const accId = Number(getPortalAccountId() ?? 0)
            if (editing) {
              await updateAnnouncement(editing.an_ID, {
                Title: cleanTitle,
                Description: formDescription.trim() || '',
                Image: formImageBase64 || '',
                Status: formStatus,
                type,
              })
            } else {
              const payload = {
                acc_ID: accId,
                Title: cleanTitle,
                Description: formDescription.trim() || '',
                Image: formImageBase64 || '',
                Status: formStatus,
                type,
                ...(isMemoPage
                  ? {
                      audience: memoAudience,
                      recipientAccIds: memoAudience === 'ALL' ? allRecipientIds : selectedRecipientIds,
                    }
                  : {}),
              } as const
              await createAnnouncement({
                ...payload,
              })
            }
            closeForm()
            await load()
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Request failed.')
          } finally {
            setSubmitBusy(false)
          }
        })()
      },
    })
  }

  function handleDelete(item: AnnouncementItem) {
    if (!canManage) return
    setConfirm({
      open: true,
      title: `Delete ${title.toLowerCase()}?`,
      message: `Delete "${item.Title}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
      onConfirm: () => {
        setConfirm((c) => ({ ...c, open: false }))
        void (async () => {
          setError(null)
          const ok = await deleteAnnouncement(item.an_ID)
          if (!ok) {
            setError(`Failed to delete ${title.toLowerCase()}.`)
            return
          }
          await load()
        })()
      },
    })
  }

  return (
    <div className="dashboard-page">
      <header className="dashboard-page-header">
        <h1 className="dashboard-page-title">{title}</h1>
        <p className="dashboard-page-subtitle">{subtitle}</p>
      </header>
      <div className="dashboard-page-content">
        {error && <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>}
        <section className="dashboard-card applications-card">
          <div className="employees-toolbar">
            <div className="employees-search-wrap">
              <svg className="employees-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <input
                type="search"
                className="employees-search"
                placeholder={`Search ${title.toLowerCase()}...`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label={`Search ${title.toLowerCase()}`}
              />
            </div>
            <button type="button" className="employees-btn employees-btn-primary" onClick={openAdd} disabled={!canManage}>
              {canManage ? `Add ${title}` : 'View only'}
            </button>
          </div>

          {loading ? (
            <div className="employees-empty">Loading {title.toLowerCase()}...</div>
          ) : filtered.length === 0 ? (
            <div className="employees-empty">No {title.toLowerCase()} found.</div>
          ) : (
            <ul className="app-grid" aria-label={title}>
              {paginated.map((item) => (
                <li key={item.an_ID} className="app-card">
                  <div className="app-card-header">
                    <div className="app-card-title-group">
                      <h3 className="app-card-name">{item.Title}</h3>
                      <p className="app-card-domain">{item.Status}</p>
                    </div>
                  </div>
                  <p className="app-card-desc">{item.Description || '—'}</p>
                  {item.Image ? (
                    <img
                      src={item.Image}
                      alt={item.Title}
                      className="w-full h-[140px] object-cover rounded-lg border border-slate-200 mb-2"
                    />
                  ) : null}
                  <div className="app-card-actions">
                    {canManage ? (
                      <>
                        <button type="button" className="app-card-edit" onClick={() => { void openEdit(item) }}>
                          Edit
                        </button>
                        <button type="button" className="app-card-delete" onClick={() => handleDelete(item)}>
                          Delete
                        </button>
                      </>
                    ) : (
                      <span className="app-card-domain">View only</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {filtered.length > 0 && (
            <div className="employees-pagination">
              <div className="employees-pagination-per-page">
                <label htmlFor={`${type}-per-page`} className="employees-pagination-label">Show</label>
                <input
                  id={`${type}-per-page`}
                  type="number"
                  min={MIN_PER_PAGE}
                  max={MAX_PER_PAGE}
                  className="employees-per-page-select employees-per-page-input"
                  value={perPage}
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10)
                    if (Number.isNaN(n)) return
                    const clamped = Math.max(MIN_PER_PAGE, Math.min(MAX_PER_PAGE, n))
                    setPerPage(clamped)
                    setCurrentPage(1)
                  }}
                />
                <span className="employees-pagination-label">per page</span>
              </div>
              <div className="employees-pagination-info">
                Showing {start + 1}-{Math.min(start + perPage, filtered.length)} of {filtered.length}
              </div>
              <div className="employees-pagination-nav">
                <button type="button" className="employees-pagination-btn" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage <= 1}>
                  Previous
                </button>
                <span className="employees-pagination-page">Page {currentPage} of {totalPages}</span>
                <button type="button" className="employees-pagination-btn" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages}>
                  Next
                </button>
              </div>
            </div>
          )}
        </section>
      </div>

      {openForm && canManage && (
        <div className="modal-overlay" onClick={closeForm} role="dialog" aria-modal="true">
          <div
            className="modal-box"
            style={{ maxWidth: isMemoPage ? 720 : undefined, width: isMemoPage ? '95vw' : undefined }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2 className="modal-title">{editing ? `Edit ${title}` : `Add ${title}`}</h2>
              <button type="button" className="modal-close" onClick={closeForm} aria-label="Close">✕</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: isMemoPage ? '1fr 1fr' : '1fr', gap: '0 20px' }}>
                {/* left column */}
                <div>
                  <div className="modal-field">
                    <label htmlFor={`${type}-title`} className="modal-label">Title</label>
                    <input id={`${type}-title`} type="text" className="modal-input" value={formTitle} onChange={(e) => setFormTitle(e.target.value)} required />
                  </div>
                  <div className="modal-field">
                    <label htmlFor={`${type}-desc`} className="modal-label">Description</label>
                    <textarea id={`${type}-desc`} className="modal-input" value={formDescription} onChange={(e) => setFormDescription(e.target.value)} rows={isMemoPage ? 5 : 4} />
                  </div>
                  <div className="modal-field">
                    <label htmlFor={`${type}-status`} className="modal-label">Status</label>
                    <select id={`${type}-status`} className="modal-input" value={formStatus} onChange={(e) => setFormStatus((e.target.value as AnnouncementStatus) || 'ACTIVE')}>
                      <option value="ACTIVE">ACTIVE</option>
                      <option value="INACTIVE">INACTIVE</option>
                    </select>
                  </div>
                  <div className="modal-field">
                    <label htmlFor={`${type}-image`} className="modal-label">Image</label>
                    <input
                      id={`${type}-image`}
                      type="file"
                      accept="image/*"
                      className="modal-input"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (!file) return
                        void toBase64(file).then(setFormImageBase64).catch((err) => setError(err instanceof Error ? err.message : 'Failed to load image.'))
                      }}
                    />
                    {formImageBase64 ? (
                      <img src={formImageBase64} alt="Selected preview" className="w-full h-[100px] object-cover rounded-lg border border-slate-200 mt-2" />
                    ) : null}
                  </div>
                </div>

                {/* right column — recipients (memo only) */}
                {isMemoPage ? (
                  <div className="modal-field" style={{ marginTop: 0 }}>
                    <label className="modal-label">Recipients</label>
                    <div style={{ display: 'flex', gap: 16, marginBottom: 10 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', color: 'var(--dash-text)' }}>
                        <input
                          type="radio"
                          name="memo-audience"
                          checked={memoAudience === 'ALL'}
                          onChange={() => setMemoAudience('ALL')}
                          style={{ accentColor: 'var(--dash-primary)' }}
                        />
                        All employees
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', color: 'var(--dash-text)' }}>
                        <input
                          type="radio"
                          name="memo-audience"
                          checked={memoAudience === 'SELECTED'}
                          onChange={() => setMemoAudience('SELECTED')}
                          style={{ accentColor: 'var(--dash-primary)' }}
                        />
                        Select specific
                      </label>
                    </div>

                    {memoAudience === 'ALL' ? (
                      <div style={{
                        padding: '10px 12px',
                        borderRadius: 6,
                        background: 'var(--aa-field-bg)',
                        fontSize: 13,
                        color: 'var(--dash-text-muted)',
                        border: '1px solid var(--aa-content-border)',
                      }}>
                        {loadingEmployees
                          ? 'Loading employees…'
                          : allRecipientIds.length > 0
                            ? `All ${allRecipientIds.length} employee accounts will receive this memo.`
                            : 'Employee list unavailable. Memo will be sent to all.'}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ position: 'relative' }}>
                          <svg style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--dash-text-muted)', pointerEvents: 'none' }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                          </svg>
                          <input
                            type="search"
                            className="modal-input"
                            style={{ paddingLeft: 28, marginBottom: 0 }}
                            placeholder="Search employee…"
                            value={memoRecipientSearch}
                            onChange={(event) => setMemoRecipientSearch(event.target.value)}
                            aria-label="Search memo recipients"
                          />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 18 }}>
                          <span style={{ fontSize: 12, color: selectedRecipientIds.length > 0 ? 'var(--dash-primary)' : 'var(--dash-text-muted)', fontWeight: selectedRecipientIds.length > 0 ? 500 : 400 }}>
                            {selectedRecipientIds.length > 0 ? `${selectedRecipientIds.length} selected` : 'No employees selected'}
                          </span>
                          {selectedRecipientIds.length > 0 && (
                            <button
                              type="button"
                              style={{ fontSize: 11, color: 'var(--dash-text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                              onClick={() => setSelectedRecipientIds([])}
                            >
                              Clear all
                            </button>
                          )}
                        </div>
                        <ul className="modal-roles-ul" style={{ maxHeight: 220, overflowY: 'auto', marginBottom: 0 }}>
                          {loadingEmployees ? (
                            <li style={{ padding: '10px 12px', fontSize: 13, color: 'var(--dash-text-muted)', listStyle: 'none' }}>Loading employees…</li>
                          ) : filteredMemoRecipients.length === 0 ? (
                            <li style={{ padding: '10px 12px', fontSize: 13, color: 'var(--dash-text-muted)', listStyle: 'none' }}>
                              {memoSelectableEmployees.length === 0 ? 'No employees available.' : 'No employees matched.'}
                            </li>
                          ) : (
                            filteredMemoRecipients.map((employee) => (
                              <li
                                key={employee.accId}
                                className="modal-role-item"
                                style={{
                                  cursor: 'pointer',
                                  background: selectedRecipientIds.includes(employee.accId) ? 'rgba(59,130,246,0.10)' : undefined,
                                  justifyContent: 'flex-start',
                                  gap: 10,
                                }}
                                onClick={() => toggleMemoRecipient(employee.accId)}
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedRecipientIds.includes(employee.accId)}
                                  onChange={() => toggleMemoRecipient(employee.accId)}
                                  onClick={(e) => e.stopPropagation()}
                                  style={{ accentColor: 'var(--dash-primary)', width: 14, height: 14, flexShrink: 0 }}
                                />
                                <span style={{ fontSize: 13, color: 'var(--dash-text)', lineHeight: 1.3 }}>{employee.label}</span>
                              </li>
                            ))
                          )}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>

              <div className="modal-actions">
                <button type="button" className="employees-btn employees-btn-secondary" onClick={closeForm}>Cancel</button>
                <button
                  type="submit"
                  className="employees-btn employees-btn-primary"
                  disabled={submitBusy || (isMemoPage && memoAudience === 'SELECTED' && selectedRecipientIds.length === 0)}
                >
                  {submitBusy ? 'Saving...' : editing ? 'Save changes' : 'Create'}
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

