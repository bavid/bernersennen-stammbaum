import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useTheme } from '../themes/ThemeProvider.jsx'
import PedigreeTree from '../components/PedigreeTree.jsx'
import DogForm from '../components/DogForm.jsx'
import QuickAnimalForm from '../components/QuickAnimalForm.jsx'
import Modal from '../components/Modal.jsx'
import Icon from '../components/Icon.jsx'
import ThemeMark from '../components/ThemeMark.jsx'
import ActivityFeed from '../components/ActivityFeed.jsx'
import FamilySettings from '../components/FamilySettings.jsx'
import { nextTermin } from '../lib/notes.js'
import { useToast } from '../components/Toast.jsx'
import { layoutPedigree, collectNodes } from '../lib/pedigree.js'
import { displayName } from '../lib/timeline.js'

function Stats({ dogs, allDogs, links }) {
  const generations = useMemo(() => layoutPedigree(collectNodes(dogs, allDogs), links).length, [dogs, allDogs, links])
  const entries = dogs.reduce((sum, dog) => sum + (dog.timeline_count || 0), 0)
  const dogCount = dogs.filter((dog) => (dog.tierart || 'hund') === 'hund').length
  const others = dogs.length - dogCount
  const items = [
    { value: dogCount, label: dogCount === 1 ? 'Hund' : 'Hunde' },
    ...(others ? [{ value: others, label: others === 1 ? 'weiteres Tier' : 'weitere Tiere' }] : []),
    { value: generations, label: generations === 1 ? 'Generation' : 'Generationen' },
    { value: entries, label: entries === 1 ? 'Erinnerung' : 'Erinnerungen' }
  ]
  return (
    <dl className="stats">
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}

export default function OverviewPage({ family, onFamilyChange, onInvite }) {
  const { theme, words } = useTheme()
  const [dogs, setDogs] = useState(null)
  const [allDogs, setAllDogs] = useState([])
  const [links, setLinks] = useState([])
  const [activity, setActivity] = useState(null)
  const [error, setError] = useState(null)
  // null: Modal zu. { livesWith, moreValues: null }: QuickAnimalForm (livesWith fest vorgegeben, sonst leer).
  // moreValues gesetzt: "Mehr Angaben …" gewechselt, zeigt stattdessen DogForm damit vorbefüllt.
  const [animalForm, setAnimalForm] = useState(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const navigate = useNavigate()
  const toast = useToast()

  async function loadDogs() {
    const [own, all, recent, notes, dogLinks] = await Promise.all([
      api.listDogs(),
      api.listAllDogs(),
      api.recentActivity(4),
      api.listNotes(),
      api.listLinks()
    ])
    setDogs(own)
    setAllDogs(all)
    setLinks(dogLinks)
    setActivity({ entries: recent, termin: nextTermin(notes) })
  }

  useEffect(() => {
    loadDogs().catch((err) => setError(err.message))
  }, [])

  // Ist der aktive Bereich gerade das eigene Zuhause (family.id === family.home.id), zeigt der
  // Bereichswechsler den Haushaltsnamen als Zusatz zu "Meine Chronik" – der muss beim Umbenennen
  // mitziehen, sonst zeigt er nach dem Speichern noch den alten Namen.
  function handleRenamed(renamed) {
    setSettingsOpen(false)
    const merged = { ...family, ...renamed }
    if (family.home?.id === family.id) merged.home = { ...family.home, name: renamed.name }
    onFamilyChange(merged)
    toast(`${words.TheGroup} heißt jetzt „${renamed.name}“`)
  }

  function handleThemeSaved(updated) {
    setSettingsOpen(false)
    onFamilyChange({ ...family, ...updated })
    toast('Neues Aussehen gespeichert')
  }

  function openAnimalForm(livesWith = null) {
    setAnimalForm({ livesWith, moreValues: null })
  }

  function closeAnimalForm() {
    setAnimalForm(null)
  }

  function announceCreated(dog) {
    closeAnimalForm()
    toast(`${displayName(dog)} ist jetzt dabei`)
    navigate(`/tier/${dog.id}`)
  }

  // "Mehr Angaben …" aus QuickAnimalForm: volles DogForm übernimmt selbst das Anlegen
  async function handleCreate(payload) {
    const dog = await api.createDog(payload)
    announceCreated(dog)
  }

  return (
    <div className="page">
      <header className="page-hero">
        <div>
          <span className="eyebrow">Stammbaum</span>
          <div className="page-title-row">
            <h1>{family.name}</h1>
            <button
              type="button"
              className="icon-btn title-edit"
              onClick={() => setSettingsOpen(true)}
              aria-label={words.groupSettings}
              title={words.groupSettings}
            >
              <Icon name="edit" />
            </button>
          </div>
          <p className="page-lede">{theme.texts.overviewLede}</p>
          <p className="hero-hint">
            <Link to="/umgebung">Tierheime & Hundeschulen in der Nähe →</Link>
          </p>
        </div>
        <div className="page-hero-side">
          {dogs && dogs.length > 0 && <Stats dogs={dogs} allDogs={allDogs} links={links} />}
          <div className="hero-actions">
            <button type="button" className="btn btn-primary btn-lg" onClick={() => openAnimalForm()}>
              <Icon name="plus" />
              Tier hinzufügen
            </button>
            <button type="button" className="btn btn-ghost btn-lg" onClick={onInvite}>
              <Icon name="send" />
              Jemanden einladen
            </button>
          </div>
        </div>
      </header>

      {error && <div className="error-banner" role="alert">{error}</div>}

      {dogs && dogs.length === 0 && (
        <div className="empty-state">
          <ThemeMark size={72} />
          <h3>Euer Stammbaum ist noch leer</h3>
          <p>Fangt mit dem ältesten Tier an, das ihr kennt – Eltern könnt ihr jederzeit ergänzen.</p>
          <button type="button" className="btn btn-primary" onClick={() => openAnimalForm()}>
            <Icon name="plus" />
            Erstes Tier anlegen
          </button>
        </div>
      )}

      {dogs && dogs.length > 0 && activity && <ActivityFeed entries={activity.entries} termin={activity.termin} />}

      {dogs && dogs.length > 0 && (
        <PedigreeTree dogs={dogs} allDogs={allDogs} links={links} onAddMitbewohner={openAnimalForm} />
      )}

      <Modal open={settingsOpen} title={words.groupSettings} onClose={() => setSettingsOpen(false)}>
        <FamilySettings
          family={family}
          onRenamed={handleRenamed}
          onChange={handleThemeSaved}
          onFamilyChange={onFamilyChange}
          onCancel={() => setSettingsOpen(false)}
        />
      </Modal>

      <Modal open={Boolean(animalForm)} title="Neues Tier anlegen" onClose={closeAnimalForm}>
        {animalForm &&
          (animalForm.moreValues ? (
            <DogForm
              allDogs={allDogs}
              ownFamilyId={family.id}
              initialValues={animalForm.moreValues}
              onSubmit={handleCreate}
              onCancel={closeAnimalForm}
            />
          ) : (
            <QuickAnimalForm
              allDogs={allDogs}
              livesWith={animalForm.livesWith}
              onCreated={announceCreated}
              onCancel={closeAnimalForm}
              onMore={(moreValues) => setAnimalForm((current) => ({ ...current, moreValues }))}
            />
          ))}
      </Modal>
    </div>
  )
}
