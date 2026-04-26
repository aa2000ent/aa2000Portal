export default function PortalPublicAnnouncement() {
  return (
    <div className="dashboard-page">
      <header className="dashboard-page-header">
        <h1 className="dashboard-page-title">Public Announcement</h1>
        <p className="dashboard-page-subtitle">Official announcements visible to your department.</p>
      </header>
      <div className="dashboard-page-content">
        <section className="dashboard-card">
          <h2 className="dashboard-card-title">No announcements yet</h2>
          <p className="dashboard-card-desc">
            New public announcements will appear here when they are published.
          </p>
        </section>
      </div>
    </div>
  )
}
