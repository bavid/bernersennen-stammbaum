import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import Icon from '../components/Icon.jsx'
import PartnerStatusCard from '../components/PartnerStatusCard.jsx'
import PartnerProfileForm from '../components/PartnerProfileForm.jsx'
import EinblickeEditor from '../components/EinblickeEditor.jsx'
import { useToast } from '../components/Toast.jsx'
import { TYPE_LABELS } from '../lib/partnerTypes.js'
import { navItemsFor } from '../lib/navItems.js'

const ACCESS_ROUTE = '/zugang'

const TABS = [
  { key: 'angaben', label: 'Angaben' },
  { key: 'einblicke', label: 'Einblicke' }
]

// Reiter wie im Rest der App (JoinFamilyDialog, LoginPage): .segmented mit aria-pressed. Ein Reiter
// bleibt nach dem ersten Öffnen eingehängt (nur verborgen), damit ungespeicherte Eingaben im Formular
// den Wechsel überstehen.
function ProfileTabs({ tab, onSelect }) {
  return (
    <div className="segmented partner-profile-tabs" role="group" aria-label="Profil-Bereich">
      {TABS.map((item) => (
        <button
          type="button"
          key={item.key}
          aria-pressed={tab === item.key}
          aria-controls={`partner-profile-panel-${item.key}`}
          onClick={() => onSelect(item.key)}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

// /profil (Phase P) - das eigene Profil eines Partner- oder Tierheim-Bereichs (api.partnerArea): oben
// die Statuskarte (Status, Checkliste, Veröffentlichen/Pausieren), darunter die Reiter "Angaben"
// (PartnerProfileForm) und "Einblicke" (EinblickeEditor). Den Typ ändert nur der Betreiber. Wo "Zugang"
// nicht in der Hauptnavigation steht (Tierheim), führt ein Link dorthin.
export default function PartnerProfilePage({ family }) {
  const toast = useToast()
  const [profile, setProfile] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [tab, setTab] = useState('angaben')
  const [openedTabs, setOpenedTabs] = useState(['angaben'])
  const showAccessLink = !navItemsFor(family).some((item) => item.to === ACCESS_ROUTE)
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

  function selectTab(key) {
    setTab(key)
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
            <ProfileTabs tab={tab} onSelect={selectTab} />
            <div id="partner-profile-panel-angaben" hidden={tab !== 'angaben'}>
              <PartnerProfileForm profile={profile} onSaved={setProfile} onLogoUploaded={handleLogoUploaded} />
            </div>
            <div id="partner-profile-panel-einblicke" hidden={tab !== 'einblicke'}>
              {openedTabs.includes('einblicke') && <EinblickeEditor onChanged={refreshProfile} />}
            </div>
          </div>
        </>
      )}

      <aside className="partner-profile-notes">
        <p>Privat eine eigene Chronik führen? Dafür gibt es Kunden-Gutscheine.</p>
        {showAccessLink && (
          <Link to={ACCESS_ROUTE} className="btn btn-ghost">
            <Icon name="lock" />
            Zugang & Schlüssel verwalten
          </Link>
        )}
      </aside>
    </div>
  )
}
