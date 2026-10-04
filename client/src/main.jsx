import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './styles/fonts.css'
import App from './App.jsx'
import { ToastProvider } from './components/Toast.jsx'
import TopStrip, { TopStripProvider } from './components/TopStrip.jsx'
import SkipLink from './components/SkipLink.jsx'
import { trackScrollbarWidth } from './lib/viewport.js'
import { installChunkReload } from './lib/chunkReload.js'
import { applyDarstellung, storedDarstellung } from './lib/darstellung.js'
import { removeSetting } from './lib/storage.js'
import './styles/global.css'

trackScrollbarWidth()
installChunkReload()
// Die zuletzt gemerkte Darstellung (public/darstellung-init.js hat sie schon vor dem ersten Bild gesetzt) - hier dazu der
// Lauscher, der „Automatisch“ einem Wechsel des Systems folgen lässt. /api/me übernimmt danach (App.jsx).
applyDarstellung(storedDarstellung())
// B+ Familienalbum: einen Auftritt je Familie gibt es nicht mehr - der zuletzt gemerkte (Splash) wird nicht mehr gebraucht.
removeSetting('lastThemeId')

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
