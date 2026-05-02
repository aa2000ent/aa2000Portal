import { visibleToIncludesDepartment } from '../api/applications'
import type { App } from '../contexts/ApplicationsContext'

const SEGMENT_ALIASES: Record<string, string[]> = {
  marketing: ['Marketing', 'Brand', 'Promo'],
  sale: ['Sale', 'Sales'],
  purchasing: ['Purchasing'],
  customer: ['Customer'],
  supplier: ['Supplier'],
  operations: ['Operations', 'Operation'],
  finance: ['Finance', 'Treasury', 'Bookkeeping', 'Bookkeeper'],
  financial: ['Financial'],
  accounting: ['Accounting', 'Accountant'],
  engineering: ['Engineering', 'Engineer'],
  technical: ['Technical', 'IT', 'Technician', 'Developer', 'Software'],
  ceo: ['CEO', 'Chief Executive', 'Managing Director'],
  'co-ceo': ['CO_CEO', 'CO-CEO', 'CO CEO', 'COO', 'Chief Operating'],
  'general-manager': [
    'General Manager',
    'GM',
    'Vice President',
    'VP',
  ],
  admin: ['Admin', 'Administrator', 'HR', 'Human Resource', 'Supervisor', 'Director', 'Owner', 'Executive'],
}

function pathToSegment(pathname: string): string {
  return pathname.replace(/^\//, '').split('/')[0] || ''
}

function titleFromSegment(segment: string): string {
  return segment
    .split('-')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : ''))
    .join(' ')
}

export function roleLabelsForPortalPath(pathname: string): string[] {
  const segment = pathToSegment(pathname)
  if (!segment) return []
  const mapped = SEGMENT_ALIASES[segment]
  if (mapped?.length) return mapped
  return [titleFromSegment(segment)]
}

export function appVisibleToPortalPath(app: App, pathname: string): boolean {
  const labels = roleLabelsForPortalPath(pathname).map((s) => s.trim()).filter(Boolean)
  if (labels.length === 0) return false
  return labels.some((label) => visibleToIncludesDepartment(app.visibleTo, label))
}

