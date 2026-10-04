import { useEffect, useState } from 'react'
import { api } from '../../api'
import { useTheme } from '../../themes/ThemeProvider.jsx'
import { Link } from 'react-router-dom'
import { useIsDemo, useReadOnlyHint } from '../../lib/demo.js'
import { familySettingsRoute, isEditable } from '../../lib/areas.js'
import { roleLabel } from '../../lib/roles.js'
import { isOwnHome } from '../../lib/visits.js'
import useOpenArea from '../../hooks/useOpenArea.js'
import useDogShares from '../../hooks/useDogShares.js'
import Icon from '../Icon.jsx'
import Modal from '../Modal.jsx'
import JoinFamilyDialog from '../JoinFamilyDialog.jsx'
import HomeSwitchNotice from './HomeSwitchNotice.jsx'

function animalsText(count) {
  if (count === 0) return 'zeigt keines eurer Tiere'
  return count === 1 ? 'zeigt eines eurer Tiere' : `zeigt ${count} eurer Tiere`
}

// Eine Familie, in der der Haushalt Mitglied ist: Name, eigene Rolle, wie viele eigene Tiere dort zu sehen sind (nur aus
// „Mein Zuhause“ heraus bekannt), Öffnen (Gruppenseite) und Verwalten (Phase W, Schritt 2: Einstellungen › Familien ›
// [Familie] - dort stehen auch Verlassen, Leitung übergeben und Auflösen).
function MembershipRow({ membership, shownCount, onOpen }) {
  const { words } = useTheme()
  const details = [roleLabel(words, membership.rolle), shownCount === null ? null : animalsText(shownCount)].filter(Boolean)
  return (
    <li className="settings-row">
      <div className="settings-row-main">
        <strong>{membership.name}</strong>
        <span className="settings-row-sub">{details.join(' · ')}</span>
      </div>
      <div className="settings-row-actions">
        <button type="button" className="btn btn-ghost" onClick={() => onOpen(membership)}>
          Öffnen
        </button>
        <Link to={familySettingsRoute(membership.id)} className="btn btn-ghost" aria-label={`${membership.name} verwalten`}>
          <Icon name="settings" />
          Verwalten
        </Link>
      </div>
    </li>
  )
}

// Ein eigenes Tier mit je einem Häkchen pro Familie ("Wer sieht {Name}?", PUT /api/dogs/:id/shares über useDogShares).
// Als Gast teilt man nichts Neues (der Server sagt sonst 403) - eine bestehende Freigabe lässt sich trotzdem lösen.
function AnimalSharesRow({ dog, memberships, readOnly, onSaved }) {
  const { shares, saving, toggleShare } = useDogShares(dog, (next) => onSaved(dog.id, next))
  return (
    <li className="settings-row settings-animal">
      <div className="settings-row-main">
        <strong>{dog.name || 'Ohne Namen'}</strong>
      </div>
      <div className="settings-animal-checks" role="group" aria-label={`${dog.name || 'Tier'} zeigen in`}>
        {memberships.map((membership) => {
          const checked = shares.includes(membership.id)
          const guestOnly = membership.rolle === 'gast' && !checked
          return (
            <label key={membership.id} className="check" title={guestOnly ? 'Als Gast teilt ihr hier keine Tiere' : undefined}>
              <input
                type="checkbox"
                checked={checked}
                disabled={readOnly || saving || guestOnly}
                onChange={(event) => toggleShare(membership.id, event.target.checked)}
              />
              {membership.name}
            </label>
          )
        })}
      </div>
    </li>
  )
}

// Die eigenen Tiere mit ihren Familien-Freigaben (GET /api/dogs liefert sie im eigenen Zuhause mit) - nur aus
// „Mein Zuhause“ heraus; sonst null. updateShares hält die Liste nach einer gespeicherten Freigabe aktuell.
function useOwnAnimals(ownHome, homeId) {
  const [dogs, setDogs] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!ownHome) return undefined
    let active = true
    api
      .listDogs()
      .then((list) => active && setDogs(list.filter((dog) => isEditable(dog) && dog.family_id === homeId)))
      .catch((err) => active && setError(err.message))
    return () => {
      active = false
    }
  }, [ownHome, homeId])

  function updateShares(dogId, shares) {
    setDogs((list) => list.map((dog) => (dog.id === dogId ? { ...dog, shares } : dog)))
  }

  return { dogs, error, updateShares }
}

function MembershipsGroup({ memberships, shownCount, onOpen, onJoin }) {
  const { words } = useTheme()
  return (
    <section className="settings-group" aria-labelledby="settings-familien-title">
      <h2 id="settings-familien-title">{words.groups}, in denen ihr Mitglied seid</h2>
      {memberships.length === 0 ? (
        <p className="muted">{words.noGroupConnected}</p>
      ) : (
        <ul className="settings-list">
          {memberships.map((membership) => (
            <MembershipRow key={membership.id} membership={membership} shownCount={shownCount(membership.id)} onOpen={onOpen} />
          ))}
        </ul>
      )}
      <div className="settings-actions">
        <button type="button" className="btn btn-ghost" onClick={onJoin}>
          <Icon name="plus" />
          {words.group} beitreten oder gründen
        </button>
      </div>
    </section>
  )
}

function AnimalsGroup({ family, ownHome, animals, memberships, readOnly, onFamilyChange }) {
  const { words } = useTheme()
  const readOnlyHint = useReadOnlyHint()
  const { dogs, error, updateShares } = animals
  let content
  if (!ownHome) {
    content = (
      <HomeSwitchNotice family={family} onFamilyChange={onFamilyChange}>
        Welche eurer Tiere ihr wo zeigt, stellt ihr in „Mein Zuhause“ ein.
      </HomeSwitchNotice>
    )
  } else if (memberships.length === 0) {
    content = <p className="muted">Sobald ihr in einer {words.group} seid, wählt ihr hier, welche Tiere dort zu sehen sind.</p>
  } else {
    content = (
      <>
        {error && (
          <div className="error-banner" role="alert">
            {error}
          </div>
        )}
        {dogs && dogs.length === 0 && <p className="muted">Ihr habt noch keine eigenen Tiere eingetragen.</p>}
        {dogs && dogs.length > 0 && (
          <ul className="settings-list">
            {dogs.map((dog) => (
              <AnimalSharesRow key={dog.id} dog={dog} memberships={memberships} readOnly={readOnly} onSaved={updateShares} />
            ))}
          </ul>
        )}
        <p className="field-hint">Gezeigt werden das Tier und alle {words.entries}, die nicht privat sind.</p>
        {readOnly && <p className="field-hint">{readOnlyHint}</p>}
      </>
    )
  }
  return (
    <section className="settings-group" aria-labelledby="settings-tiere-title">
      <h2 id="settings-tiere-title">Eure Tiere in {words.groupsDative}</h2>
      {content}
    </section>
  )
}

// Einstellungen → Familien: die Familien, in denen man Mitglied ist (Öffnen, Verwalten), welche eigenen Tiere wo zu sehen
// sind (dieselbe Freigabe wie "Wer sieht {Name}?" auf der Tierseite) und Beitreten/Gründen (JoinFamilyDialog); die
// befreundeten Zuhause stehen seit Phase W (Schritt 2) unter "Mein Zuhause". Tiere teilen geht nur aus
// „Mein Zuhause“ heraus (der Server erlaubt es nur dort) - in einer Familie steht stattdessen der Weg dorthin.
export default function FamilienSection({ family, onFamilyChange }) {
  const { words } = useTheme()
  const readOnly = useIsDemo()
  const openArea = useOpenArea(family)
  const ownHome = isOwnHome(family)
  const memberships = family.memberships || []
  const animals = useOwnAnimals(ownHome, family.id)
  const [joinOpen, setJoinOpen] = useState(false)

  const shownCount = (membershipId) =>
    animals.dogs ? animals.dogs.filter((dog) => (dog.shares || []).includes(membershipId)).length : null

  return (
    <div className="settings-block">
      <MembershipsGroup memberships={memberships} shownCount={shownCount} onOpen={(item) => openArea(item.id)} onJoin={() => setJoinOpen(true)} />
      <AnimalsGroup
        family={family}
        ownHome={ownHome}
        animals={animals}
        memberships={memberships}
        readOnly={readOnly}
        onFamilyChange={onFamilyChange}
      />
      <Modal open={joinOpen} title={`${words.group} beitreten oder gründen`} onClose={() => setJoinOpen(false)}>
        <JoinFamilyDialog onChange={onFamilyChange} onClose={() => setJoinOpen(false)} />
      </Modal>
    </div>
  )
}
