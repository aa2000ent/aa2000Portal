import AnnouncementCrudPage from '../components/AnnouncementCrudPage'

export default function PortalMeetingMinutes() {
  return (
    <AnnouncementCrudPage
      type="MEETING_MINUTES"
      title="Minutes of Meeting"
      subtitle="Create, update, and manage meeting minutes."
    />
  )
}
