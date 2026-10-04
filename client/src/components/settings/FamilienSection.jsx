import { useEffect, useState } from 'react'
import { api } from '../../api'
import { useTheme } from '../../themes/ThemeProvider.jsx'
import { useIsDemo, useReadOnlyHint } from '../../lib/demo.js'
import { isEditable } from '../../lib/areas.js'
import { roleLabel } from '../../lib/roles.js'
import { isOwnHome } from '../../lib/visits.js'
import useOpenArea from '../../hooks/useOpenArea.js'
import useDogShares from '../../hooks/useDogShares.js'
import { useToast } from '../Toast.jsx'
import ConfirmButton from '../ConfirmButton.jsx'
import Icon from '../Icon.jsx'
import Modal from '../Modal.jsx'
import JoinFamilyDialog from '../JoinFamilyDialog.jsx'
import VisitSection from '../visits/VisitSection.jsx'
import HomeSwitchNotice from './HomeSwitchNotice.jsx'

const READ_ONLY_HINT_ID = 'settings-familien-hint'

function animalsText(count) {
  if (count === 0) return 'zeigt keines eurer Tiere'
  return count === 1 ? 'zeigt eines eurer Tiere' : `zeigt ${count} eurer Tiere`
}

// Eine Familie, in der der Haushalt Mitglied ist: Name, eigene Rolle, wie viele eigene Tiere dort zu sehen sind (nur aus
// „Meine Chronik“ heraus bekannt), Öffnen und Verlassen. Verlassen wie bisher mit zweitem Klick - die einzige Leitung
// lässt der Server nicht gehen (409, "Übergib zuerst die Leitung …"), die Meldung steht dann an der Zeile.
function MembershipRow({ membership, shownCount, readOnly, onOpen, onLeave }) {
  const { words } = useTheme()
  const [error, setError] = useState(null)
  const details = [roleLabel(words, membership.rolle), shownCount === null ? null : animalsText(shownCount)].filter(Boolean)

  async function handleLeave() {
    setError(null)
    try {
      await onLeave(membership)
    } catch (err) {
      setError(err.message)
    }
  }

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
        <ConfirmButton
          label="Verlassen"
          confirmLabel="Wirklich verlassen?"
          icon="logout"
          ariaLabel={`${membership.name} verlassen`}
          disabled={readOnly}
          describedBy={readOnly ? READ_ONLY_HINT_ID : undefined}
          onConfirm={handleLeave}
        />
      </div>
      {error && (
        <p className="settings-row-error" role="alert">
          {error}
        </p>
      )}
    </li>
  )
}

// Ein eigenes Tier mit je einem Häkchen pro Familie ("In Familien zeigen", PUT /api/dogs/:id/shares über useDogShares).
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
// „Meine Chronik“ heraus; sonst null. updateShares hält die Liste nach einer gespeicherten Freigabe aktuell.
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

function MembershipsGroup({ memberships, shownCount, readOnly, onOpen, onLeave, onJoin }) {
  const { words } = useTheme()
  const readOnlyHint = useReadOnlyHint()
  return (
    <section className="settings-group" aria-labelledby="settings-familien-title">
      <h2 id="settings-familien-title">{words.groups}, in denen ihr Mitglied seid</h2>
      {memberships.length === 0 ? (
        <p className="muted">{words.noGroupConnected}</p>
      ) : (
        <ul className="settings-list">
          {memberships.map((membership) => (
            <MembershipRow
              key={membership.id}
              membership={membership}
              shownCount={shownCount(membership.id)}
              readOnly={readOnly}
              onOpen={onOpen}
              onLeave={onLeave}
            />
          ))}
        </ul>
      )}
      {readOnly && (
        <p id={READ_ONLY_HINT_ID} className="field-hint">
          {readOnlyHint}
        </p>
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
  const { dogs, error, updateShares } = animals
  let content
  if (!ownHome) {
    content = (
      <HomeSwitchNotice family={family} onFamilyChange={onFamilyChange}>
        Welche eurer Tiere ihr wo zeigt, stellt ihr in „Meiner Chronik“ ein.
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
        <p className="field-hint">Gezeigt werden das Tier und alle Einträge, die nicht als privat markiert sind.</p>
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

// Einstellungen → Familien: die Familien, in denen man Mitglied ist (Öffnen, Verlassen), welche eigenen Tiere wo zu sehen
// sind (dieselbe Freigabe wie "In Familien zeigen" auf der Tierseite), Beitreten/Gründen (JoinFamilyDialog) und die
// befreundeten Zuhause (VisitSection, nur die Listen: Besuch beenden, Gast entfernen). Tiere teilen geht nur aus
// „Meine Chronik“ heraus (der Server erlaubt es nur dort) - in einer Familie steht stattdessen der Weg dorthin.
export default function FamilienSection({ family, onFamilyChange }) {
  const { words } = useTheme()
  const readOnly = useIsDemo()
  const toast = useToast()
  const openArea = useOpenArea(family)
  const ownHome = isOwnHome(family)
  const memberships = family.memberships || []
  const animals = useOwnAnimals(ownHome, family.id)
  const [joinOpen, setJoinOpen] = useState(false)

  async function handleLeave(membership) {
    const me = await api.leaveFamily(membership.id)
    onFamilyChange(me)
    toast(`Du hast „${membership.name}“ verlassen. Eure geteilten Tiere sind dort nicht mehr sichtbar.`)
  }

  const shownCount = (membershipId) =>
    animals.dogs ? animals.dogs.filter((dog) => (dog.shares || []).includes(membershipId)).length : null

  return (
    <div className="settings-block">
      <MembershipsGroup
        memberships={memberships}
        shownCount={shownCount}
        readOnly={readOnly}
        onOpen={(item) => openArea(item.id)}
        onLeave={handleLeave}
        onJoin={() => setJoinOpen(true)}
      />
      <AnimalsGroup
        family={family}
        ownHome={ownHome}
        animals={animals}
        memberships={memberships}
        readOnly={readOnly}
        onFamilyChange={onFamilyChange}
      />
      {!family.zuBesuch && (
        <section className="settings-group" aria-labelledby="settings-besuche-title">
          <h2 id="settings-besuche-title">Befreundete Zuhause</h2>
          <p className="muted">Wen ihr besucht und wer bei euch zu Gast ist. Neue Besuche verabredet ihr über „Jemanden einladen“.</p>
          <VisitSection listsOnly onFamilyChange={onFamilyChange} />
        </section>
      )}
      <Modal open={joinOpen} title={`${words.group} beitreten oder gründen`} onClose={() => setJoinOpen(false)}>
        <JoinFamilyDialog onChange={onFamilyChange} onClose={() => setJoinOpen(false)} />
      </Modal>
    </div>
  )
}
