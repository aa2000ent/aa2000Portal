import RoleDashboardBase from '../_shared/RoleDashboardBase'

export default function PurchasingDashboard() {
  return (
    <RoleDashboardBase
      segment="purchasing"
      title="Purchasing"
      subtitle="Procurement workspace for sourcing and vendor-related workflows"
      appSectionTitle="Procurement applications"
      appSectionDesc="Apps assigned to Purchasing users for sourcing and order processing."
      activitySectionDesc="Recent procurement and supplier-facing actions in this session."
      activityFocusLabel="Procurement events"
      activityMatcher={/purchas|procure|supplier|vendor|order|request|app_launched|leave/i}
    />
  )
}

