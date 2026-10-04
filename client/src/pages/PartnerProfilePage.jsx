import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import Icon from '../components/Icon.jsx'
import PartnerStatusCard from '../components/PartnerStatusCard.jsx'
import PartnerProfileForm from '../components/PartnerProfileForm.jsx'
import PartnerBannerEditor from '../components/PartnerBannerEditor.jsx'
import EinblickeEditor from '../components/EinblickeEditor.jsx'
import PartnerPostsEditor from '../components/PartnerPostsEditor.jsx'
import PartnerTermineEditor from '../components/PartnerTermineEditor.jsx'
import PartnerVoucherStacks from '../components/PartnerVoucherStacks.jsx'
import PartnerShareSection from '../components/PartnerShareSection.jsx'
import VisitenkartenTeaser from '../components/visitenkarte/VisitenkartenTeaser.jsx'
import TabBar from '../components/TabBar.jsx'
import { useToast } from '../components/Toast.jsx'
import { TYPE_LABELS } from '../lib/partnerTypes.js'
import { navItemsFor } from '../lib/navItems.js'
import { PROFILE_TAB_PARAM as TAB_PARAM } from '../lib/partnerProfile.js'

const ACCESS_ROUTE = '/zugang'

const TAB_ANGABEN = { key: 'angaben', label: 'Angaben' }
const TAB_EINBLICKE = { key: 'einblicke', label: 'Einblicke' }
// Phase P2: Tierheime haben keinen Navigationspunkt "Beiträge" (sonst wären es mehr als fünf) - bei ihnen
// stehen die Beiträge als dritter Reiter hier.
const TAB_BEITRAEGE = { key: 'beitraege', label: 'Beiträge' }
// Phase V4a: ebenso der Kalender (Partner: eigener Navigationspunkt "Kalender").
const TAB_KALENDER = { key: 'kalender', label: 'Kalender' }
// Phase U: alles, was ein Partner nach außen weitergibt, unter einem Reiter - der Portal-Link samt QR-Code,
// Website-Knopf und Social-Media-Text (PartnerShareSection) und darunter die Kunden-Gutschein-Stapel
// (PartnerVoucherStacks, Phase 5 Task 4). Partner haben drei Reiter, Tierheime dazu Beiträge und Kalender (die Leiste
// scrollt am Handy waagerecht, TabBar).
const TAB_TEILEN = { key: 'teilen', label: 'Teilen' }

function tabsFor(family) {
  return family?.art === 'tierheim' ? [TAB_ANGABEN, TAB_EINBLICKE, TAB_BEITRAEGE, TAB_KALENDER, TAB_TEILEN] : [TAB_ANGABEN, TAB_EINBLICKE, TAB_TEILEN]
}

function panelId(key) {
  return `partner-profile-panel-${key}`
}

// Ein Reiter-Panel: bleibt nach dem ersten Öffnen eingehängt (nur verborgen), damit ungespeicherte Eingaben im
// Formular den Wechsel überstehen.
function Panel({ id, tab, className, children }) {
  return (
    <div id={panelId(id)} role="tabpanel" aria-labelledby={`partner-profile-tab-${id}`} className={className} hidden={tab !== id}>
      {children}
    </div>
  )
}

// /profil (Phase P) - das eigene Profil eines Partner- oder Tierheim-Bereichs (api.partnerArea): oben
// die Statuskarte (Status, Checkliste, Veröffentlichen/Pausieren), darunter die Reiter "Angaben"
// (PartnerProfileForm), "Einblicke" (EinblickeEditor), bei Tierheimen "Beiträge" (PartnerPostsEditor) und "Kalender"
// (PartnerTermineEditor) und
// "Teilen" (Portal-Link, QR-Code, Website-Knopf, Social-Media-Text, der Weg zu den Visitenkarten und die Kunden-Gutscheine).
// Den Typ ändert nur der Betreiber. Wo "Zugang" nicht in der Hauptnavigation steht (Tierheim), führt ein
// Link dorthin.
export default function PartnerProfilePage({ family }) {
  const toast = useToast()
  const [profile, setProfile] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const showAccessLink = !navItemsFor(family).some((item) => item.to === ACCESS_ROUTE)
  const tabs = tabsFor(family)
  const requested = searchParams.get(TAB_PARAM)
  const tab = tabs.some((item) => item.key === requested) ? requested : TAB_ANGABEN.key
  const [openedTabs, setOpenedTabs] = useState(() => [tab])
  const name = profile?.name || family.partner?.name || family.name
  const typ = profile?.typ || family.partner?.typ

  useEffect(() => {
    let cancelled = false
    api.partnerArea
      .profile()
      .then((data) => {
        if (!cancelled) setProfile(data)
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Nach Logo-Upload oder neuen/gelöschten Einblicken: Status und Checkliste frisch vom Server holen.
  const refreshProfile = useCallback(() => {
    api.partnerArea
      .profile()
      .then(setProfile)
      .catch((err) => toast(`Status nicht aktualisiert: ${err.message}`))
  }, [toast])

  function handleLogoUploaded(logoUrl) {
    setProfile((current) => ({ ...current, logoUrl }))
    refreshProfile()
  }

  // Phase V4b: jede Änderung an den Bannerfotos antwortet mit der ganzen Liste samt Layout (Feedback-Runde).
  function handleBannerChange({ banner, layout }) {
    setProfile((current) => ({ ...current, banner, bannerLayout: layout ?? current.bannerLayout }))
  }

  // Reiter-Wechsel ersetzt den Eintrag im Verlauf (kein "Zurück" durch alle Reiter).
  function selectTab(key) {
    setSearchParams(key === TAB_ANGABEN.key ? {} : { [TAB_PARAM]: key }, { replace: true })
    setOpenedTabs((current) => (current.includes(key) ? current : [...current, key]))
  }

  return (
    <div className="page partner-profile-page">
      <header className="page-hero">
        <div>
          <span className="eyebrow">Partner-Profil</span>
          <h1>{name}</h1>
          {typ && (
            <p className="partner-profile-typ">
              Typ: <strong>{TYPE_LABELS[typ] || typ}</strong> – ändern kann ihn nur der Betreiber
            </p>
          )}
        </div>
      </header>

      {loadError && (
        <div className="error-banner" role="alert">
          {loadError}
        </div>
      )}
      {!profile && !loadError && <p className="muted page-loading">Lade …</p>}

      {profile && (
        <>
          <PartnerStatusCard profile={profile} onProfileChange={setProfile} />

          <div className="partner-profile-panels">
            {/* Phase U: dieselbe Reiter-Leiste wie in Entdecken und im Admin (TabBar, echte Tabliste). */}
            <TabBar
              tabs={tabs}
              current={tab}
              label="Profil-Bereich"
              idPrefix="partner-profile-tab"
              panelId={panelId}
              className="partner-profile-tabs"
              onSelect={selectTab}
            />
            <Panel id="angaben" tab={tab} className="partner-profile-angaben">
              <PartnerBannerEditor banner={profile.banner} layout={profile.bannerLayout} onChange={handleBannerChange} />
              <PartnerProfileForm profile={profile} onSaved={setProfile} onLogoUploaded={handleLogoUploaded} />
            </Panel>
            <Panel id="einblicke" tab={tab}>
              {openedTabs.includes('einblicke') && <EinblickeEditor onChanged={refreshProfile} />}
            </Panel>
            {tabs.includes(TAB_BEITRAEGE) && (
              <Panel id="beitraege" tab={tab}>
                {openedTabs.includes('beitraege') && (
                  <PartnerPostsEditor typ={typ} vertrauenswuerdig={Boolean(family.partner?.vertrauenswuerdig)} />
                )}
              </Panel>
            )}
            {tabs.includes(TAB_KALENDER) && (
              <Panel id="kalender" tab={tab}>
                {openedTabs.includes('kalender') && <PartnerTermineEditor />}
              </Panel>
            )}
            <Panel id="teilen" tab={tab} className="partner-profile-share">
              {openedTabs.includes('teilen') && (
                <>
                  <PartnerShareSection profile={profile} />
                  {/* Phase V5: Visitenkarten mit QR-Code zum Portal und optionalem Kunden-Gutschein. */}
                  <VisitenkartenTeaser />
                  <PartnerVoucherStacks />
                </>
              )}
            </Panel>
          </div>
        </>
      )}

      <aside className="partner-profile-notes">
        <p>Privat eine eigene Chronik führen? Dafür gibt es Kunden-Gutscheine.</p>
        {showAccessLink && (
          <Link to={ACCESS_ROUTE} className="btn btn-ghost">
            <Icon name="lock" />
            Zugang & Benachrichtigungen
          </Link>
        )}
      </aside>
    </div>
  )
}
