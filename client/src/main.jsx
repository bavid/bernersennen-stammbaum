import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@fontsource-variable/fraunces/full.css'
import '@fontsource-variable/manrope'
import App from './App.jsx'
import { ToastProvider } from './components/Toast.jsx'
import TopStrip, { TopStripProvider } from './components/TopStrip.jsx'
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
        <TopStripProvider>
          {/* Audit V7a: erster Tab-Stopp jeder Seite, nur bei Fokus sichtbar */}
          <SkipLink />
          {/* Calm-down-Runde: Vorschau-Linie und EINE schmale Zeile für den Hinweis des Admins (Phase N Task 5) und den
              Demo-/Besuchs-Hinweis, den App per Portal dort einhängt - über jeder Seite der App. */}
          <TopStrip />
          <App />
        </TopStripProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>
)
