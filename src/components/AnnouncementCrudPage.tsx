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

  // Meeting Minutes fields
  const [minutesDate, setMinutesDate] = useState('')
  const [minutesLocation, setMinutesLocation] = useState('')
  const [minutesStart, setMinutesStart] = useState('')
  const [minutesEnd, setMinutesEnd] = useState('')
  const [minutesChairperson, setMinutesChairperson] = useState('')
  const [minutesTaker, setMinutesTaker] = useState('')
  const [minutesPresent, setMinutesPresent] = useState('')
  const [minutesAbsent, setMinutesAbsent] = useState('')
  const [minutesGuests, setMinutesGuests] = useState('')
  const [minutesObjective, setMinutesObjective] = useState('')
  const [minutesApproval, setMinutesApproval] = useState('')
  const [minutesAgenda, setMinutesAgenda] = useState('')
  const [minutesMotions, setMinutesMotions] = useState('')
  const [minutesDecisions, setMinutesDecisions] = useState('')

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
  const isMinutesPage = type === 'MEETING_MINUTES'

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

    setMinutesDate('')
    setMinutesLocation('')
    setMinutesStart('')
    setMinutesEnd('')
    setMinutesChairperson('')
    setMinutesTaker('')
    setMinutesPresent('')
    setMinutesAbsent('')
    setMinutesGuests('')
    setMinutesObjective('')
    setMinutesApproval('')
    setMinutesAgenda('')
    setMinutesMotions('')
    setMinutesDecisions('')

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

    if (fresh.type === 'MEETING_MINUTES') {
      try {
        const p = JSON.parse(fresh.Description ?? '{}')
        setMinutesDate(p.date || '')
        setMinutesLocation(p.location || '')
        setMinutesStart(p.start || '')
        setMinutesEnd(p.end || '')
        setMinutesChairperson(p.chairperson || '')
        setMinutesTaker(p.minuteTaker || '')
        setMinutesPresent(p.present || '')
        setMinutesAbsent(p.absent || '')
        setMinutesGuests(p.guests || '')
        setMinutesObjective(p.objective || '')
        setMinutesApproval(p.approval || '')
        setMinutesAgenda(p.agenda || '')
        setMinutesMotions(p.motions || '')
        setMinutesDecisions(p.decisions || '')
      } catch {
        // legacy or plain text
      }
    }
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
    const myAccId = Number(getPortalAccountId() ?? 0)
    const seen = new Set<number>()
    const result: Array<{ accId: number; label: string }> = []
    for (const emp of employees) {
      const accId = Number(emp.accId ?? 0)
      if (!Number.isFinite(accId) || accId <= 0 || seen.has(accId)) continue
      if (myAccId > 0 && accId === myAccId) continue
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

    let finalDescription = formDescription.trim() || ''
    if (isMinutesPage) {
      finalDescription = JSON.stringify({
        date: minutesDate,
        location: minutesLocation,
        start: minutesStart,
        end: minutesEnd,
        chairperson: minutesChairperson,
        minuteTaker: minutesTaker,
        present: minutesPresent,
        absent: minutesAbsent,
        guests: minutesGuests,
        objective: minutesObjective,
        approval: minutesApproval,
        agenda: minutesAgenda,
        motions: minutesMotions,
        decisions: minutesDecisions
      })
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
                Description: finalDescription,
                Image: formImageBase64 || '',
                Status: formStatus,
                type,
              })
            } else {
              const payload = {
                acc_ID: accId,
                Title: cleanTitle,
                Description: finalDescription,
                Image: formImageBase64 || '',
                Status: formStatus,
                type,
                ...(isMemoPage
                  ? {
                      audience: memoAudience,
                      // Always include creator so they can see their own memos via /memos/employee/:id
                      recipientAccIds: [
                        ...(memoAudience === 'ALL' ? allRecipientIds : selectedRecipientIds),
                        ...(accId > 0 ? [accId] : []),
                      ].filter((id, idx, arr) => arr.indexOf(id) === idx),
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
            <ul className="ann-grid" aria-label={title}>
              {paginated.map((item) => {
                const desc = (() => {
                  if (item.type === 'MEETING_MINUTES') {
                    try { const p = JSON.parse(item.Description); return p.objective || p.agenda || 'Meeting Minutes' } catch { return item.Description || '—' }
                  }
                  return item.Description || '—'
                })()
                const dateLabel = item.Date ? new Date(item.Date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : ''
                return (
                  <li key={item.an_ID} className="ann-card">
                    {item.Image ? (
                      <div className="ann-card-image">
                        <img src={item.Image} alt={item.Title} />
                      </div>
                    ) : (
                      <div className="ann-card-image ann-card-image--empty">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity=".3"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                      </div>
                    )}
                    <div className="ann-card-body">
                      <div className="ann-card-meta">
                        <span className={`ann-card-status ${item.Status === 'ACTIVE' ? 'ann-card-status--active' : 'ann-card-status--inactive'}`}>{item.Status}</span>
                        {dateLabel && <span className="ann-card-date">{dateLabel}</span>}
                      </div>
                      <h3 className="ann-card-title">{item.Title}</h3>
                      <p className="ann-card-desc">{desc}</p>
                    </div>
                    <div className="ann-card-footer">
                      {canManage ? (
                        <>
                          <button type="button" className="ann-card-btn ann-card-btn--edit" onClick={() => { void openEdit(item) }}>Edit</button>
                          <button type="button" className="ann-card-btn ann-card-btn--delete" onClick={() => handleDelete(item)}>Delete</button>
                        </>
                      ) : (
                        <span className="ann-card-readonly">View only</span>
                      )}
                    </div>
                  </li>
                )
              })}
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
            style={{ maxWidth: isMemoPage ? 720 : isMinutesPage ? 800 : undefined, width: (isMemoPage || isMinutesPage) ? '95vw' : undefined }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2 className="modal-title">{editing ? `Edit ${title}` : `Add ${title}`}</h2>
              <button type="button" className="modal-close" onClick={closeForm} aria-label="Close">✕</button>
            </div>
            <form onSubmit={handleSubmit}>
              {isMinutesPage ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <div className="modal-field">
                    <label htmlFor={`${type}-title`} className="modal-label">Meeting Title</label>
                    <input id={`${type}-title`} type="text" className="modal-input" value={formTitle} onChange={(e) => setFormTitle(e.target.value)} required />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
                    <div className="modal-field">
                      <label htmlFor="minutes-date" className="modal-label">Date</label>
                      <input id="minutes-date" type="date" className="modal-input" value={minutesDate} onChange={e => setMinutesDate(e.target.value)} />
                    </div>
                    <div className="modal-field">
                      <label htmlFor="minutes-location" className="modal-label">Location</label>
                      <input id="minutes-location" type="text" className="modal-input" value={minutesLocation} onChange={e => setMinutesLocation(e.target.value)} />
                    </div>
                    <div className="modal-field">
                      <label htmlFor="minutes-start" className="modal-label">Start Time</label>
                      <input id="minutes-start" type="time" className="modal-input" value={minutesStart} onChange={e => setMinutesStart(e.target.value)} />
                    </div>
                    <div className="modal-field">
                      <label htmlFor="minutes-end" className="modal-label">End Time</label>
                      <input id="minutes-end" type="time" className="modal-input" value={minutesEnd} onChange={e => setMinutesEnd(e.target.value)} />
                    </div>
                    <div className="modal-field">
                      <label htmlFor="minutes-chair" className="modal-label">Chairperson</label>
                      <input id="minutes-chair" type="text" className="modal-input" value={minutesChairperson} onChange={e => setMinutesChairperson(e.target.value)} />
                    </div>
                    <div className="modal-field">
                      <label htmlFor="minutes-taker" className="modal-label">Minute Taker</label>
                      <input id="minutes-taker" type="text" className="modal-input" value={minutesTaker} onChange={e => setMinutesTaker(e.target.value)} />
                    </div>
                  </div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
                    <div className="modal-field">
                      <label htmlFor="minutes-present" className="modal-label">Present Attendees</label>
                      <textarea id="minutes-present" className="modal-input" rows={2} value={minutesPresent} onChange={e => setMinutesPresent(e.target.value)} />
                    </div>
                    <div className="modal-field">
                      <label htmlFor="minutes-absent" className="modal-label">Absent Members</label>
                      <textarea id="minutes-absent" className="modal-input" rows={2} value={minutesAbsent} onChange={e => setMinutesAbsent(e.target.value)} />
                    </div>
                  </div>

                  <div className="modal-field">
                    <label htmlFor="minutes-guests" className="modal-label">Guests</label>
                    <input id="minutes-guests" type="text" className="modal-input" value={minutesGuests} onChange={e => setMinutesGuests(e.target.value)} />
                  </div>
                  <div className="modal-field">
                    <label htmlFor="minutes-objective" className="modal-label">Meeting Objective</label>
                    <input id="minutes-objective" type="text" className="modal-input" value={minutesObjective} onChange={e => setMinutesObjective(e.target.value)} />
                  </div>
                  <div className="modal-field">
                    <label htmlFor="minutes-approval" className="modal-label">Approval of Previous Minutes</label>
                    <select id="minutes-approval" className="modal-input" value={minutesApproval} onChange={e => setMinutesApproval(e.target.value)}>
                      <option value="">Select Status</option>
                      <option value="approved">Approved</option>
                      <option value="amended">Amended</option>
                      <option value="rejected">Rejected</option>
                    </select>
                  </div>
                  <div className="modal-field">
                    <label htmlFor="minutes-agenda" className="modal-label">Agenda Items & Summary</label>
                    <textarea id="minutes-agenda" className="modal-input" rows={3} value={minutesAgenda} onChange={e => setMinutesAgenda(e.target.value)} />
                  </div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
                    <div className="modal-field">
                      <label htmlFor="minutes-motions" className="modal-label">Motions and Votes</label>
                      <textarea id="minutes-motions" className="modal-input" rows={3} value={minutesMotions} onChange={e => setMinutesMotions(e.target.value)} />
                    </div>
                    <div className="modal-field">
                      <label htmlFor="minutes-decisions" className="modal-label">Decisions Made</label>
                      <textarea id="minutes-decisions" className="modal-input" rows={3} value={minutesDecisions} onChange={e => setMinutesDecisions(e.target.value)} />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
                    <div className="modal-field">
                      <label htmlFor={`${type}-status`} className="modal-label">Status</label>
                      <select id={`${type}-status`} className="modal-input" value={formStatus} onChange={(e) => setFormStatus((e.target.value as AnnouncementStatus) || 'ACTIVE')}>
                        <option value="ACTIVE">ACTIVE</option>
                        <option value="INACTIVE">INACTIVE</option>
                      </select>
                    </div>
                    <div className="modal-field">
                      <label htmlFor={`${type}-image`} className="modal-label">Attachment (Image)</label>
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
                </div>
              ) : (
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
              )}

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

