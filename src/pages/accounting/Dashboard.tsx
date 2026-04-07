import RoleDashboardBase from '../_shared/RoleDashboardBase'

export default function AccountingDashboard() {
  return (
    <RoleDashboardBase
      segment="accounting"
      title="Accounting"
      subtitle="Accounting view for records, reconciliation, and close activities"
      appSectionTitle="Accounting applications"
      appSectionDesc="Apps assigned to Accounting users for ledger and reconciliation tasks."
      activitySectionDesc="Recent accounting-related actions and launches in this browser."
      activityFocusLabel="Accounting events"
      activityMatcher={/account|ledger|recon|invoice|payment|journal|app_launched/i}
    />
  )
}

