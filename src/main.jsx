import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Fuente oficial (ver styles/fuenteApp.css). No se descarga hasta que una pantalla la use.
import './styles/fuenteApp.css'
import './index.css'
import Spinner from './components/ui/Spinner'
import { listenForSessionRequests, syncSessionFromOtherTabs } from './services/sessionSync'

const root = createRoot(document.getElementById('root'))

root.render(
  <div className="flex h-screen w-full items-center justify-center bg-gray-50 dark:bg-gray-900">
    <Spinner size="lg" />
  </div>,
)

listenForSessionRequests()

syncSessionFromOtherTabs().then(async () => {
  const [{ default: App }, { ToastProvider }] = await Promise.all([
    import('./App.jsx'),
    import('./context/ToastContext'),
  ])

  root.render(
    <StrictMode>
      <ToastProvider>
        <App />
      </ToastProvider>
    </StrictMode>,
  )
})
