import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api'
import { useTheme } from '../../themes/ThemeProvider.jsx'
import { useIsDemo, useReadOnlyHint } from '../../lib/demo.js'
import { familySettingsRoute, isEditable } from '../../lib/areas.js'
import { animalCountText, areaCounts, withOwnShared } from '../../lib/animalCounts.js'
import { roleLabel } from '../../lib/roles.js'
import { isOwnHome } from '../../lib/visits.js'
import useOpenArea from '../../hooks/useOpenArea.js'
import useShareMatrix from '../../hooks/useShareMatrix.js'
import Icon from '../Icon.jsx'
import Modal from '../Modal.jsx'
import JoinFamilyDialog from '../JoinFamilyDialog.jsx'
import FamilyShareCard from '../shares/FamilyShareCard.jsx'
import ShareNote from '../shares/ShareNote.jsx'
import HomeSwitchNotice from './HomeSwitchNotice.jsx'

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

// Die eigenen Tiere mit ihren Familien-Freigaben (GET /api/dogs liefert sie im eigenen Zuhause mit) - nur aus
// „Mein Zuhause“ heraus; sonst null. updateShares hält die Liste nach einer gespeicherten Freigabe aktuell (Zahlen).
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

function MembershipsGroup({ family, memberships, ownShared, onOpen, onJoin }) {
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
              counts={withOwnShared(areaCounts(family, membership.id), ownShared(membership.id))}
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

  // Eigene Tiere, die gerade in der Familie zu sehen sind - nach einer Änderung der Schalter sofort neu gezählt.
  const ownShared = (membershipId) =>
    animals.dogs ? animals.dogs.filter((dog) => (dog.shares || []).includes(membershipId)).length : null

  return (
    <div className="settings-block">
      <MembershipsGroup
        family={family}
        memberships={memberships}
        ownShared={ownShared}
        onOpen={(item) => openArea(item.id)}
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
      <Modal open={joinOpen} title={`${words.group} beitreten oder gründen`} onClose={() => setJoinOpen(false)}>
        <JoinFamilyDialog onChange={onFamilyChange} onClose={() => setJoinOpen(false)} />
      </Modal>
    </div>
  )
}
