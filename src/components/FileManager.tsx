import React, { useEffect, useState } from 'react'
import { Folder, FolderOpen, FileText, ChevronDown, Loader2, AlertCircle, ExternalLink, Building2 } from 'lucide-react'
import { readSheet } from 'read-excel-file/browser'
import { fetchProjectFiles } from '../api/projects'
import { getBaseUrl } from '../api/config'
import type { ProjectFileData, ProjectFile } from '../api/projectTypes'

interface FileManagerProps {
  application?: string
}

interface SpreadsheetPreview {
  open: boolean
  fileName: string
  sheet: { headers: string[]; rows: string[][] } | null
  loading: boolean
  error: string | null
}

function resolveProjectFileUrl(rawPath: string | null | undefined): string | null {
  const path = String(rawPath ?? '').trim()
  if (!path) return null
  if (/^https?:\/\//i.test(path) || path.startsWith('blob:') || path.startsWith('data:')) return path
  if (/^[A-Za-z]:\\/.test(path)) return null

  const normalized = path.replace(/\\/g, '/')
  const relative = normalized.startsWith('/') ? normalized : `/${normalized}`

  try {
    const base = String(getBaseUrl() ?? '').replace(/\/$/, '')
    if (base) return `${base}${relative}`
  } catch {
    // ignore invalid base URL and fall back to browser-relative path
  }

  return relative
}

export const FileManager: React.FC<FileManagerProps> = ({ application = 'TECHNCODE' }) => {
  const [data, setData] = useState<ProjectFileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(new Set())
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set())
  const [spreadsheetPreview, setSpreadsheetPreview] = useState<SpreadsheetPreview>({
    open: false,
    fileName: '',
    sheet: null,
    loading: false,
    error: null,
  })

  function isSpreadsheetFile(fileName: string) {
    return /\.(xlsx|xls|csv)$/i.test(fileName)
  }

  async function previewSpreadsheet(fileUrl: string, fileName: string) {
    setSpreadsheetPreview({ open: true, fileName, sheet: null, loading: true, error: null })
    try {
      const response = await fetch(fileUrl, { credentials: 'include' })
      if (!response.ok) {
        throw new Error(`Unable to load spreadsheet: ${response.status} ${response.statusText}`)
      }
      const buffer = await response.arrayBuffer()
      const matrix = await readSheet(buffer)
      if (!Array.isArray(matrix) || matrix.length === 0) {
        throw new Error('Spreadsheet contains no rows')
      }
      const rowsAsStrings = matrix.map((row) => (Array.isArray(row) ? row.map((cell) => String(cell ?? '')) : []))
      const headers = rowsAsStrings[0] ?? []
      const rows = rowsAsStrings.slice(1, 101)
      setSpreadsheetPreview({ open: true, fileName, sheet: { headers, rows }, loading: false, error: null })
    } catch (err) {
      setSpreadsheetPreview({
        open: true,
        fileName,
        sheet: null,
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to preview spreadsheet',
      })
    }
  }

  function closeSpreadsheetPreview() {
    setSpreadsheetPreview({ open: false, fileName: '', sheet: null, loading: false, error: null })
  }

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true)
        const result = await fetchProjectFiles(application)
        setData(result)
        setError(null)
      } catch (err) {
        console.error('Error fetching project files:', err)
        setError(err instanceof Error ? err.message : 'An unknown error occurred')
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [application])

  const toggleCompany = (company: string) => {
    const next = new Set(expandedCompanies)
    if (next.has(company)) next.delete(company)
    else next.add(company)
    setExpandedCompanies(next)
  }

  const toggleDay = (dayKey: string) => {
    const next = new Set(expandedDays)
    if (next.has(dayKey)) next.delete(dayKey)
    else next.add(dayKey)
    setExpandedDays(next)
  }

  if (loading) {
    return (
      <div className="dashboard-card flex flex-col items-center justify-center p-16 space-y-4">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        <p className="text-sm font-medium animate-pulse" style={{ color: 'var(--aa-content-text-muted)' }}>
          Loading project archive...
        </p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="dashboard-card p-6 flex items-start gap-4" style={{ borderColor: 'rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.06)' }}>
        <div className="p-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.15)' }}>
          <AlertCircle className="w-5 h-5 text-red-400" />
        </div>
        <div className="flex-1">
          <h3 className="font-bold mb-1 text-red-400">Retrieval Failed</h3>
          <p className="text-sm mb-4" style={{ color: 'var(--aa-content-text-muted)' }}>{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-semibold hover:bg-red-600 transition-all active:scale-95"
          >
            Retry Connection
          </button>
        </div>
      </div>
    )
  }

  if (!data || Object.keys(data).length === 0) {
    return (
      <div className="dashboard-card flex flex-col items-center justify-center p-16 text-center">
        <div className="p-4 rounded-full mb-4" style={{ background: 'var(--aa-content-bg-elevated)' }}>
          <Folder className="w-10 h-10" style={{ color: 'var(--aa-content-text-muted)' }} />
        </div>
        <h3 className="font-bold text-lg mb-1" style={{ color: 'var(--aa-content-text)' }}>No Projects Found</h3>
        <p className="text-sm" style={{ color: 'var(--aa-content-text-muted)' }}>
          No synchronized files for the <strong>{application}</strong> application.
        </p>
      </div>
    )
  }

  return (
    <div className="w-full space-y-4">
      {/* Company Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
        {Object.entries(data).map(([companyName, days]) => {
          const isExpanded = expandedCompanies.has(companyName)
          const milestoneCount = Object.keys(days).length
          const totalFiles = Object.values(days).reduce((acc, cats) =>
            acc + Object.values(cats).reduce((a, files) => a + files.length, 0), 0)

          return (
            <div key={companyName} className="dashboard-card !p-0 overflow-hidden flex flex-col" style={{ transition: 'all 0.3s ease' }}>
              {/* Card Header — clickable */}
              <button
                onClick={() => toggleCompany(companyName)}
                className="w-full flex items-center gap-4 p-5 text-left"
                style={{
                  background: isExpanded ? 'linear-gradient(135deg, rgba(59,130,246,0.18) 0%, rgba(99,102,241,0.12) 100%)' : 'transparent',
                  borderBottom: isExpanded ? '1px solid var(--aa-content-border)' : '1px solid transparent',
                  transition: 'all 0.25s ease',
                }}
              >
                {/* Icon */}
                <div
                  className="flex items-center justify-center w-12 h-12 rounded-xl flex-shrink-0"
                  style={{
                    background: isExpanded ? 'rgba(59,130,246,0.2)' : 'var(--aa-content-bg-elevated)',
                    color: isExpanded ? '#60a5fa' : 'var(--aa-content-text-muted)',
                    transition: 'all 0.25s ease',
                  }}
                >
                  {isExpanded ? <FolderOpen size={22} /> : <Building2 size={22} />}
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <p
                    className="font-bold text-sm leading-snug truncate"
                    style={{ color: isExpanded ? '#e2e8f0' : 'var(--aa-content-text)' }}
                  >
                    {companyName}
                  </p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span
                      className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
                      style={{
                        background: isExpanded ? 'rgba(59,130,246,0.2)' : 'var(--aa-content-bg-elevated)',
                        color: isExpanded ? '#93c5fd' : 'var(--aa-content-text-muted)',
                      }}
                    >
                      {milestoneCount} milestone{milestoneCount !== 1 ? 's' : ''}
                    </span>
                    <span className="text-[10px]" style={{ color: 'var(--aa-content-text-muted)' }}>
                      {totalFiles} file{totalFiles !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>

                {/* Chevron */}
                <div
                  style={{
                    color: isExpanded ? '#60a5fa' : 'var(--aa-content-text-muted)',
                    transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.3s ease, color 0.25s ease',
                  }}
                >
                  <ChevronDown size={18} />
                </div>
              </button>

              {/* Expanded: Milestones */}
              {isExpanded && (
                <div className="flex flex-col divide-y" style={{ borderColor: 'var(--aa-content-border)', animation: 'fadeSlideUp 0.25s ease both' }}>
                  {Object.entries(days).map(([day, categories]) => {
                    const dayKey = `${companyName}-${day}`
                    const isDayExpanded = expandedDays.has(dayKey)
                    const hasFiles = Object.values(categories).some(files => files.length > 0)
                    if (!hasFiles) return null

                    const dayFileCount = Object.values(categories).reduce((a, f) => a + f.length, 0)

                    return (
                      <div key={day}>
                        {/* Milestone row */}
                        <button
                          onClick={() => toggleDay(dayKey)}
                          className="w-full flex items-center justify-between px-5 py-3 text-left"
                          style={{
                            background: isDayExpanded ? 'var(--aa-content-bg-elevated)' : 'transparent',
                            transition: 'background 0.2s ease',
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <div
                              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                              style={{ background: isDayExpanded ? '#60a5fa' : 'var(--aa-content-text-muted)' }}
                            />
                            <span
                              className="text-xs font-semibold uppercase tracking-wider"
                              style={{ color: isDayExpanded ? 'var(--aa-content-text)' : 'var(--aa-content-text-muted)' }}
                            >
                              {day}
                            </span>
                            <span
                              className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                              style={{ background: 'var(--aa-content-bg-elevated)', color: 'var(--aa-content-text-muted)' }}
                            >
                              {dayFileCount}
                            </span>
                          </div>
                          <ChevronDown
                            size={14}
                            style={{
                              color: 'var(--aa-content-text-muted)',
                              transform: isDayExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                              transition: 'transform 0.25s ease',
                            }}
                          />
                        </button>

                        {/* Files grid */}
                        {isDayExpanded && (
                          <div
                            className="px-4 pb-4 pt-2 flex flex-col gap-3"
                            style={{ background: 'var(--aa-content-bg-elevated)', animation: 'fadeSlideUp 0.2s ease both' }}
                          >
                            {Object.entries(categories).map(([category, files]) => {
                              if (!files || files.length === 0) return null
                              return (
                                <div key={category}>
                                  <p
                                    className="text-[9px] font-black uppercase tracking-[0.18em] mb-2 px-1"
                                    style={{ color: 'var(--aa-content-text-muted)' }}
                                  >
                                    {category.replace(/-/g, ' ')}
                                  </p>
                                  <div className="flex flex-col gap-1.5">
                                    {files.map((file: ProjectFile, idx: number) => {
                                      const fileUrl = resolveProjectFileUrl(file.FilePath)
                                      const isOpenable = Boolean(fileUrl)
                                      const isSpreadsheet = isOpenable && isSpreadsheetFile(file.FileName)

                                      return isOpenable ? (
                                        isSpreadsheet ? (
                                          <button
                                            key={`${file.FileName}-${idx}`}
                                            type="button"
                                            onClick={() => previewSpreadsheet(fileUrl!, file.FileName)}
                                            className="flex items-center gap-3 p-2.5 rounded-lg group/file"
                                            style={{
                                              width: '100%',
                                              background: 'var(--aa-content-bg)',
                                              border: '1px solid var(--aa-content-border)',
                                              transition: 'all 0.2s ease',
                                              textDecoration: 'none',
                                              cursor: 'pointer',
                                            }}
                                            onMouseEnter={e => {
                                              const el = e.currentTarget
                                              el.style.borderColor = 'rgba(59,130,246,0.4)'
                                              el.style.background = 'rgba(59,130,246,0.06)'
                                              el.style.transform = 'translateX(2px)'
                                            }}
                                            onMouseLeave={e => {
                                              const el = e.currentTarget
                                              el.style.borderColor = 'var(--aa-content-border)'
                                              el.style.background = 'var(--aa-content-bg)'
                                              el.style.transform = 'translateX(0)'
                                            }}
                                          >
                                            <div
                                              className="flex items-center justify-center w-7 h-7 rounded-lg flex-shrink-0"
                                              style={{ background: 'rgba(59,130,246,0.1)', color: '#60a5fa' }}
                                            >
                                              <FileText size={14} />
                                            </div>
                                            <p
                                              className="text-xs font-medium flex-1 min-w-0 truncate"
                                              style={{ color: 'var(--aa-content-text)' }}
                                            >
                                              {file.FileName}
                                            </p>
                                            <span className="text-[11px] uppercase tracking-[0.16em]" style={{ color: 'var(--aa-content-text-muted)' }}>
                                              Preview
                                            </span>
                                          </button>
                                        ) : (
                                          <a
                                            key={`${file.FileName}-${idx}`}
                                            href={fileUrl!}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-3 p-2.5 rounded-lg group/file"
                                            style={{
                                              background: 'var(--aa-content-bg)',
                                              border: '1px solid var(--aa-content-border)',
                                              transition: 'all 0.2s ease',
                                              textDecoration: 'none',
                                            }}
                                            onMouseEnter={e => {
                                              const el = e.currentTarget
                                              el.style.borderColor = 'rgba(59,130,246,0.4)'
                                              el.style.background = 'rgba(59,130,246,0.06)'
                                              el.style.transform = 'translateX(2px)'
                                            }}
                                            onMouseLeave={e => {
                                              const el = e.currentTarget
                                              el.style.borderColor = 'var(--aa-content-border)'
                                              el.style.background = 'var(--aa-content-bg)'
                                              el.style.transform = 'translateX(0)'
                                            }}
                                          >
                                            <div
                                              className="flex items-center justify-center w-7 h-7 rounded-lg flex-shrink-0"
                                              style={{ background: 'rgba(59,130,246,0.1)', color: '#60a5fa' }}
                                            >
                                              <FileText size={14} />
                                            </div>
                                            <p
                                              className="text-xs font-medium flex-1 min-w-0 truncate"
                                              style={{ color: 'var(--aa-content-text)' }}
                                            >
                                              {file.FileName}
                                            </p>
                                            <ExternalLink
                                              size={12}
                                              style={{ color: 'var(--aa-content-text-muted)', flexShrink: 0 }}
                                            />
                                          </a>
                                        )
                                      ) : (
                                        <div
                                          key={`${file.FileName}-${idx}`}
                                          className="flex items-center gap-3 p-2.5 rounded-lg"
                                          style={{
                                            background: 'rgba(255,255,255,0.03)',
                                            border: '1px dashed var(--aa-content-border)',
                                            color: 'var(--aa-content-text-muted)',
                                          }}
                                        >
                                          <div
                                            className="flex items-center justify-center w-7 h-7 rounded-lg flex-shrink-0"
                                            style={{ background: 'rgba(148,163,184,0.16)', color: '#94a3b8' }}
                                          >
                                            <FileText size={14} />
                                          </div>
                                          <div className="flex-1 text-xs font-medium min-w-0 truncate">
                                            {file.FileName}
                                          </div>
                                          <span className="text-[11px] uppercase tracking-[0.16em]" style={{ color: 'var(--aa-content-text-muted)' }}>
                                            unavailable
                                          </span>
                                        </div>
                                      )
                                    })}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {spreadsheetPreview.open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Preview ${spreadsheetPreview.fileName}`}
        >
          <div
            className="w-full max-w-4xl rounded-2xl bg-[var(--aa-content-bg)] shadow-2xl overflow-hidden"
            style={{ border: '1px solid var(--aa-content-border)' }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--aa-content-border)]">
              <div>
                <div className="text-sm font-semibold text-[var(--aa-content-text)]">{spreadsheetPreview.fileName}</div>
                <div className="text-[11px] text-[var(--aa-content-text-muted)]">Spreadsheet preview</div>
              </div>
              <button
                type="button"
                onClick={closeSpreadsheetPreview}
                className="text-xs uppercase tracking-[0.22em] text-[var(--aa-content-text-muted)] hover:text-[var(--aa-content-text)]"
              >
                Close
              </button>
            </div>
            <div className="p-4 max-h-[80vh] overflow-auto">
              {spreadsheetPreview.loading ? (
                <div className="text-sm text-[var(--aa-content-text-muted)]">Loading spreadsheet preview…</div>
              ) : spreadsheetPreview.error ? (
                <div className="text-sm text-[var(--aa-content-text-muted)]">{spreadsheetPreview.error}</div>
              ) : spreadsheetPreview.sheet ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full border-collapse" style={{ borderSpacing: 0 }}>
                    <thead>
                      <tr>
                        {spreadsheetPreview.sheet.headers.map((header, idx) => (
                          <th
                            key={`h-${idx}`}
                            className="whitespace-nowrap border border-[var(--aa-content-border)] bg-[var(--aa-content-bg-elevated)] px-3 py-2 text-left text-[11px] uppercase text-[var(--aa-content-text-muted)]"
                          >
                            {header || `Column ${idx + 1}`}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {spreadsheetPreview.sheet.rows.map((row, rowIndex) => (
                        <tr key={`r-${rowIndex}`}>
                          {row.map((cell, cellIndex) => (
                            <td
                              key={`c-${rowIndex}-${cellIndex}`}
                              className="border border-[var(--aa-content-border)] px-3 py-2 text-[12px] text-[var(--aa-content-text)]"
                            >
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-sm text-[var(--aa-content-text-muted)]">Spreadsheet preview not available.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
