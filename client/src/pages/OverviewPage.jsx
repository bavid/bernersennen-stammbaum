import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import PedigreeTree from '../components/PedigreeTree.jsx'
import DogForm from '../components/DogForm.jsx'
import Modal from '../components/Modal.jsx'
import Icon from '../components/Icon.jsx'
import BernerMark from '../components/BernerMark.jsx'
import ActivityFeed from '../components/ActivityFeed.jsx'
import RenameFamilyForm from '../components/RenameFamilyForm.jsx'
import { nextTermin } from '../lib/notes.js'
import { useToast } from '../components/Toast.jsx'
import { layoutPedigree, collectNodes } from '../lib/pedigree.js'

function Stats({ dogs, allDogs }) {
  const generations = useMemo(() => layoutPedigree(collectNodes(dogs, allDogs)).length, [dogs, allDogs])
  const entries = dogs.reduce((sum, dog) => sum + (dog.timeline_count || 0), 0)
  const items = [
    { value: dogs.length, label: dogs.length === 1 ? 'Hund' : 'Hunde' },
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

export default function OverviewPage({ family, onFamilyChange }) {
  const [dogs, setDogs] = useState(null)
  const [allDogs, setAllDogs] = useState([])
  const [activity, setActivity] = useState(null)
  const [error, setError] = useState(null)
  const [formOpen, setFormOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const navigate = useNavigate()
  const toast = useToast()

  async function loadDogs() {
    const [own, all, recent, notes] = await Promise.all([
      api.listDogs(),
      api.listAllDogs(),
      api.recentActivity(4),
      api.listNotes()
    ])
    setDogs(own)
    setAllDogs(all)
    setActivity({ entries: recent, termin: nextTermin(notes) })
  }

  useEffect(() => {
    loadDogs().catch((err) => setError(err.message))
  }, [])

  function handleRenamed(renamed) {
    setRenameOpen(false)
    onFamilyChange(renamed)
    toast(`Das Rudel heißt jetzt „${renamed.name}“`)
  }

  async function handleCreate(payload) {
    const dog = await api.createDog(payload)
    setFormOpen(false)
    toast(`${dog.name} ist jetzt Teil des Stammbaums`)
    navigate(`/hund/${dog.id}`)
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
              aria-label="Rudelname ändern"
              title="Rudelname ändern"
            >
              <Icon name="edit" />
            </button>
          </div>
          <p className="page-lede">
            Damit wir wissen, was die anderen treiben: Klick einen Hund an und schau nach, wie es ihm geht – oder erzähl,
            was er gerade erlebt.
          </p>
        </div>
        <div className="page-hero-side">
          {dogs && dogs.length > 0 && <Stats dogs={dogs} allDogs={allDogs} />}
          <button type="button" className="btn btn-primary btn-lg" onClick={() => setFormOpen(true)}>
            <Icon name="plus" />
            Hund hinzufügen
          </button>
        </div>
      </header>

      {error && <div className="error-banner" role="alert">{error}</div>}

      {dogs && dogs.length === 0 && (
        <div className="empty-state">
          <BernerMark size={72} />
          <h3>Euer Stammbaum ist noch leer</h3>
          <p>Fangt mit dem ältesten Hund an, den ihr kennt – Eltern könnt ihr jederzeit ergänzen.</p>
          <button type="button" className="btn btn-primary" onClick={() => setFormOpen(true)}>
            <Icon name="plus" />
            Ersten Hund anlegen
          </button>
        </div>
      )}

      {dogs && dogs.length > 0 && activity && <ActivityFeed entries={activity.entries} termin={activity.termin} />}

      {dogs && dogs.length > 0 && <PedigreeTree dogs={dogs} allDogs={allDogs} />}

      <Modal open={renameOpen} title="Rudelname ändern" onClose={() => setRenameOpen(false)}>
        <RenameFamilyForm family={family} onRenamed={handleRenamed} onCancel={() => setRenameOpen(false)} />
      </Modal>

      <Modal open={formOpen} title="Neuen Hund anlegen" onClose={() => setFormOpen(false)}>
        <DogForm allDogs={allDogs} ownFamilyId={family.id} onSubmit={handleCreate} onCancel={() => setFormOpen(false)} />
      </Modal>
    </div>
  )
}
