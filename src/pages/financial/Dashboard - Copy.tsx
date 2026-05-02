import RoleDashboardBase from '../_shared/RoleDashboardBase'

export default function FinancialDashboard() {
  return (
    <RoleDashboardBase
      segment="financial"
      title="Financial"
      subtitle="Financial oversight view for controls, reviews, and reporting workflows"
      appSectionTitle="Financial applications"
      appSectionDesc="Apps assigned to Financial users for analysis and reporting."
      activitySectionDesc="Recent finance-control and review actions from this browser."
      activityFocusLabel="Finance events"
      activityMatcher={/financial|finance|report|budget|review|approve|reject|app_launched|leave/i}
    />
  )
}

