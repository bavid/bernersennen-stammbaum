import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@fontsource-variable/fraunces/full.css'
import '@fontsource-variable/manrope'
import App from './App.jsx'
import { ToastProvider } from './components/Toast.jsx'
import EnvBanner from './components/EnvBanner.jsx'
import HinweisBand from './components/HinweisBand.jsx'
import SkipLink from './components/SkipLink.jsx'
import { trackScrollbarWidth } from './lib/viewport.js'
import { installChunkReload } from './lib/chunkReload.js'
import './styles/global.css'

trackScrollbarWidth()
installChunkReload()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        {/* Audit V7a: erster Tab-Stopp jeder Seite, nur bei Fokus sichtbar */}
        <SkipLink />
        <EnvBanner />
        {/* Phase N Task 5: globale Hinweise des Admins - direkt unter dem Umgebungs-Band, über jeder Seite der App. */}
        <HinweisBand />
        <App />
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>
)
