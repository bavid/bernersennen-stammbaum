import { useCallback, useState } from 'react'
import { api } from '../api'
import Icon from '../components/Icon.jsx'
import PreviewFrame from '../components/PreviewFrame.jsx'
import SteckbriefPreview from '../components/SteckbriefPreview.jsx'
import DiscoverPage from './DiscoverPage.jsx'
import PartnerPortalPage from './PartnerPortalPage.jsx'

const TAB_DISCOVER = 'entdecken'
const TAB_PORTAL = 'portal'
const TAB_STECKBRIEFE = 'steckbriefe'

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

// /kundensicht (Phase P1): Partner und Tierheime sehen live, wie ihr Auftritt bei Kundinnen und Kunden
// ankommt - auch als Entwurf, pausiert oder gesperrt. "Entdecken" mit den Daten einer Beispiel-Kundin und
// der eigenen Karte vorn, das eigene Portal und (Tierheime) die Steckbriefe, jeweils im Rahmen einer
// Kunden-App (PreviewFrame). Alle Links darin sind abgeschaltet (lib/preview.js). Erreichbar über den
// Umschalter "Bearbeiten | Kundensicht" (ViewModeSwitch).
export default function CustomerViewPage({ family }) {
  const tabs = tabsFor(family)
  const [tab, setTab] = useState(TAB_DISCOVER)
  const current = tabs.some((item) => item.key === tab) ? tab : TAB_DISCOVER
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
            <DiscoverPage load={loadDiscover} preview />
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
