import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useTheme } from '../themes/ThemeProvider.jsx'
import PedigreeTree from '../components/PedigreeTree.jsx'
import DogForm from '../components/DogForm.jsx'
import Modal from '../components/Modal.jsx'
import Icon from '../components/Icon.jsx'
import ThemeMark from '../components/ThemeMark.jsx'
import ActivityFeed from '../components/ActivityFeed.jsx'
import RenameFamilyForm from '../components/RenameFamilyForm.jsx'
import { nextTermin } from '../lib/notes.js'
import { useToast } from '../components/Toast.jsx'
import { layoutPedigree, collectNodes } from '../lib/pedigree.js'

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
  const [formOpen, setFormOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
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

  function handleRenamed(renamed) {
    setRenameOpen(false)
    onFamilyChange(renamed)
    toast(`${words.TheGroup} heißt jetzt „${renamed.name}“`)
  }

  async function handleCreate(payload) {
    const dog = await api.createDog(payload)
    setFormOpen(false)
    toast(`${dog.name} ist jetzt Teil des Stammbaums`)
    navigate(`/tier/${dog.id}`)
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
              onClick={() => setRenameOpen(true)}
              aria-label={words.renameGroup}
              title={words.renameGroup}
            >
              <Icon name="edit" />
            </button>
          </div>
          <p className="page-lede">{theme.texts.overviewLede}</p>
        </div>
        <div className="page-hero-side">
          {dogs && dogs.length > 0 && <Stats dogs={dogs} allDogs={allDogs} links={links} />}
          <div className="hero-actions">
            <button type="button" className="btn btn-primary btn-lg" onClick={() => setFormOpen(true)}>
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
          <button type="button" className="btn btn-primary" onClick={() => setFormOpen(true)}>
            <Icon name="plus" />
            Erstes Tier anlegen
          </button>
        </div>
      )}

      {dogs && dogs.length > 0 && activity && <ActivityFeed entries={activity.entries} termin={activity.termin} />}

      {dogs && dogs.length > 0 && <PedigreeTree dogs={dogs} allDogs={allDogs} links={links} />}

      <Modal open={renameOpen} title={words.renameGroup} onClose={() => setRenameOpen(false)}>
        <RenameFamilyForm family={family} onRenamed={handleRenamed} onCancel={() => setRenameOpen(false)} />
      </Modal>

      <Modal open={formOpen} title="Neues Tier anlegen" onClose={() => setFormOpen(false)}>
        <DogForm allDogs={allDogs} ownFamilyId={family.id} onSubmit={handleCreate} onCancel={() => setFormOpen(false)} />
      </Modal>
    </div>
  )
}
