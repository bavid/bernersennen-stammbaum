import { useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api'
import Icon from '../components/Icon.jsx'
import PreviewFrame from '../components/PreviewFrame.jsx'
import SteckbriefPreview from '../components/SteckbriefPreview.jsx'
import DiscoverPage from './DiscoverPage.jsx'
import PartnerPortalPage from './PartnerPortalPage.jsx'
import { ownSectionTab } from '../lib/discoverTabs.js'
import { PORTAL_TAB_PARAM } from '../lib/portalTabs.js'

const TAB_DISCOVER = 'entdecken'
const TAB_PORTAL = 'portal'
const TAB_STECKBRIEFE = 'steckbriefe'
// Die gewählte Vorschau steht in der Adresse (/kundensicht?ansicht=portal, "Entdecken" ohne Parameter) - samt dem
// Reiter des Portals (&reiter=termine, usePortalTab). So führen Neuladen, Zurück und ein gemerkter Link wieder dorthin.
const VIEW_PARAM = 'ansicht'

// "Steckbriefe" nur für Tierheime (art 'tierheim') - nur sie haben Tiere mit Steckbrief.
function tabsFor(family) {
  return [
    { key: TAB_DISCOVER, label: 'Entdecken (Beispiel-Kunde)' },
    { key: TAB_PORTAL, label: 'Euer Portal' },
    ...(family?.art === 'tierheim' ? [{ key: TAB_STECKBRIEFE, label: 'Steckbriefe' }] : [])
  ]
}

// Öffentlich sichtbar wie auf dem Server (server/lib/partners.js isPubliclyVisible): aktiv und nicht gesperrt.
function isPublic(partner) {
  return partner?.status === 'aktiv' && !partner?.gesperrt
}

function CustomerViewBanner({ partner }) {
  const hidden = !isPublic(partner)
  return (
    <p className={`customer-view-banner${hidden ? ' is-not-public' : ''}`}>
      <Icon name="eye" />
      <span>
        <strong>Vorschau – so sehen Kunden euer Profil</strong>
        {hidden && <span className="customer-view-banner-note"> Noch nicht öffentlich sichtbar.</span>}
      </span>
    </p>
  )
}

function CustomerViewTabs({ tabs, current, onSelect }) {
  return (
    <div className="segmented customer-view-tabs" role="group" aria-label="Vorschau wählen">
      {tabs.map((item) => (
        <button
          type="button"
          key={item.key}
          aria-pressed={current === item.key}
          aria-controls={`customer-view-panel-${item.key}`}
          onClick={() => onSelect(item.key)}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

// Gewählte Vorschau aus der Adresse - unbekannt oder nicht erlaubt (Steckbriefe ohne Tierheim) -> "Entdecken".
function useCustomerViewTab(tabs) {
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  const requested = new URLSearchParams(search).get(VIEW_PARAM)
  const current = tabs.some((item) => item.key === requested) ? requested : TAB_DISCOVER

  function select(key) {
    if (key === current) return
    // Der Portal-Reiter gehört nur zur Portal-Vorschau - beim Wechsel fällt er weg.
    const params = new URLSearchParams(search)
    params.delete(PORTAL_TAB_PARAM)
    if (key === TAB_DISCOVER) params.delete(VIEW_PARAM)
    else params.set(VIEW_PARAM, key)
    const next = params.toString()
    navigate({ pathname, search: next ? `?${next}` : '' })
  }

  return [current, select]
}

// /kundensicht (Phase P1): Partner und Tierheime sehen live, wie ihr Auftritt bei Kundinnen und Kunden
// ankommt - auch als Entwurf, pausiert oder gesperrt. "Entdecken" mit den Daten einer Beispiel-Kundin, geöffnet im
// eigenen Bereich (Hundeschulen, Salon & Betreuung, Neue Begleiter) mit der eigenen Karte markiert vorn, das eigene
// Portal (mit seinen Reitern) und (Tierheime) die Steckbriefe, jeweils im Rahmen einer Kunden-App (PreviewFrame). Alle
// Links darin sind abgeschaltet (lib/preview.js). Erreichbar über den Umschalter "Bearbeiten | Kundensicht"
// (ViewModeSwitch).
export default function CustomerViewPage({ family }) {
  const tabs = tabsFor(family)
  const [current, setTab] = useCustomerViewTab(tabs)
  const loadDiscover = useCallback((params) => api.partnerArea.previewDiscover(params), [])
  const loadPortal = useCallback(() => api.partnerArea.previewPortal(), [])

  return (
    <div className="page customer-view-page">
      {/* Phase U: Überschrift zuerst, der Vorschau-Hinweis darunter - wie auf den anderen Seiten des Bereichs. */}
      <header className="customer-view-head">
        <h1>Kundensicht</h1>
        <CustomerViewTabs tabs={tabs} current={current} onSelect={setTab} />
      </header>
      <CustomerViewBanner partner={family?.partner} />

      <div id={`customer-view-panel-${current}`} className="customer-view-panel">
        {current === TAB_DISCOVER && (
          <PreviewFrame label="Entdecken aus Sicht einer Beispiel-Kundin (Vorschau)">
            <DiscoverPage load={loadDiscover} preview initialTab={ownSectionTab(family?.partner?.typ)} />
          </PreviewFrame>
        )}
        {current === TAB_PORTAL && (
          <PreviewFrame label="Euer Portal (Vorschau)" showNav={false}>
            <PartnerPortalPage load={loadPortal} preview />
          </PreviewFrame>
        )}
        {current === TAB_STECKBRIEFE && <SteckbriefPreview />}
      </div>
    </div>
  )
}
