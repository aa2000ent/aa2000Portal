import RoleDashboardBase from '../_shared/RoleDashboardBase'

export default function OperationsDashboard() {
  return (
    <RoleDashboardBase
      segment="operations"
      title="Operations"
      subtitle="Operational control view for daily execution and cross-team actions"
      appSectionTitle="Operations applications"
      appSectionDesc="Apps assigned to Operations users for execution workflows."
      activitySectionDesc="Latest process and workflow actions captured in this session."
      activityFocusLabel="Ops events"
      activityMatcher={/operation|workflow|process|task|approval|app_launched/i}
    />
  )
}

