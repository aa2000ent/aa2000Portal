import AnnouncementCrudPage from '../components/AnnouncementCrudPage'

export default function PortalPublicAnnouncement() {
  return (
    <AnnouncementCrudPage
      type="ANNOUNCEMENT"
      title="Public Announcement"
      subtitle="Create, update, and manage public announcements."
    />
  )
}
