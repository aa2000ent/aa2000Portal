export default function PortalMemo() {
  return (
    <div className="dashboard-page">
      <header className="dashboard-page-header">
        <h1 className="dashboard-page-title">Memo</h1>
        <p className="dashboard-page-subtitle">Department memos and internal reminders.</p>
      </header>
      <div className="dashboard-page-content">
        <section className="dashboard-card">
          <h2 className="dashboard-card-title">No memos yet</h2>
          <p className="dashboard-card-desc">
            Posted memos will be listed here for your team.
          </p>
        </section>
      </div>
    </div>
  )
}
