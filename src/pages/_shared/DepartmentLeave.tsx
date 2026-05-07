import { useMemo, useState, type FormEvent } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { useActivityLog } from '../../contexts/ActivityLogContext'
import { getPortalEmpId, getPortalUsername, hasApiBase } from '../../api/client'
import { createFileLeave } from '../../api/fileLeave'
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

/** Values are sent as `title` to the file-leave API exactly as stored. */
const LEAVE_TYPES = [
  { value: 'SICK LEAVE', label: 'SICK LEAVE' },
  { value: 'VACATION LEAVE', label: 'VACATION LEAVE' },
  { value: 'EMERGENCY LEAVE', label: 'EMERGENCY LEAVE' },
]

function segmentTitle(segment: string): string {
  return segment
    .split('-')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : ''))
    .join('-')
}

export default function DepartmentLeave() {
  const { segment: segmentParam } = useParams<{ segment: string }>()
  const segment = segmentParam ?? ''
  const { addEntry } = useActivityLog()

  const deptLabel = useMemo(() => roleLabelsForPortalPath(`/${segment}/leave`)[0] ?? segmentTitle(segment), [segment])
  const actor = useMemo(() => getPortalUsername() ?? deptLabel, [deptLabel])

  const [leaveType, setLeaveType] = useState(LEAVE_TYPES[0].value)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [reason, setReason] = useState('')
  const [proofFile, setProofFile] = useState<File | null>(null)
  const [attachmentName, setAttachmentName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const empId = getPortalEmpId()
  const empReady = empId != null && empId > 0

  if (!PORTAL_LEAVE_SEGMENTS.has(segment)) {
    return <Navigate to="/" replace />
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!startDate || !endDate) {
      setError('Please choose a start and end date.')
      return
    }
    if (new Date(startDate) > new Date(endDate)) {
      setError('End date must be on or after the start date.')
      return
    }
    if (!reason.trim()) {
      setError('Please add a short reason or note for your request.')
      return
    }

    const typeLabel = LEAVE_TYPES.find((t) => t.value === leaveType)?.label ?? leaveType

    if (!hasApiBase()) {
      setError('API is not configured. Set VITE_API_BASE_URL in .env to submit leave to the server.')
      return
    }

    if (!empReady || empId == null) {
      setError(
        'No Emp_ID for this login. Sign out and sign in again so the portal can save your employee id from login (stored in localStorage) for file-leave.',
      )
      return
    }

    setSubmitting(true)
    try {
      const res = await createFileLeave({
        Emp_ID: empId,
        title: typeLabel,
        startDate,
        endDate,
        reason: reason.trim(),
        proofFile,
      })

      const details = [
        `Department: ${deptLabel}`,
        `Dates: ${startDate} → ${endDate}`,
        `Type: ${typeLabel}`,
        attachmentName ? `Attachment: ${attachmentName}` : null,
        `Reason: ${reason.trim()}`,
        res.message ? `Server: ${res.message}` : null,
      ]
        .filter(Boolean)
        .join(' · ')

      addEntry({
        action: 'leave_requested',
        actor,
        target: `${deptLabel} leave (${typeLabel})`,
        details,
      })

      setSubmitted(true)
      setStartDate('')
      setEndDate('')
      setReason('')
      setProofFile(null)
      setAttachmentName(null)
      setLeaveType(LEAVE_TYPES[0].value)
      const fileInput = document.getElementById('leave-file') as HTMLInputElement | null
      if (fileInput) fileInput.value = ''
      window.setTimeout(() => setSubmitted(false), 6000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed.')
    } finally {
      setSubmitting(false)
    }
  }

  const apiReady = hasApiBase()

  return (
    <div className={`dashboard-page dashboard-page--${segment}`}>
      <header className="dashboard-page-header">
        <h1 className="dashboard-page-title">File leave</h1>
        <p className="dashboard-page-subtitle">
          Request time off for <strong>{deptLabel}</strong>. You can attach an optional proof file.
        </p>
      </header>
      <div className="dashboard-page-content">
        <section className="dashboard-card leave-request-card" aria-labelledby="leave-form-heading">
          <h2 id="leave-form-heading" className="dashboard-card-title">
            Leave request
          </h2>

          {!apiReady && (
            <p className="leave-request-banner leave-request-banner--warn" role="status">
              API base URL is not set — form validation runs locally only until you configure <code className="leave-request-code">VITE_API_BASE_URL</code>.
            </p>
          )}
          {apiReady && !empReady && (
            <p className="leave-request-banner leave-request-banner--error" role="alert">
              No <code className="leave-request-code">Emp_ID</code> in sessionStorage for this login. Sign out and sign in again so the portal can store it from
              your login or employees API.
            </p>
          )}

          {submitted && (
            <p className="leave-request-banner" role="status">
              Leave filed successfully. You can submit another if needed.
            </p>
          )}
          {error && (
            <p className="leave-request-banner leave-request-banner--error" role="alert">
              {error}
            </p>
          )}

          <form className="profile-form leave-request-form" onSubmit={onSubmit}>
            <div className="profile-field">
              <label htmlFor="leave-type" className="modal-label">
                Leave type
              </label>
              <select id="leave-type" className="modal-input" value={leaveType} onChange={(e) => setLeaveType(e.target.value)}>
                {LEAVE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="leave-request-dates">
              <div className="profile-field">
                <label htmlFor="leave-start" className="modal-label">
                  Start date
                </label>
                <input id="leave-start" type="date" className="modal-input" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
              </div>
              <div className="profile-field">
                <label htmlFor="leave-end" className="modal-label">
                  End date
                </label>
                <input id="leave-end" type="date" className="modal-input" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
              </div>
            </div>
            <div className="profile-field">
              <label htmlFor="leave-reason" className="modal-label">
                Reason / notes
              </label>
              <textarea
                id="leave-reason"
                className="modal-input"
                rows={4}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Briefly describe why you need leave (coverage, handover, etc.)"
                required
              />
            </div>
            <div className="profile-field">
              <label htmlFor="leave-file" className="modal-label">
                Proof file (optional, field name <code className="leave-request-code">proofFile</code>)
              </label>
              <input
                id="leave-file"
                type="file"
                className="leave-request-file"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null
                  setProofFile(f)
                  setAttachmentName(f?.name ?? null)
                }}
              />
              {attachmentName && <span className="leave-request-file-name">{attachmentName}</span>}
            </div>
            <div className="profile-actions">
              <button type="submit" className="employees-btn employees-btn-primary" disabled={submitting || !apiReady || !empReady}>
                {submitting ? 'Submitting…' : 'Submit leave request'}
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  )
}
