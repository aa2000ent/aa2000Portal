import RoleDashboardBase from '../_shared/RoleDashboardBase'

export default function SaleDashboard() {
  return (
    <RoleDashboardBase
      segment="sale"
      title="Sale"
      subtitle="Sales pipeline visibility and account-facing applications"
      appSectionTitle="Sales applications"
      appSectionDesc="Tools assigned to Sale users for pipeline and client handling."
      activitySectionDesc="Lead, launch, and deal-related actions recorded in this browser."
      activityFocusLabel="Sales events"
      activityMatcher={/sale|lead|quote|deal|client|customer|app_launched|proposal|leave/i}
    />
  )
}

