import { apiRequest } from './client'
import type { ProjectFileData, ProjectFileResponse } from './projectTypes'

export interface ProjectItem {
  id: number
  name: string
  description: string
  status: string
  application: string
  employeeID: string
  startDate: string
  updatedAt: string
}

type RawProject = Record<string, unknown>
const DB_APPLICATIONS = ['QUOTATION', 'BOQ', 'ESTIMATION', 'TECHNCODE', 'RDIS'] as const
type DbApplication = (typeof DB_APPLICATIONS)[number]

function pickText(...vals: unknown[]): string {
  for (const v of vals) {
    const s = String(v ?? '').trim()
    if (s) return s
  }
  return ''
}

function mapProject(row: RawProject): ProjectItem {
  return {
    id: Number(row.Proj_ID ?? row.projId ?? row.proj_ID ?? row.projectID ?? row.id ?? 0),
    name: pickText(row.application, row.app_name, row.projectName, row.proj_name, row.name, 'PROJECT'),
    description: pickText(row.Status, row.status, row.proj_status, row.projectStatus, 'UNKNOWN').toUpperCase(),
    status: pickText(row.Status, row.status, row.proj_status, row.projectStatus, 'UNKNOWN').toUpperCase(),
    application: pickText(row.application, row.app_name),
    employeeID: pickText(row.Account_ID, row.employeeID, row.employeeId, row.emp_ID),
    startDate: pickText(row.Start_date, row.startDate, row.createdAt, row.created_at),
    updatedAt: pickText(row.updatedAt, row.updated_at, row.modifiedAt, row.activityDate, row.endDate),
  }
}

function extractProjectList(data: unknown): RawProject[] {
  if (Array.isArray(data)) return data.filter((x): x is RawProject => !!x && typeof x === 'object')
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>
    const payload = Array.isArray(d.data) ? d.data : Array.isArray(d.projects) ? d.projects : null
    if (payload) return payload.filter((x): x is RawProject => !!x && typeof x === 'object')
  }
  return []
}

export async function fetchProjectsForDashboard(
  application: string,
  employeeID: string
): Promise<ProjectItem[]> {
  const appFromSegment = resolveDbApplications(application)
  let lastErr: unknown = null
  for (const app of appFromSegment) {
    try {
      const data = await apiRequest<unknown>(
        `/project/get/projects/${encodeURIComponent(app)}/${encodeURIComponent(employeeID)}`
      )
      const mapped = extractProjectList(data).map(mapProject)
      if (mapped.length > 0) return mapped
    } catch (e) {
      lastErr = e
      const msg = e instanceof Error ? e.message : ''
      if (msg.includes('404')) continue
      throw e
    }
  }
  if (lastErr instanceof Error && !lastErr.message.includes('404')) throw lastErr
  return []
}

function resolveDbApplications(segment: string): DbApplication[] {
  const key = String(segment || '').trim().toLowerCase()
  if (!key) return [...DB_APPLICATIONS]
  const exact = key.toUpperCase() as DbApplication
  if (DB_APPLICATIONS.includes(exact)) return [exact]

  const map: Record<string, DbApplication[]> = {
    sale: ['QUOTATION'],
    marketing: ['QUOTATION'],
    purchasing: ['BOQ'],
    engineering: ['ESTIMATION'],
    technical: ['TECHNCODE'],
    operations: ['RDIS'],
    finance: ['RDIS'],
    financial: ['RDIS'],
    accounting: ['RDIS'],
    customer: ['QUOTATION'],
    supplier: ['BOQ'],
    ceo: ['QUOTATION', 'BOQ', 'ESTIMATION', 'TECHNCODE', 'RDIS'],
    'co-ceo': ['QUOTATION', 'BOQ', 'ESTIMATION', 'TECHNCODE', 'RDIS'],
    'general-manager': ['QUOTATION', 'BOQ', 'ESTIMATION', 'TECHNCODE', 'RDIS'],
    admin: ['QUOTATION', 'BOQ', 'ESTIMATION', 'TECHNCODE', 'RDIS'],
  }
  return map[key] ?? [...DB_APPLICATIONS]
}


export async function fetchProjectFiles(application: string): Promise<ProjectFileData> {
  const data = await apiRequest<ProjectFileResponse>(
    `/project/get/project-file/${encodeURIComponent(application)}`
  )
  if (!data.success) {
    throw new Error('Failed to fetch project files')
  }
  return data.data
}

