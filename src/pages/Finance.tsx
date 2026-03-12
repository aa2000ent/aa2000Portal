import { useEffect } from 'react'
import { useActivityLog } from '../contexts/ActivityLogContext'

export default function Finance() {
  const { addEntry } = useActivityLog()
  useEffect(() => {
    addEntry({ action: 'page_visited', actor: 'Finance', target: 'Finance dashboard', details: 'Viewed Finance dashboard' })
  }, [addEntry])

  return (
    <div className="dashboard-page">
      <header className="dashboard-page-header">
        <h1 className="dashboard-page-title">Finance</h1>
        <p className="dashboard-page-subtitle">Manage financial data and reports</p>
      </header>
      <div className="dashboard-page-content">
        <div className="dashboard-placeholder dashboard-placeholder--page">
          Content will appear here.
        </div>
      </div>
    </div>
  )
}
