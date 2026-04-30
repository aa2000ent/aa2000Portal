import RoleDashboardBase from '../_shared/RoleDashboardBase'

export default function SupplierDashboard() {
  return (
    <RoleDashboardBase
      segment="supplier"
      title="Supplier"
      subtitle="Supplier coordination workspace and vendor-linked application access"
      appSectionTitle="Supplier applications"
      appSectionDesc="Apps assigned to Supplier users for vendor interactions and tracking."
      activitySectionDesc="Recent supplier and vendor process actions in this browser."
      activityFocusLabel="Supplier events"
      activityMatcher={/supplier|vendor|delivery|order|procure|app_launched|leave/i}
    />
  )
}

