import RoleDashboardBase from '../_shared/RoleDashboardBase'

export default function CustomerDashboard() {
  return (
    <RoleDashboardBase
      segment="customer"
      title="Customer"
      subtitle="Customer operations space for service and relationship touchpoints"
      appSectionTitle="Customer service applications"
      appSectionDesc="Applications assigned to Customer users for support and engagement."
      activitySectionDesc="Customer-facing actions and launches captured in this browser."
      activityFocusLabel="Customer events"
      activityMatcher={/customer|support|service|ticket|client|app_launched|chat|leave/i}
    />
  )
}

