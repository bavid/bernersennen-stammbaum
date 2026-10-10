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
import { captureInstallPrompt } from './lib/install.js'
import PwaUpdate from './components/PwaUpdate.jsx'
import { applyDarstellung, storedDarstellung } from './lib/darstellung.js'
import { removeSetting } from './lib/storage.js'
import { useLang, whenReady } from './lib/i18n/index.js'
import './styles/global.css'

trackScrollbarWidth()
installChunkReload()
// Als App aufs Handy: den Installations-Dialog von Chrome/Android abfangen, bis jemand „App installieren“ drückt
// (components/InstallHint.jsx). Der Service Worker selbst wird in PwaUpdate angemeldet (nur im Produktions-Build).
captureInstallPrompt()
// Die zuletzt gemerkte Darstellung (public/darstellung-init.js hat sie schon vor dem ersten Bild gesetzt) - hier dazu der
// Lauscher, der „Automatisch“ einem Wechsel des Systems folgen lässt. /api/me übernimmt danach (App.jsx).
applyDarstellung(storedDarstellung())
// B+ Familienalbum: einen Auftritt je Familie gibt es nicht mehr - der zuletzt gemerkte (Splash) wird nicht mehr gebraucht.
removeSetting('lastThemeId')

// Sprachwechsel sofort überall: Root hört auf die Sprache und baut den Baum neu auf (ohne Neu-Einhängen - Formulare und
// Daten bleiben). So greift auch t() außerhalb von Hooks (lib/*.js, Konstanten beim Rendern) gleich nach dem Klick.
function Root() {
  useLang()
  return (
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
            {/* „Neue Version verfügbar · Neu laden“, sobald der Service Worker eine neue Version fertig hat */}
            <PwaUpdate />
          </TopStripProvider>
        </ToastProvider>
      </BrowserRouter>
    </React.StrictMode>
  )
}

// Erster Besuch in einer anderen Sprache als Deutsch: kurz auf ihr Wörterbuch warten (lib/i18n, höchstens 1,5 s), damit
// nicht erst Deutsch aufblitzt. Liegt es schon im Browser-Speicher, geht es sofort los.
whenReady().then(() => ReactDOM.createRoot(document.getElementById('root')).render(<Root />))
