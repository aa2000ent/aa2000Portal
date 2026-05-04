import React, { useEffect, useState } from 'react'
import { Folder, FolderOpen, FileText, Loader2, AlertCircle, ExternalLink, Building2, X, Download, ChevronRight, ArrowLeft } from 'lucide-react'
import { readSheet } from 'read-excel-file/browser'
import { fetchProjectFiles } from '../api/projects'
import type { ProjectFileData, ProjectFile } from '../api/projectTypes'

interface FileManagerProps {
  application?: string
}

interface SpreadsheetPreview {
  open: boolean
  fileName: string
  fileUrl: string
  sheet: { headers: string[]; rows: string[][] } | null
  loading: boolean
  error: string | null
}

interface FileViewer {
  open: boolean
  fileName: string
  fileUrl: string
}

type DrillLevel = 'companies' | 'days' | 'files'

function resolveProjectFileUrl(rawPath: string | null | undefined, application: string): string | null {
  const filePath = String(rawPath ?? '').trim()
  if (!filePath) return null
  const filename = filePath.replace(/\\/g, '/').split('/').pop()
  if (!filename) return null
  const base = String(import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
  if (!base) return null
  return `${base}/project/file/${encodeURIComponent(application)}/${encodeURIComponent(filename)}`
}

export const FileManager: React.FC<FileManagerProps> = ({ application = 'TECHNCODE' }) => {
  const [data, setData] = useState<ProjectFileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Drill-down state
  const [level, setLevel] = useState<DrillLevel>('companies')
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  const [spreadsheetPreview, setSpreadsheetPreview] = useState<SpreadsheetPreview>({
    open: false, fileName: '', fileUrl: '', sheet: null, loading: false, error: null,
  })
  const [fileViewer, setFileViewer] = useState<FileViewer>({ open: false, fileName: '', fileUrl: '' })

  useEffect(() => {
    fetchProjectFiles(application)
      .then(result => { setData(result); setError(null) })
      .catch(err => setError(err instanceof Error ? err.message : 'Unknown error'))
      .finally(() => setLoading(false))
  }, [application])

  function isSpreadsheetFile(fileName: string, filePath?: string) {
    return /\.(xlsx|xls|csv)$/i.test(fileName) || /\.(xlsx|xls|csv)$/i.test(filePath ?? '')
  }

  async function openFile(fileUrl: string, fileName: string, filePath: string) {
    if (isSpreadsheetFile(fileName, filePath)) {
      setSpreadsheetPreview({ open: true, fileName, fileUrl, sheet: null, loading: true, error: null })
      try {
        const response = await fetch(fileUrl, { credentials: 'include' })
        if (!response.ok) throw new Error(`Unable to load file: ${response.status} ${response.statusText}`)
        const buffer = await response.arrayBuffer()
        const matrix = await readSheet(buffer)
        if (!Array.isArray(matrix) || matrix.length === 0) throw new Error('Spreadsheet contains no rows')
        const rowsAsStrings = matrix.map(row => Array.isArray(row) ? row.map(cell => String(cell ?? '')) : [])
        const headers = rowsAsStrings[0] ?? []
        const rows = rowsAsStrings.slice(1, 201)
        setSpreadsheetPreview({ open: true, fileName, fileUrl, sheet: { headers, rows }, loading: false, error: null })
      } catch (err) {
        setSpreadsheetPreview({ open: true, fileName, fileUrl, sheet: null, loading: false, error: err instanceof Error ? err.message : 'Failed to load file' })
      }
    } else {
      setFileViewer({ open: true, fileName, fileUrl })
    }
  }

  function closeSpreadsheetPreview() {
    setSpreadsheetPreview({ open: false, fileName: '', fileUrl: '', sheet: null, loading: false, error: null })
  }

  function closeFileViewer() {
    setFileViewer({ open: false, fileName: '', fileUrl: '' })
  }

  function goToCompanies() {
    setLevel('companies')
    setSelectedCompany(null)
    setSelectedDay(null)
  }

  function goToDays(company: string) {
    setSelectedCompany(company)
    setSelectedDay(null)
    setLevel('days')
  }

  function goToFiles(day: string) {
    setSelectedDay(day)
    setLevel('files')
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
          <button onClick={() => window.location.reload()} className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-semibold hover:bg-red-600 transition-all active:scale-95">
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

  // ── Breadcrumb ───────────────────────────────────────────────────────────────
  const Breadcrumb = () => (
    <div className="flex items-center gap-1.5 mb-5 flex-wrap">
      <button
        onClick={goToCompanies}
        className="text-xs font-semibold uppercase tracking-wider transition-colors bg-transparent border-0 p-0 cursor-pointer"
        style={{ color: level === 'companies' ? 'var(--aa-content-text)' : '#60a5fa' }}
      >
        Companies
      </button>
      {selectedCompany && (
        <>
          <ChevronRight size={13} style={{ color: 'var(--aa-content-text-muted)' }} />
          <button
            onClick={() => { setLevel('days'); setSelectedDay(null) }}
            className="text-xs font-semibold uppercase tracking-wider transition-colors truncate max-w-[200px] bg-transparent border-0 p-0 cursor-pointer"
            style={{ color: level === 'days' ? 'var(--aa-content-text)' : '#60a5fa' }}
          >
            {selectedCompany}
          </button>
        </>
      )}
      {selectedDay && (
        <>
          <ChevronRight size={13} style={{ color: 'var(--aa-content-text-muted)' }} />
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--aa-content-text)' }}>
            {selectedDay}
          </span>
        </>
      )}
    </div>
  )

  // ── Level 1: Companies ───────────────────────────────────────────────────────
  if (level === 'companies') {
    return (
      <div className="w-full">
        <Breadcrumb />
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Object.entries(data).map(([companyName, days]) => {
            const milestoneCount = Object.keys(days).length
            const totalFiles = Object.values(days).reduce((acc, cats) =>
              acc + Object.values(cats).reduce((a, files) => a + files.length, 0), 0)

            return (
              <button
                key={companyName}
                type="button"
                onClick={() => goToDays(companyName)}
                className="dashboard-card !p-5 flex items-center gap-4 text-left w-full group"
                style={{ transition: 'all 0.2s ease', cursor: 'pointer' }}
                onMouseEnter={e => {
                  const el = e.currentTarget
                  el.style.borderColor = 'rgba(59,130,246,0.4)'
                  el.style.background = 'rgba(59,130,246,0.06)'
                  el.style.transform = 'translateY(-2px)'
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget
                  el.style.borderColor = ''
                  el.style.background = ''
                  el.style.transform = 'translateY(0)'
                }}
              >
                <div
                  className="flex items-center justify-center w-12 h-12 rounded-xl flex-shrink-0"
                  style={{ background: 'var(--aa-content-bg-elevated)', color: 'var(--aa-content-text-muted)', transition: 'all 0.2s ease' }}
                >
                  <Building2 size={22} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm leading-snug truncate" style={{ color: 'var(--aa-content-text)' }}>
                    {companyName}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full" style={{ background: 'var(--aa-content-bg-elevated)', color: 'var(--aa-content-text-muted)' }}>
                      {milestoneCount} milestone{milestoneCount !== 1 ? 's' : ''}
                    </span>
                    <span className="text-[10px]" style={{ color: 'var(--aa-content-text-muted)' }}>
                      {totalFiles} file{totalFiles !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
                <ChevronRight size={16} style={{ color: 'var(--aa-content-text-muted)', flexShrink: 0 }} />
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Level 2: Days ────────────────────────────────────────────────────────────
  if (level === 'days' && selectedCompany) {
    const days = data[selectedCompany] ?? {}

    return (
      <div className="w-full">
        <Breadcrumb />
        <button
          type="button"
          onClick={goToCompanies}
          className="flex items-center gap-1.5 mb-5 text-xs font-semibold uppercase tracking-wider transition-colors bg-transparent border-0 p-0 cursor-pointer"
          style={{ color: '#60a5fa' }}
        >
          <ArrowLeft size={13} /> Back
        </button>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Object.entries(days).map(([day, categories]) => {
            const fileCount = Object.values(categories).reduce((a, files) => a + files.length, 0)
            if (fileCount === 0) return null
            const catCount = Object.values(categories).filter(f => f.length > 0).length

            return (
              <button
                key={day}
                type="button"
                onClick={() => goToFiles(day)}
                className="dashboard-card !p-5 flex items-center gap-4 text-left w-full"
                style={{ transition: 'all 0.2s ease', cursor: 'pointer' }}
                onMouseEnter={e => {
                  const el = e.currentTarget
                  el.style.borderColor = 'rgba(59,130,246,0.4)'
                  el.style.background = 'rgba(59,130,246,0.06)'
                  el.style.transform = 'translateY(-2px)'
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget
                  el.style.borderColor = ''
                  el.style.background = ''
                  el.style.transform = 'translateY(0)'
                }}
              >
                <div
                  className="flex items-center justify-center w-12 h-12 rounded-xl flex-shrink-0"
                  style={{ background: 'rgba(59,130,246,0.1)', color: '#60a5fa' }}
                >
                  <FolderOpen size={22} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm uppercase tracking-wide" style={{ color: 'var(--aa-content-text)' }}>
                    {day}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full" style={{ background: 'var(--aa-content-bg-elevated)', color: 'var(--aa-content-text-muted)' }}>
                      {catCount} categor{catCount !== 1 ? 'ies' : 'y'}
                    </span>
                    <span className="text-[10px]" style={{ color: 'var(--aa-content-text-muted)' }}>
                      {fileCount} file{fileCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
                <ChevronRight size={16} style={{ color: 'var(--aa-content-text-muted)', flexShrink: 0 }} />
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Level 3: Files ───────────────────────────────────────────────────────────
  if (level === 'files' && selectedCompany && selectedDay) {
    const categories = data[selectedCompany]?.[selectedDay] ?? {}

    return (
      <div className="w-full">
        <Breadcrumb />
        <button
          type="button"
          onClick={() => { setLevel('days'); setSelectedDay(null) }}
          className="flex items-center gap-1.5 mb-5 text-xs font-semibold uppercase tracking-wider bg-transparent border-0 p-0 cursor-pointer"
          style={{ color: '#60a5fa' }}
        >
          <ArrowLeft size={13} /> Back
        </button>

        <div className="flex flex-col gap-4">
          {Object.entries(categories).map(([category, files]) => {
            if (!files || files.length === 0) return null
            return (
              <div key={category} className="dashboard-card !p-0 overflow-hidden">
                {/* Category header */}
                <div
                  className="flex items-center gap-3 px-5 py-3 border-b"
                  style={{ borderColor: 'var(--aa-content-border)', background: 'var(--aa-content-bg-elevated)' }}
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                  <span className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: 'var(--aa-content-text-muted)' }}>
                    {category.replace(/-/g, ' ')}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium ml-auto" style={{ background: 'var(--aa-content-bg)', color: 'var(--aa-content-text-muted)', border: '1px solid var(--aa-content-border)' }}>
                    {files.length} file{files.length !== 1 ? 's' : ''}
                  </span>
                </div>

                {/* File list */}
                <div className="flex flex-col divide-y" style={{ borderColor: 'var(--aa-content-border)' }}>
                  {files.map((file: ProjectFile, idx: number) => {
                    const fileUrl = resolveProjectFileUrl(file.FilePath, application)
                    // Use existsOnDisk from backend if available, otherwise fall back to URL resolution
                    const isOpenable = file.existsOnDisk !== undefined ? file.existsOnDisk : Boolean(fileUrl)
                    const displayName = file.customDownloadName || file.FileName
                    const isDir = file.isDirectory ?? false

                    return isOpenable ? (
                      <button
                        key={`${file.FileName}-${idx}`}
                        type="button"
                        onClick={() => openFile(fileUrl!, displayName, file.FilePath ?? '')}
                        className="flex items-center gap-4 px-5 py-3.5 text-left w-full border-0 cursor-pointer"
                        style={{ background: 'transparent', transition: 'background 0.15s ease' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(59,130,246,0.06)' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                      >
                        <div
                          className="flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0"
                          style={{ background: isDir ? 'rgba(234,179,8,0.1)' : 'rgba(59,130,246,0.1)', color: isDir ? '#eab308' : '#60a5fa' }}
                        >
                          {isDir ? <Folder size={15} /> : <FileText size={15} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate" style={{ color: 'var(--aa-content-text)' }}>
                            {displayName}
                          </p>
                          {isDir && (
                            <p className="text-[10px] mt-0.5" style={{ color: 'var(--aa-content-text-muted)' }}>Folder · downloads as ZIP</p>
                          )}
                        </div>
                        <span className="text-[11px] uppercase tracking-[0.16em] flex-shrink-0" style={{ color: '#60a5fa' }}>
                          {isDir ? 'Download' : 'Open'}
                        </span>
                      </button>
                    ) : (
                      <div
                        key={`${file.FileName}-${idx}`}
                        className="flex items-center gap-4 px-5 py-3.5"
                      >
                        <div
                          className="flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0"
                          style={{ background: 'rgba(148,163,184,0.1)', color: '#94a3b8' }}
                        >
                          <FileText size={15} />
                        </div>
                        <p className="text-sm font-medium flex-1 min-w-0 truncate" style={{ color: 'var(--aa-content-text-muted)' }}>
                          {file.customDownloadName || file.FileName}
                        </p>
                        <span className="text-[11px] uppercase tracking-[0.16em] flex-shrink-0" style={{ color: 'var(--aa-content-text-muted)' }}>
                          Unavailable
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {/* Excel / CSV viewer modal */}
        {spreadsheetPreview.open && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
            role="dialog"
            aria-modal="true"
            onClick={e => { if (e.target === e.currentTarget) closeSpreadsheetPreview() }}
          >
            <div
              className="w-full max-w-5xl flex flex-col rounded-2xl shadow-2xl overflow-hidden"
              style={{ background: 'var(--aa-content-bg)', border: '1px solid var(--aa-content-border)', maxHeight: '90vh' }}
            >
              <div className="flex items-center gap-3 px-5 py-4 border-b flex-shrink-0" style={{ borderColor: 'var(--aa-content-border)' }}>
                <div className="flex items-center justify-center w-9 h-9 rounded-xl flex-shrink-0" style={{ background: 'rgba(34,197,94,0.12)', color: '#4ade80' }}>
                  <FileText size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--aa-content-text)' }}>{spreadsheetPreview.fileName}</p>
                  <p className="text-[11px]" style={{ color: 'var(--aa-content-text-muted)' }}>
                    {spreadsheetPreview.sheet ? `${spreadsheetPreview.sheet.rows.length} rows · ${spreadsheetPreview.sheet.headers.length} columns` : 'Spreadsheet viewer'}
                  </p>
                </div>
                <a
                  href={spreadsheetPreview.fileUrl}
                  download
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium mr-2"
                  style={{ background: 'var(--aa-content-bg-elevated)', color: 'var(--aa-content-text-muted)', border: '1px solid var(--aa-content-border)' }}
                >
                  <Download size={13} /> Download
                </a>
                <button
                  type="button"
                  onClick={closeSpreadsheetPreview}
                  className="flex items-center justify-center w-8 h-8 rounded-lg"
                  style={{ background: 'var(--aa-content-bg-elevated)', color: 'var(--aa-content-text-muted)' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--aa-content-text)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--aa-content-text-muted)' }}
                >
                  <X size={16} />
                </button>
              </div>

              <div className="flex-1 overflow-auto p-4" style={{ minHeight: 0 }}>
                {spreadsheetPreview.loading ? (
                  <div className="flex flex-col items-center justify-center h-48 gap-3">
                    <Loader2 className="w-7 h-7 animate-spin text-blue-400" />
                    <p className="text-sm" style={{ color: 'var(--aa-content-text-muted)' }}>Loading spreadsheet…</p>
                  </div>
                ) : spreadsheetPreview.error ? (
                  <div className="flex flex-col items-center justify-center h-48 gap-3">
                    <AlertCircle className="w-7 h-7 text-red-400" />
                    <p className="text-sm text-red-400">{spreadsheetPreview.error}</p>
                  </div>
                ) : spreadsheetPreview.sheet ? (
                  <table className="min-w-full border-collapse text-[12px]" style={{ borderSpacing: 0 }}>
                    <thead>
                      <tr>
                        <th className="sticky top-0 px-3 py-2 text-center text-[10px] font-bold uppercase tracking-widest select-none" style={{ background: 'var(--aa-content-bg-elevated)', color: 'var(--aa-content-text-muted)', border: '1px solid var(--aa-content-border)', minWidth: 40 }}>#</th>
                        {spreadsheetPreview.sheet.headers.map((header, idx) => (
                          <th key={`h-${idx}`} className="sticky top-0 whitespace-nowrap px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider" style={{ background: 'var(--aa-content-bg-elevated)', color: 'var(--aa-content-text-muted)', border: '1px solid var(--aa-content-border)', minWidth: 100 }}>
                            {header || `Col ${idx + 1}`}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {spreadsheetPreview.sheet.rows.map((row, rowIndex) => (
                        <tr
                          key={`r-${rowIndex}`}
                          style={{ background: rowIndex % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(59,130,246,0.06)' }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = rowIndex % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}
                        >
                          <td className="px-3 py-1.5 text-center text-[10px] select-none" style={{ color: 'var(--aa-content-text-muted)', border: '1px solid var(--aa-content-border)' }}>{rowIndex + 1}</td>
                          {spreadsheetPreview.sheet?.headers.map((_, cellIndex) => (
                            <td key={`c-${rowIndex}-${cellIndex}`} className="px-3 py-1.5 whitespace-nowrap" style={{ color: 'var(--aa-content-text)', border: '1px solid var(--aa-content-border)' }}>
                              {row[cellIndex] ?? ''}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="flex items-center justify-center h-48 text-sm" style={{ color: 'var(--aa-content-text-muted)' }}>No data found.</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Generic file viewer modal */}
        {fileViewer.open && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
            role="dialog"
            aria-modal="true"
            onClick={e => { if (e.target === e.currentTarget) closeFileViewer() }}
          >
            <div
              className="w-full max-w-5xl flex flex-col rounded-2xl shadow-2xl overflow-hidden"
              style={{ background: 'var(--aa-content-bg)', border: '1px solid var(--aa-content-border)', height: '90vh' }}
            >
              <div className="flex items-center gap-3 px-5 py-4 border-b flex-shrink-0" style={{ borderColor: 'var(--aa-content-border)' }}>
                <div className="flex items-center justify-center w-9 h-9 rounded-xl flex-shrink-0" style={{ background: 'rgba(59,130,246,0.12)', color: '#60a5fa' }}>
                  <FileText size={18} />
                </div>
                <p className="text-sm font-semibold flex-1 min-w-0 truncate" style={{ color: 'var(--aa-content-text)' }}>{fileViewer.fileName}</p>
                <a href={fileViewer.fileUrl} download className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium mr-2" style={{ background: 'var(--aa-content-bg-elevated)', color: 'var(--aa-content-text-muted)', border: '1px solid var(--aa-content-border)' }}>
                  <Download size={13} /> Download
                </a>
                <a href={fileViewer.fileUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium mr-2" style={{ background: 'var(--aa-content-bg-elevated)', color: 'var(--aa-content-text-muted)', border: '1px solid var(--aa-content-border)' }}>
                  <ExternalLink size={13} /> New tab
                </a>
                <button
                  type="button"
                  onClick={closeFileViewer}
                  className="flex items-center justify-center w-8 h-8 rounded-lg"
                  style={{ background: 'var(--aa-content-bg-elevated)', color: 'var(--aa-content-text-muted)' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--aa-content-text)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--aa-content-text-muted)' }}
                >
                  <X size={16} />
                </button>
              </div>
              <iframe src={fileViewer.fileUrl} className="flex-1 w-full border-0" title={fileViewer.fileName} />
            </div>
          </div>
        )}
      </div>
    )
  }

  return null
}
