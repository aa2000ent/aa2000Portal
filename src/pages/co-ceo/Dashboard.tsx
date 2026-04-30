import RoleDashboardBase from '../_shared/RoleDashboardBase'

export default function CoCeoDashboard() {
  return (
    <RoleDashboardBase
      segment="co-ceo"
      title="CO-CEO"
      subtitle="Executive operations view for cross-functional monitoring and decisions"
      appSectionTitle="Co-CEO applications"
      appSectionDesc="Apps assigned to CO-CEO for leadership and oversight workflows."
      activitySectionDesc="Recent cross-functional executive actions in this browser."
      activityFocusLabel="Leadership events"
      activityMatcher={/co-ceo|co_ceo|coo|executive|approval|operation|app_launched|leave/i}
    />
  )
}

