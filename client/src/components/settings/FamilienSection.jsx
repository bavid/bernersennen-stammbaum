import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api'
import { useTheme } from '../../themes/ThemeProvider.jsx'
import { useIsDemo, useReadOnlyHint } from '../../lib/demo.js'
import { familySettingsRoute, isEditable } from '../../lib/areas.js'
import { animalCountText, areaCounts, withShareChange } from '../../lib/animalCounts.js'
import { familyAnimals } from '../../lib/familyGroups.js'
import { roleLabel } from '../../lib/roles.js'
import useOpenArea from '../../hooks/useOpenArea.js'
import useShareMatrix from '../../hooks/useShareMatrix.js'
import Icon from '../Icon.jsx'
import Modal from '../Modal.jsx'
import JoinFamilyDialog from '../JoinFamilyDialog.jsx'
import FamilyShareCard from '../shares/FamilyShareCard.jsx'
import ShareNote from '../shares/ShareNote.jsx'

const SHARE_NOTE_ID = 'settings-share-note'

// Eine Familie, in der der Haushalt Mitglied ist: Name, eigene Rolle und die Zahl der Tiere dort ("21 Tiere · davon 4 von
// euch", lib/animalCounts.js - dieselbe Zählung wie überall), Öffnen (Gruppenseite) und Verwalten (Einstellungen › Familien
// › [Familie] - dort stehen auch Verlassen, Leitung übergeben und Auflösen).
function MembershipRow({ membership, counts, onOpen }) {
  const { words } = useTheme()
  const details = [roleLabel(words, membership.rolle), animalCountText(counts, words)].filter(Boolean)
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

// Die eigenen Tiere mit ihren Familien-Freigaben (GET /api/dogs liefert sie im eigenen Zuhause mit - die Einstellungen
// spielen immer dort, AreaRoutes SettingsRoute). Ohne Platzhalter unbekannter Eltern (wie das Raster und die Zählung des
// Servers). updateShares hält die Liste und die Zahlen in me (onFamilyChange, funktional) nach einer gespeicherten Freigabe
// aktuell.
function useOwnAnimals(homeId, onFamilyChange) {
  const [dogs, setDogs] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    api
      .listDogs()
      .then((list) => active && setDogs(familyAnimals(list).filter((dog) => isEditable(dog) && dog.family_id === homeId)))
      .catch((err) => active && setError(err.message))
    return () => {
      active = false
    }
  }, [homeId])

  function updateShares(dogId, shares) {
    const dog = dogs?.find((entry) => entry.id === dogId)
    if (dog) onFamilyChange((current) => withShareChange(current, dog, dog.shares, shares))
    setDogs((list) => list.map((entry) => (entry.id === dogId ? { ...entry, shares } : entry)))
  }

  return { dogs, error, updateShares }
}

function MembershipsGroup({ family, memberships, onOpen, onJoin }) {
  const { words } = useTheme()
  return (
    <section className="settings-group" aria-labelledby="settings-familien-title">
      <h2 id="settings-familien-title">Eure {words.groups}</h2>
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
          {words.group} beitreten oder gründen
        </button>
      </div>
    </section>
  )
}

// Je Familie eine Karte "In Familie Sonnenhang zeigt ihr:" mit einem Schalter je eigenem Tier (Phase W, Schritt 2 - vorher
// eine Zeile je Tier mit Kästchen je Familie, die niemand verstand), darunter derselbe Satz wie auf der Tierseite.
function ShareCards({ dogs, memberships, readOnly, onSaved }) {
  const matrix = useShareMatrix(dogs, onSaved)
  return (
    <>
      <div className="share-cards">
        {memberships.map((membership) => (
          <FamilyShareCard
            key={membership.id}
            membership={membership}
            animals={dogs}
            matrix={matrix}
            readOnly={readOnly}
            describedBy={SHARE_NOTE_ID}
          />
        ))}
      </div>
      <ShareNote id={SHARE_NOTE_ID} />
    </>
  )
}

function AnimalsGroup({ animals, memberships, readOnly }) {
  const { words } = useTheme()
  const readOnlyHint = useReadOnlyHint()
  const { dogs, error, updateShares } = animals
  let content
  if (memberships.length === 0) {
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
        {dogs && dogs.length > 0 && <ShareCards dogs={dogs} memberships={memberships} readOnly={readOnly} onSaved={updateShares} />}
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
// befreundeten Zuhause stehen seit Phase W (Schritt 2) unter "Mein Zuhause". Tiere teilen geht nur aus „Mein Zuhause“
// heraus (der Server erlaubt es nur dort) - dorthin wechselt das AreaGate der Route (AreaRoutes SettingsRoute) vorher.
export default function FamilienSection({ family, onFamilyChange }) {
  const { words } = useTheme()
  const readOnly = useIsDemo()
  const openArea = useOpenArea(family)
  const memberships = family.memberships || []
  const animals = useOwnAnimals(family.id, onFamilyChange)
  const [joinOpen, setJoinOpen] = useState(false)

  return (
    <div className="settings-block">
      <MembershipsGroup
        family={family}
        memberships={memberships}
        onOpen={(item) => openArea(item.id)}
        onJoin={() => setJoinOpen(true)}
      />
      <AnimalsGroup animals={animals} memberships={memberships} readOnly={readOnly} />
      <Modal open={joinOpen} title={`${words.group} beitreten oder gründen`} onClose={() => setJoinOpen(false)}>
        <JoinFamilyDialog onChange={onFamilyChange} onClose={() => setJoinOpen(false)} />
      </Modal>
    </div>
  )
}
