import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import EinblickeGallery from './EinblickeGallery.jsx'
import PortalAction from './PortalAction.jsx'
import PortalAnimals from './PortalAnimals.jsx'
import PortalContact from './PortalContact.jsx'
import PortalHero from './PortalHero.jsx'
import PortalOverview from './PortalOverview.jsx'
import PortalPosts from './PortalPosts.jsx'
import PortalSection from './PortalSection.jsx'
import PortalTermine from './PortalTermine.jsx'
import TabBar from './TabBar.jsx'
import usePortalTab from '../hooks/usePortalTab.js'
import { CONTACT_TAB, OVERVIEW_TAB, SECTION_IDS, hashTarget, portalCounts, portalTabs, tabCountText } from '../lib/portalTabs.js'
import { PortalPanelProvider } from '../lib/portalPanel.js'

const TAB_ID_PREFIX = 'portal-tab'
const panelIdOf = (key) => `portal-panel-${key}`

function scrollBehavior() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
}

// Zu einem Abschnitt springen und den Fokus auf dessen Überschrift setzen (PortalSection, tabIndex -1) - Tastatur und
// Screenreader landen so dort, wo der Blick hinspringt.
function jumpToSection(targetId) {
  const target = document.getElementById(targetId)
  if (!target) return false
  target.scrollIntoView?.({ behavior: scrollBehavior(), block: 'start' })
  document.getElementById(`${targetId}-title`)?.focus({ preventScroll: true })
  return true
}

// Nach einem Wechsel aus dem Inhalt heraus ("Alle Termine"): stand die Leiste schon oberhalb des Bildes (bzw. unter dem
// klebenden Kopf der App - html scroll-padding-top, base.css), rückt sie wieder nach oben (der neue Reiter beginnt dort),
// und der Fokus geht auf den gewählten Reiter.
function revealTabBar(bar, key) {
  if (!bar) return
  const offset =
    (parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0) + (parseFloat(getComputedStyle(bar).scrollMarginTop) || 0)
  if (bar.getBoundingClientRect().top < offset) bar.scrollIntoView?.({ behavior: scrollBehavior(), block: 'start' })
  document.getElementById(`${TAB_ID_PREFIX}-${key}`)?.focus({ preventScroll: true })
}

function RedeemSection({ partner, family, preview, onRedeemed, onLogout }) {
  return (
    <PortalSection
      id={SECTION_IDS.gutschein}
      title="Einladungscode einlösen"
      lede={family || preview ? null : `Du hast von ${partner.name} einen Einladungscode bekommen? Hier legst du deine eigene Chronik an – kostenlos.`}
      className="partner-portal-redeem"
    >
      <PortalAction partner={partner} family={family} preview={preview} onRedeemed={onRedeemed} onLogout={onLogout} />
    </PortalSection>
  )
}

// Kopf und Reiter des Portals (PartnerPortalPage, öffentlich und in der Kundensicht): unter dem Kopf (PortalHero) die
// gemeinsame Reiter-Leiste (TabBar) mit "Übersicht" vorn, Tieren (Tierheime), Angeboten, Terminen, Einblicken und
// "Kontakt" (samt "Gutschein einlösen") - Reiter ohne Inhalt fehlen. Alle Reiter stehen im Dokument (nur verborgen):
// die Seite bleibt vollständig für Suchmaschinen, eine Eingabe im Gutschein-Formular übersteht den Wechsel; offene
// Dialoge eines verborgenen Reiters schließen sich (lib/portalPanel.js). Der Reiter steht in der Adresse (usePortalTab);
// eine alte Sprungmarke (#kontakt) öffnet den passenden Reiter und springt zum Abschnitt.
export default function PortalBody({ partner, posts, animals, happyEnds, family, preview, onRedeemed, onLogout }) {
  const data = { posts, termine: partner.termine, einblicke: partner.einblicke, animals, happyEnds, preview }
  const tabs = portalTabs(data)
  const keys = tabs.map((item) => item.key)
  const [tab, selectTab] = usePortalTab(keys)
  const { hash } = useLocation()
  const bar = useRef(null)
  const [jump, setJump] = useState(null)
  const handledHash = useRef(false)
  const previousTab = useRef(tab)
  const keyList = keys.join(',')

  // Wechsel aus Kopf und Übersicht: Reiter wählen und danach zum Abschnitt bzw. zur Leiste springen (Effekt unten).
  const showTab = useCallback(
    (key, target = null) => {
      if (!keyList.split(',').includes(key)) return
      selectTab(key)
      setJump({ key, target })
    },
    [selectTab, keyList]
  )

  // Der Sprung wartet, bis der gewünschte Reiter zu sehen ist (die Adresse kann einen Takt später folgen). Ging es
  // inzwischen woandershin (z. B. Zurück), verfällt er - sonst spränge die Seite später unvermittelt.
  useEffect(() => {
    const tabChanged = previousTab.current !== tab
    previousTab.current = tab
    if (!jump) return
    if (jump.key === tab) {
      if (!jump.target || !jumpToSection(jump.target)) revealTabBar(bar.current, jump.key)
      setJump(null)
    } else if (tabChanged) {
      setJump(null)
    }
  }, [jump, tab])

  // Einmal beim Öffnen: eine alte Sprungmarke (#kontakt, #partner-portal-termine) führt zum Abschnitt im Reiter.
  useEffect(() => {
    if (handledHash.current) return
    handledHash.current = true
    const target = hashTarget(hash)
    if (target && target.tab === tab) jumpToSection(target.target)
  }, [hash, tab])

  function panelContent(key) {
    switch (key) {
      case OVERVIEW_TAB:
        return <PortalOverview partner={partner} posts={posts} animals={animals} onShowTab={showTab} />
      case 'tiere':
        return <PortalAnimals animals={animals} happyEnds={happyEnds} partner={partner} />
      case 'angebote':
        return <PortalPosts posts={posts} />
      case 'termine':
        return <PortalTermine termine={partner.termine} />
      case 'einblicke':
        return <EinblickeGallery einblicke={partner.einblicke} />
      case CONTACT_TAB:
        return (
          <>
            <PortalContact partner={partner} />
            <RedeemSection partner={partner} family={family} preview={preview} onRedeemed={onRedeemed} onLogout={onLogout} />
          </>
        )
      default:
        return null
    }
  }

  return (
    <div className="portal-main">
      <PortalHero partner={partner} hasAnimals={animals.length > 0} onShowTab={showTab} />
      <div className="portal-tabs-area">
        <div ref={bar} className="portal-tabs-bar">
          <TabBar
            tabs={tabs}
            current={tab}
            counts={portalCounts(data)}
            label={`Bereiche von ${partner.name}`}
            idPrefix={TAB_ID_PREFIX}
            panelId={panelIdOf}
            countText={tabCountText}
            className="portal-tabs"
            onSelect={selectTab}
          />
        </div>
        {tabs.map((item) => (
          <div
            key={item.key}
            id={panelIdOf(item.key)}
            role="tabpanel"
            aria-labelledby={`${TAB_ID_PREFIX}-${item.key}`}
            className={`portal-tab-panel portal-tab-panel-${item.key}`}
            hidden={item.key !== tab}
          >
            <PortalPanelProvider value={item.key === tab}>{panelContent(item.key)}</PortalPanelProvider>
          </div>
        ))}
      </div>
    </div>
  )
}
