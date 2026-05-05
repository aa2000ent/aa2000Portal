import React, { useEffect, useState } from 'react'
import { Folder, FolderOpen, FileText, Loader2, AlertCircle, ExternalLink, Building2, X, Download, ChevronRight, ArrowLeft, Search, Calendar, FilterX } from 'lucide-react'
import { useSidebar } from '../contexts/SidebarContext'
// import * as XLSX from 'xlsx' -- no longer needed for preview, using Office Viewer iframe instead
import { fetchProjectFiles } from '../api/projects'
import type { ProjectFileData, ProjectFile } from '../api/projectTypes'

interface FileManagerProps {
  application?: string
}

interface SpreadsheetPreview {
  open: boolean
  fileName: string
  fileUrl: string
  loading: boolean
  error: string | null
}

interface FileViewer {
  open: boolean
  fileName: string
  fileUrl: string
}

type DrillLevel = 'companies' | 'days' | 'files'

function resolveProjectFileUrl(projId: number | string | undefined, fileName: string): string | null {
  if (!projId || !fileName) return null
  const base = String(import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
  if (!base) return null
  return `${base}/service/techncode/get/download-file/${encodeURIComponent(projId)}/${encodeURIComponent(fileName)}`
}

function normalizeDate(dateStr: string): string {
  try {
    // Handle formats like "MAY-05-2026" or ISO
    const clean = dateStr.replace(/-/g, ' ')
    const d = new Date(clean)
    if (isNaN(d.getTime())) return ''
    return d.toISOString().split('T')[0]
  } catch {
    return ''
  }
}

export const FileManager: React.FC<FileManagerProps> = ({ application = 'TECHNCODE' }) => {
  const { isOpen: isSidebarOpen, isCollapsed } = useSidebar()
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    setIsMobile(mq.matches)
    const fn = () => setIsMobile(mq.matches)
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [])

  const [data, setData] = useState<ProjectFileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Drill-down state
  const [level, setLevel] = useState<DrillLevel>('companies')
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  // Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [dateFilter, setDateFilter] = useState('')

  const [spreadsheetPreview, setSpreadsheetPreview] = useState<SpreadsheetPreview>({
    open: false, fileName: '', fileUrl: '', loading: false, error: null,
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
      // Use Microsoft Office Online viewer for spreadsheets to preserve layout
      setSpreadsheetPreview({ open: true, fileName, fileUrl, loading: false, error: null })
    } else {
      setFileViewer({ open: true, fileName, fileUrl })
    }
  }

  function closeSpreadsheetPreview() {
    setSpreadsheetPreview({ open: false, fileName: '', fileUrl: '', loading: false, error: null })
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
    <div className="flex flex-col gap-4 mb-6">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search files, companies, or dates..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 bg-white/50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            style={{ 
              background: 'var(--aa-content-bg-elevated)', 
              borderColor: 'var(--aa-content-border)',
              color: 'var(--aa-content-text)'
            }}
          />
        </div>
        <div className="relative min-w-[160px]">
          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 bg-white/50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            style={{ 
              background: 'var(--aa-content-bg-elevated)', 
              borderColor: 'var(--aa-content-border)',
              color: 'var(--aa-content-text)'
            }}
          />
        </div>
        {(searchTerm || dateFilter) && (
          <button
            onClick={() => { setSearchTerm(''); setDateFilter('') }}
            className="p-2 rounded-xl hover:bg-red-50 text-red-400 transition-colors"
            title="Clear filters"
          >
            <FilterX size={20} />
          </button>
        )}
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
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
    </div>
  )

  // ── Level 1: Companies ───────────────────────────────────────────────────────
  if (level === 'companies') {
    const filteredCompanies = Object.entries(data).filter(([companyName, days]) => {
      const matchesSearch = companyName.toLowerCase().includes(searchTerm.toLowerCase())
      if (matchesSearch && !dateFilter) return true

      // If no match on name or dateFilter is set, check nested days/files
      return Object.entries(days).some(([day, categories]) => {
        const matchesDate = !dateFilter || normalizeDate(day) === dateFilter
        const matchesDaySearch = day.toLowerCase().includes(searchTerm.toLowerCase())
        
        if (matchesDate && (matchesDaySearch || matchesSearch)) return true
        
        // Check files
        return Object.values(categories).some(files => 
          files.some(f => f.FileName.toLowerCase().includes(searchTerm.toLowerCase()))
        )
      })
    })

    return (
      <div className="w-full">
        <Breadcrumb />
        {filteredCompanies.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredCompanies.map(([companyName, days]) => {
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
        ) : (
          <div className="flex flex-col items-center justify-center p-12 text-center dashboard-card">
            <Search size={40} className="text-slate-300 mb-3" />
            <p className="text-sm font-medium" style={{ color: 'var(--aa-content-text)' }}>No companies found matching your filters</p>
            <p className="text-xs mt-1" style={{ color: 'var(--aa-content-text-muted)' }}>Try adjusting your search or date</p>
          </div>
        )}
      </div>
    )
  }

  // ── Level 2: Days ────────────────────────────────────────────────────────────
  if (level === 'days' && selectedCompany) {
    const days = data[selectedCompany] ?? {}
    const filteredDays = Object.entries(days).filter(([day, categories]) => {
      const matchesDate = !dateFilter || normalizeDate(day) === dateFilter
      const matchesSearch = day.toLowerCase().includes(searchTerm.toLowerCase())
      
      if (matchesDate && matchesSearch) return true
      if (!matchesDate) return false

      // Check files if date matches but search doesn't
      return Object.values(categories).some(files => 
        files.some(f => f.FileName.toLowerCase().includes(searchTerm.toLowerCase()))
      )
    })

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

        {filteredDays.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredDays.map(([day, categories]) => {
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
        ) : (
          <div className="flex flex-col items-center justify-center p-12 text-center dashboard-card">
            <Search size={40} className="text-slate-300 mb-3" />
            <p className="text-sm font-medium" style={{ color: 'var(--aa-content-text)' }}>No milestones found for this date/search</p>
            <p className="text-xs mt-1" style={{ color: 'var(--aa-content-text-muted)' }}>Try adjusting your filters or go back to companies</p>
          </div>
        )}
      </div>
    )
  }

  // ── Level 3: Files ───────────────────────────────────────────────────────────
  if (level === 'files' && selectedCompany && selectedDay) {
    const categories = data[selectedCompany]?.[selectedDay] ?? {}
    
    // Filter categories that have files matching the search term
    const filteredCategories = Object.entries(categories).map(([category, files]) => {
      const filteredFiles = files.filter(f => f.FileName.toLowerCase().includes(searchTerm.toLowerCase()))
      return [category, filteredFiles] as [string, ProjectFile[]]
    }).filter(([_, files]) => files.length > 0)

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

        {filteredCategories.length > 0 ? (
          <div className="flex flex-col gap-4">
            {filteredCategories.map(([category, files]) => {
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
                      const fileUrl = resolveProjectFileUrl(file.Proj_ID, file.FileName)
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
            className="fixed bottom-0 right-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 transition-[left] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
            style={{ 
              top: 'var(--dashboard-header-h)',
              left: !isMobile ? (isSidebarOpen ? (isCollapsed ? 76 : 240) : 0) : 0 
            }}
            role="dialog"
            aria-modal="true"
            onClick={e => { if (e.target === e.currentTarget) closeSpreadsheetPreview() }}
          >
            <div
              className="w-full max-w-5xl flex flex-col rounded-2xl shadow-2xl overflow-hidden"
              style={{ background: 'var(--aa-content-bg)', border: '1px solid var(--aa-content-border)', height: '90vh' }}
            >
              <div className="flex items-center gap-3 px-5 py-4 border-b flex-shrink-0" style={{ borderColor: 'var(--aa-content-border)' }}>
                <div className="flex items-center justify-center w-9 h-9 rounded-xl flex-shrink-0" style={{ background: 'rgba(34,197,94,0.12)', color: '#4ade80' }}>
                  <FileText size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--aa-content-text)' }}>{spreadsheetPreview.fileName}</p>
                  <p className="text-[11px]" style={{ color: 'var(--aa-content-text-muted)' }}>
                    Spreadsheet viewer
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

              <div className="flex-1 overflow-hidden" style={{ minHeight: 0 }}>
                {spreadsheetPreview.error ? (
                  <div className="flex flex-col items-center justify-center h-full gap-3 p-12" style={{ background: 'var(--aa-content-bg)' }}>
                    <AlertCircle className="w-7 h-7 text-red-400" />
                    <p className="text-sm text-red-400">{spreadsheetPreview.error}</p>
                  </div>
                ) : (
                  <iframe
                    src={`https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(spreadsheetPreview.fileUrl)}`}
                    className="w-full h-full border-0 bg-white"
                    title={spreadsheetPreview.fileName}
                  />
                )}
              </div>
            </div>
          </div>
        )}

        {/* Generic file viewer modal */}
        {fileViewer.open && (
          <div
            className="fixed bottom-0 right-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 transition-[left] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
            style={{ 
              top: 'var(--dashboard-header-h)',
              left: !isMobile ? (isSidebarOpen ? (isCollapsed ? 76 : 240) : 0) : 0 
            }}
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
