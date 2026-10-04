import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { useTheme } from '../themes/ThemeProvider.jsx'
import Icon from '../components/Icon.jsx'
import Modal from '../components/Modal.jsx'
import Lightbox from '../components/Lightbox.jsx'
import DogForm from '../components/DogForm.jsx'
import TabBar from '../components/TabBar.jsx'
import { useToast } from '../components/Toast.jsx'
import DogHead from '../components/dog/DogHead.jsx'
import DogChronicle, { COMPOSER_ID } from '../components/dog/DogChronicle.jsx'
import DogInfos, { SHARE_PANEL_TITLE_ID, TAKE_OVER_ID } from '../components/dog/DogInfos.jsx'
import DogRelatives from '../components/dog/DogRelatives.jsx'
import ShelterPlacement from '../components/dog/ShelterPlacement.jsx'
import useDogPage from '../hooks/useDogPage.js'
import useTabParam from '../hooks/useTabParam.js'
import { hasRole } from '../lib/roles.js'
import { animalsRoute } from '../lib/areas.js'
import { CHRONICLE_TAB, DOG_TAB_PARAM, dogTabs, safeFromPath, visibleInNames } from '../lib/dogProfile.js'
import { displayName } from '../lib/timeline.js'

export { ParentLink } from '../components/dog/DogRelatives.jsx'

const NEW_ENTRY_PARAM = 'neu'
const PANEL_ID = 'tier-panel'

// Zurück dorthin, woher man kam (location.state.from, z. B. vom Start-Feed), sonst zu den Tieren - im Zuhause /tiere, in
// einer Familie oder zu Besuch deren Reiter "Tiere".
function BackLink({ family }) {
  const { words } = useTheme()
  const { state } = useLocation()
  const from = safeFromPath(state?.from)
  return (
    <Link to={from || animalsRoute(family)} className="back-link">
      <Icon name="arrowLeft" /> {from ? 'Zurück' : words.animals}
    </Link>
  )
}

// Rollen (Phase R, lib/roles.js): in einer Familie schreibt ab Mitglied, löscht Tiere ab Stellvertretung - außerhalb
// (Zuhause, Tierheim) ist man immer Leitung. Übernehmen: GET /dogs liefert kannUebernehmen, die Detailansicht (noch) nicht -
// dann dieselbe Regel wie server/routes/dogs.js canTakeOverInArea (Leitungs-Mitglied mit eigenem Zuhause, Tier der Familie).
function rightsFor(family, dog) {
  const inGroup = family.art === 'rudel'
  return {
    canWrite: dog.isOwn && hasRole(family, 'mitglied'),
    canDeleteDog: !inGroup || hasRole(family, 'stellvertretung'),
    canTakeOver:
      dog.kannUebernehmen ??
      (inGroup && dog.canEdit && family.home?.art === 'zuhause' && family.home.id !== family.id && hasRole(family, 'leitung')),
    ownHomeAnimal: dog.canEdit && family.art === 'zuhause'
  }
}

// ?neu=1 (z. B. "Erzählen" von außerhalb): einmal je Tier das Erzählen öffnen und den Parameter wieder entfernen.
function useNewEntryParam(dog, canWrite, onOpen) {
  const [searchParams, setSearchParams] = useSearchParams()
  const handled = useRef(null)
  const wanted = searchParams.get(NEW_ENTRY_PARAM) === '1'
  useEffect(() => {
    if (!dog || !wanted || handled.current === dog.id) return
    handled.current = dog.id
    if (canWrite) onOpen()
    setSearchParams(
      (existing) => {
        const next = new URLSearchParams(existing)
        next.delete(NEW_ENTRY_PARAM)
        next.delete(DOG_TAB_PARAM)
        return next
      },
      { replace: true }
    )
  }, [dog, wanted, canWrite, onOpen, setSearchParams])
}

// Nach einem Reiterwechsel aus dem Kopf (Erzählen, ⋯): zum Ziel scrollen; ein Ziel mit tabIndex bekommt den Fokus.
function usePendingTarget(current) {
  const [pending, setPending] = useState(null)
  useEffect(() => {
    if (!pending) return undefined
    const frame = requestAnimationFrame(() => {
      const target = document.getElementById(pending)
      if (!target) return
      target.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
      if (target.hasAttribute('tabindex')) target.focus({ preventScroll: true })
      setPending(null)
    })
    return () => cancelAnimationFrame(frame)
  }, [pending, current])
  return setPending
}

// /tier/:id (Phase W, Schritt 2): ein Tierprofil wie eine Profilseite - kompakter Kopf (DogHead) und Reiter in der Adresse
// (?reiter=): Chronik (Standard; #entry-N erzwingt sie), Infos, Verwandte (Berner: Stammbaum); eigene Tiere eines Tierheims
// Chronik · Vermittlung · Infos. ?neu=1 öffnet gleich das Erzählen.
export default function DogDetailPage({ family, onFamilyChange }) {
  const { theme } = useTheme()
  const { id } = useParams()
  const navigate = useNavigate()
  const { hash } = useLocation()
  const toast = useToast()
  const page = useDogPage(id)
  const { dog, setDog } = page
  const [composerOpen, setComposerOpen] = useState(false)
  const [editingDog, setEditingDog] = useState(false)
  const [photo, setPhoto] = useState(null)
  const tabs = dogTabs({ shelter: family.art === 'tierheim' && Boolean(dog?.canEdit), familiesView: Boolean(theme.familiesView) })
  const [selected, select] = useTabParam(DOG_TAB_PARAM, tabs)
  const current = hash.startsWith('#entry-') ? CHRONICLE_TAB : selected
  const setPending = usePendingTarget(current)
  const rights = dog ? rightsFor(family, dog) : null

  useEffect(() => setComposerOpen(false), [id])
  const openComposerFromParam = useCallback(() => {
    setComposerOpen(true)
    setPending(COMPOSER_ID)
  }, [setPending])
  useNewEntryParam(dog, Boolean(rights?.canWrite), openComposerFromParam)

  if (page.error) {
    return (
      <div className="page">
        <div className="error-banner" role="alert">
          {page.error}
        </div>
        <BackLink family={family} />
      </div>
    )
  }
  if (!dog) return <div className="page page-loading" aria-busy="true" />

  const { canWrite, canDeleteDog, canTakeOver, ownHomeAnimal } = rights
  const name = displayName(dog)

  function goTo(tab, target) {
    if (current !== tab || hash) select(tab)
    setPending(target)
  }

  function openComposer() {
    setComposerOpen(true)
    goTo(CHRONICLE_TAB, COMPOSER_ID)
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/tier/${dog.id}?in=${family.id}`)
      toast('Link kopiert')
    } catch {
      toast('Kopieren ging nicht – bitte die Adresse oben im Browser kopieren.')
    }
  }

  const menuItems = [
    ownHomeAnimal && { key: 'wer', label: `Wer sieht ${name}?`, icon: 'users', onSelect: () => goTo('infos', SHARE_PANEL_TITLE_ID) },
    canTakeOver && { key: 'uebernehmen', label: 'In „Mein Zuhause“ übernehmen', icon: 'home', onSelect: () => goTo('infos', TAKE_OVER_ID) },
    { key: 'link', label: 'Link kopieren', icon: 'copy', onSelect: copyLink }
  ].filter(Boolean)

  async function handleUpdateDog({ housemateId, ...payload }) {
    await api.updateDog(dog.id, payload)
    setEditingDog(false)
    await page.load()
    toast('Angaben gespeichert')
  }

  async function handleDeleteDog() {
    await api.deleteDog(dog.id)
    toast(`${dog.name} wurde entfernt`)
    navigate(animalsRoute(family))
  }

  const shared = { dog, setDog, family, allDogs: page.allDogs, canWrite, reload: page.load }

  return (
    <div className="page dog-page">
      <BackLink family={family} />

      <DogHead
        dog={dog}
        canWrite={canWrite}
        visibleIn={ownHomeAnimal ? visibleInNames(dog, family.memberships) : []}
        menuItems={menuItems}
        onShowVisibility={() => goTo('infos', SHARE_PANEL_TITLE_ID)}
        onTell={openComposer}
        onEdit={() => setEditingDog(true)}
        onOpenPhoto={setPhoto}
      />

      <TabBar
        tabs={tabs}
        current={current}
        label={`Bereiche von ${name}`}
        idPrefix="tier-tab"
        panelId={PANEL_ID}
        className="dog-tab-bar"
        onSelect={select}
      />
      <div className="dog-panel" id={PANEL_ID} role="tabpanel" aria-labelledby={`tier-tab-${current}`}>
        {current === CHRONICLE_TAB && (
          <DogChronicle
            dog={dog}
            family={family}
            entries={page.entries}
            setEntries={page.setEntries}
            breedingEvents={page.breedingEvents}
            canWrite={canWrite}
            composerOpen={composerOpen}
            onComposerChange={setComposerOpen}
            onOpenPhoto={setPhoto}
          />
        )}
        {current === 'infos' && <DogInfos {...shared} canTakeOver={canTakeOver} onFamilyChange={onFamilyChange} />}
        {current === 'verwandte' && <DogRelatives {...shared} />}
        {current === 'vermittlung' && <ShelterPlacement dog={dog} setDog={setDog} />}
      </div>

      <Modal open={editingDog} title={`${name} bearbeiten`} onClose={() => setEditingDog(false)}>
        <DogForm
          dog={dog}
          allDogs={page.allDogs}
          ownFamilyId={family.id}
          onSubmit={handleUpdateDog}
          onDelete={canDeleteDog ? handleDeleteDog : undefined}
          onCancel={() => setEditingDog(false)}
        />
      </Modal>

      <Lightbox src={photo} onClose={() => setPhoto(null)} />
    </div>
  )
}
