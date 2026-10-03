import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import Icon from '../components/Icon.jsx'
import LocationPicker from '../components/LocationPicker.jsx'
import DiscoverPanel from '../components/DiscoverPanel.jsx'
import DiscoverTabs from '../components/DiscoverTabs.jsx'
import useDiscoverTab from '../hooks/useDiscoverTab.js'
import { normalizeDiscover } from '../lib/discover.js'
import { DISCOVER_TABS, sectionCounts } from '../lib/discoverTabs.js'
import { PreviewProvider } from '../lib/preview.js'
import { readSetting, writeSetting } from '../lib/storage.js'

const DEFAULT_RADIUS = 25
const RADIUS_VALUES = [5, 10, 25, 50, 100]
const PLZ_LENGTH = 5
const PLZ_RE = /^\d{0,5}$/
const INCOMPLETE_PLZ_ERROR = 'Bitte eine 5-stellige Postleitzahl eingeben.'
const LOAD_ERROR = 'Entdecken konnte gerade nicht geladen werden. Bitte versucht es gleich noch einmal.'
const PLZ_HINT = 'Ohne Postleitzahl zeigen wir alles, nach Namen sortiert.'
const PANEL_ID = 'entdecken-panel'

// Gemerkte Werte teilt sich die Seite mit "In der Nähe" (/umgebung, NearbyPage) - dieselben Schlüssel,
// damit eine dort eingegebene PLZ hier gleich gilt und umgekehrt. Nur PLZ und Radius, nie Koordinaten.
function storedPlz() {
  const value = readSetting('nearbyPlz', '')
  return typeof value === 'string' && PLZ_RE.test(value) ? value : ''
}

function storedRadius() {
  const value = readSetting('nearbyRadius', DEFAULT_RADIUS)
  return RADIUS_VALUES.includes(value) ? value : DEFAULT_RADIUS
}

// Server-Meldungen (z. B. "Diese Postleitzahl kennen wir nicht", Rate-Limit, keine Verbindung) sind
// schon freundlich formuliert; Serverfehler und nackte "Fehler 500" ersetzt ein eigener Satz.
function friendlyError(err) {
  const message = err?.message
  if (!message || err.status >= 500 || /^Fehler \d+$/.test(message)) return LOAD_ERROR
  return message
}

// /entdecken (angemeldet, auch in der Demo): Hundeschulen, Salon & Betreuung (Phase P2), neue Begleiter
// aus Tierheimen und Vermittlungsstellen, Futter-Empfehlungen und Unterstützen - alles aus einer Antwort
// von POST /api/discover. Mit PLZ sortiert der Server nach Entfernung, ohne liefert er alles nach Namen.
// Phase V1: die Seite öffnet sofort mit Inhalten (gemerkte PLZ oder überall); die Ortswahl ist eine Zeile
// ("In der Nähe von … · ändern"), die Eingabe erscheint erst auf Wunsch.
// Seit Phase U in Reitern mit Zählern (DiscoverTabs, ?bereich=): "Alle" zeigt je Bereich die ersten drei.
// Kundensicht (Phase P1, CustomerViewPage): load ersetzt api.discover (gleiche Signatur { plz, radius },
// z. B. api.partnerArea.previewDiscover), preview schaltet Links ab und zeigt die eigene Karte markiert; initialTab
// öffnet dort gleich den Bereich der eigenen Karte statt "Alle".
export default function DiscoverPage({ load, preview = false, initialTab }) {
  const [plz, setPlz] = useState(storedPlz)
  const [radius, setRadius] = useState(storedRadius)
  // Phase V1: der Ort der zuletzt gezeigten Inhalte für die Kurzzeile der Ortswahl - zu Beginn die gemerkte PLZ (den
  // Ortsnamen liefert erst die Antwort), danach jede erfolgreiche Suche.
  const [applied, setApplied] = useState(() => ({ plz: plz.length === PLZ_LENGTH ? plz : null, ort: null, radius }))
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // Nur die Antwort der jüngsten Anfrage zählt - eine langsame ältere überschreibt nie eine neuere.
  const latestRequest = useRef(0)
  const [tab, selectTab] = useDiscoverTab(preview, initialTab)
  // "Alle anzeigen" verschwindet mit dem Wechsel - der Fokus springt darum auf den neuen Reiter.
  const focusTabAfterSwitch = useRef(false)

  useEffect(() => {
    if (!focusTabAfterSwitch.current) return
    focusTabAfterSwitch.current = false
    const tabButton = document.getElementById(`discover-tab-${tab}`)
    tabButton?.focus()
    tabButton?.closest('.tab-bar')?.scrollIntoView?.({ block: 'nearest' })
  }, [tab])

  function showAll(key) {
    focusTabAfterSwitch.current = true
    selectTab(key)
  }

  useEffect(() => {
    writeSetting('nearbyPlz', plz)
  }, [plz])

  useEffect(() => {
    writeSetting('nearbyRadius', radius)
  }, [radius])

  // Absichtlich nur beim ersten Anzeigen (leere Abhängigkeitsliste): mit der gemerkten PLZ laden. Danach
  // sucht ausschließlich das Formular - Tippen in PLZ oder Umkreis löst keine Anfrage aus. Das
  // Aufräumen erklärt jede noch laufende Antwort für veraltet, damit sie nach dem Verlassen nichts setzt.
  useEffect(() => {
    search(plz.length === PLZ_LENGTH ? plz : '')
    return () => {
      latestRequest.current += 1
    }
  }, [])

  async function search(searchPlz) {
    latestRequest.current += 1
    const requestId = latestRequest.current
    const isCurrent = () => requestId === latestRequest.current
    const fetchDiscover = load || api.discover
    setLoading(true)
    setError(null)
    try {
      const result = await fetchDiscover(searchPlz ? { plz: searchPlz, radius } : {})
      if (!isCurrent()) return
      setData(normalizeDiscover(result))
      setApplied({ plz: searchPlz || null, ort: result?.center?.ort || null, radius })
    } catch (err) {
      if (!isCurrent()) return
      setError(friendlyError(err))
      setData(null)
    } finally {
      if (isCurrent()) setLoading(false)
    }
  }

  function handleSubmit(event) {
    event.preventDefault()
    // Eine angefangene PLZ gilt nicht stillschweigend als "keine PLZ" (wie PartnersPage).
    if (plz.length > 0 && plz.length < PLZ_LENGTH) {
      setError(INCOMPLETE_PLZ_ERROR)
      return false
    }
    search(plz)
    return true
  }

  const counts = data ? sectionCounts(data) : null

  return (
    <PreviewProvider value={preview}>
      <div className="page discover-page">
        <header className="page-hero">
          <div>
            <span className="eyebrow">Rund ums Tier</span>
            <h1>Entdecken</h1>
            <p className="page-lede">
              Hundeschulen, Salons und Betreuung, neue Begleiter aus Tierheimen, Futter-Empfehlungen und Wege, Tieren zu
              helfen – mit Postleitzahl zuerst das, was in eurer Nähe ist.
            </p>
          </div>
        </header>

        <LocationPicker
          plz={plz}
          radius={radius}
          onPlzChange={setPlz}
          onRadiusChange={setRadius}
          onSubmit={handleSubmit}
          hint={PLZ_HINT}
          collapsible
          applied={applied}
          allowEverywhere
        />

        {error && (
          <div className="error-banner" role="alert">
            {error}
          </div>
        )}

        {preview && data?.vorschauHinweis && (
          <p className="preview-hint" role="note">
            <Icon name="eye" />
            {data.vorschauHinweis}
          </p>
        )}

        <DiscoverTabs tabs={DISCOVER_TABS} current={tab} counts={counts} panelId={PANEL_ID} onSelect={selectTab} />

        <div
          id={PANEL_ID}
          role="tabpanel"
          aria-labelledby={`discover-tab-${tab}`}
          className="discover-chapters"
          aria-busy={loading || undefined}
        >
          {loading && (
            <p className="muted" role="status" aria-busy="true">
              Lädt …
            </p>
          )}
          {data && <DiscoverPanel data={data} tab={tab} onShowAll={showAll} />}
        </div>
      </div>
    </PreviewProvider>
  )
}
