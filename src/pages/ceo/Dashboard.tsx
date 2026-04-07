import RoleDashboardBase from '../_shared/RoleDashboardBase'

export default function CeoDashboard() {
  return (
    <RoleDashboardBase
      segment="ceo"
      title="CEO"
      subtitle="Executive snapshot for strategic visibility and organization-level access"
      appSectionTitle="Executive applications"
      appSectionDesc="Applications assigned to CEO for high-level decision workflows."
      activitySectionDesc="Recent executive-level actions recorded in this browser."
      activityFocusLabel="Executive events"
      activityMatcher={/ceo|executive|approval|history|dashboard|app_launched/i}
    />
  )
}

