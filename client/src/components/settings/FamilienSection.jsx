import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTheme } from '../../themes/ThemeProvider.jsx'
import { SETTINGS_ROUTE, familySettingsRoute } from '../../lib/areas.js'
import { animalCountText, areaCounts } from '../../lib/animalCounts.js'
import { roleLabel } from '../../lib/roles.js'
import useOpenArea from '../../hooks/useOpenArea.js'
import Icon from '../Icon.jsx'
import Modal from '../Modal.jsx'
import JoinFamilyDialog from '../JoinFamilyDialog.jsx'
import { useT } from '../../lib/i18n/index.js'

// Eine Familie, in der der Haushalt Mitglied ist: Name, eigene Rolle und die Zahl der Tiere dort ("21 Tiere · davon 4 von
// euch", lib/animalCounts.js - dieselbe Zählung wie überall), Öffnen (Gruppenseite) und Verwalten (Einstellungen › Familien
// › [Familie] - dort stehen auch Verlassen, Leitung übergeben und Auflösen).
function MembershipRow({ membership, counts, onOpen }) {
  const { words } = useTheme()
  const t = useT()
  const details = [roleLabel(words, membership.rolle), animalCountText(counts, words)].filter(Boolean)
  return (
    <li className="settings-row">
      <div className="settings-row-main">
        <strong>{membership.name}</strong>
        <span className="settings-row-sub">{details.join(' · ')}</span>
      </div>
      <div className="settings-row-actions">
        <button type="button" className="btn btn-ghost" onClick={() => onOpen(membership)}>
          {t('settings.families.open')}
        </button>
        <Link to={familySettingsRoute(membership.id)} className="btn btn-ghost" aria-label={t('settings.families.manageLabel', { name: membership.name })}>
          <Icon name="settings" />
          {t('settings.families.manage')}
        </Link>
      </div>
    </li>
  )
}

function MembershipsGroup({ family, memberships, onOpen, onJoin }) {
  const { words } = useTheme()
  const t = useT()
  return (
    <section className="settings-group" aria-labelledby="settings-familien-title">
      <h2 id="settings-familien-title">{t('settings.families.title', words)}</h2>
      {memberships.length === 0 ? (
        <p className="muted">{words.noGroupConnected}</p>
      ) : (
        <ul className="settings-list">
          {memberships.map((membership) => (
            <MembershipRow
              key={membership.id}
              membership={membership}
              counts={areaCounts(family, membership.id)}
              onOpen={onOpen}
            />
          ))}
        </ul>
      )}
      <div className="settings-actions">
        <button type="button" className="btn btn-ghost" onClick={onJoin}>
          <Icon name="plus" />
          {t('settings.families.join', words)}
        </button>
      </div>
    </section>
  )
}

// Welche eigenen Tiere eine Familie sieht, steht seit „Wer sieht was“ nur noch dort (je Tier und je Familie, derselbe
// Schalter) - hier der Weg dorthin, damit es keine zweite Stelle mit denselben Schaltern gibt.
function AnimalsPointer() {
  const { words } = useTheme()
  const t = useT()
  return (
    <section className="settings-group" aria-labelledby="settings-tiere-title">
      <h2 id="settings-tiere-title">{t('settings.families.animalsTitle', words)}</h2>
      <p className="muted">{t('Welche eurer Tiere eine Familie sieht, stellt ihr unter „Wer sieht was“ ein – je Tier oder je Familie.')}</p>
      <div className="settings-actions">
        <Link to={`${SETTINGS_ROUTE}?bereich=sichtbarkeit&ansicht=verbindungen`} className="btn btn-ghost">
          <Icon name="eye" />
          {t('Wer sieht was')}
        </Link>
      </div>
    </section>
  )
}

// Einstellungen → Familien: die Familien, in denen man Mitglied ist (Öffnen, Verwalten), der Weg zu „Wer sieht was“ (welche
// eigenen Tiere wo zu sehen sind) und Beitreten/Gründen (JoinFamilyDialog); die
// befreundeten Zuhause stehen seit Phase W (Schritt 2) unter "Mein Zuhause". Tiere teilen geht nur aus „Mein Zuhause“
// heraus (der Server erlaubt es nur dort) - dorthin wechselt das AreaGate der Route (AreaRoutes SettingsRoute) vorher.
export default function FamilienSection({ family, onFamilyChange }) {
  const { words } = useTheme()
  const t = useT()
  const openArea = useOpenArea(family)
  const memberships = family.memberships || []
  const [joinOpen, setJoinOpen] = useState(false)

  return (
    <div className="settings-block">
      <MembershipsGroup
        family={family}
        memberships={memberships}
        onOpen={(item) => openArea(item.id)}
        onJoin={() => setJoinOpen(true)}
      />
      <AnimalsPointer />
      <Modal open={joinOpen} title={t('settings.families.join', words)} onClose={() => setJoinOpen(false)}>
        <JoinFamilyDialog onChange={onFamilyChange} onClose={() => setJoinOpen(false)} />
      </Modal>
    </div>
  )
}
