import { useEffect } from 'react'
import { useActivityLog } from '../contexts/ActivityLogContext'

export default function Marketing() {
  const { addEntry } = useActivityLog()
  useEffect(() => {
    addEntry({ action: 'page_visited', actor: 'Marketing', target: 'Marketing dashboard', details: 'Viewed Marketing dashboard' })
  }, [addEntry])

  return (
    <div className="dashboard-page">
      <header className="dashboard-page-header">
        <h1 className="dashboard-page-title">Marketing</h1>
        <p className="dashboard-page-subtitle">Manage marketing content and campaigns</p>
      </header>
      <div className="dashboard-page-content">
        <div className="dashboard-placeholder dashboard-placeholder--page">
          Content will appear here.
        </div>
      </div>
    </div>
  )
}
