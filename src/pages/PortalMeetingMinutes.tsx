import AnnouncementCrudPage from '../components/AnnouncementCrudPage'

export default function PortalMeetingMinutes() {
  return (
    <AnnouncementCrudPage
      type="MEETING_MINUTES"
      title="Meeting minutes"
      subtitle="Create, update, and manage meeting minutes."
    />
  )
}
