import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Fuente oficial (ver styles/tipografia.css): solo estilos normales, grosores 200 a
// 800 y font-display: swap. No se descarga hasta que una pantalla la use.
import '@fontsource-variable/plus-jakarta-sans/wght.css'
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
