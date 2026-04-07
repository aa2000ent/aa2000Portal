import RoleDashboardBase from '../_shared/RoleDashboardBase'

export default function TechnicalDashboard() {
  return (
    <RoleDashboardBase
      segment="technical"
      title="Technical"
      subtitle="Technical operations board for system access and support tooling"
      appSectionTitle="Technical applications"
      appSectionDesc="Apps assigned to Technical users for IT and platform support."
      activitySectionDesc="Recent technical, launch, and support actions in this session."
      activityFocusLabel="Technical events"
      activityMatcher={/technical|it|support|system|issue|deploy|app_launched/i}
    />
  )
}

