import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { readThemeFromStorage } from './contexts/ThemeContext'
import { applyPortalThemeCssVars } from './theme/applyPortalThemeCssVars'
import { registerServiceWorker } from './utils/pushNotifications'

const bootTheme = readThemeFromStorage()
document.documentElement.setAttribute('data-theme', bootTheme)
applyPortalThemeCssVars(bootTheme)

registerServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
