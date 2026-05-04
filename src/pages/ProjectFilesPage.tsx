import { useParams } from 'react-router-dom'
import { FileManager } from '../components/FileManager'

export default function ProjectFilesPage() {
  const { segment } = useParams<{ segment: string }>()

  // The backend handles filtering by application code.
  const application = segment?.toUpperCase() === 'TECHNICAL' ? 'TECHNCODE' : 'TECHNCODE'

  return (
    <div className="dashboard-page">
      <header className="dashboard-page-header">
        <h1 className="dashboard-page-title">Project Files</h1>
        <p className="dashboard-page-subtitle">Secure access to project documentation and reports</p>
      </header>
      <div className="dashboard-page-content">
        <FileManager application={application} />
      </div>
    </div>
  )
}
