import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useTheme } from '../themes/ThemeProvider.jsx'
import ThemeMark from '../components/ThemeMark.jsx'
import CompanionTimeline from '../components/CompanionTimeline.jsx'
import QuickAnimalForm from '../components/QuickAnimalForm.jsx'
import DogForm from '../components/DogForm.jsx'
import Modal from '../components/Modal.jsx'
import Icon from '../components/Icon.jsx'
import { useToast } from '../components/Toast.jsx'
import { companionRows, nextAnniversary, yearSpan, yearsTogether } from '../lib/companions.js'
import { displayName } from '../lib/timeline.js'
import { todayIso } from '../lib/dates.js'

const ANNIVERSARY_WINDOW_DAYS = 30

// "In 5 Tagen: Nele ist 5 Jahre bei euch" / "Heute: Nele ist 5 Jahre bei euch!"
function anniversaryText(anniversary) {
  const name = displayName(anniversary.dog)
  const years = `${anniversary.years} ${anniversary.years === 1 ? 'Jahr' : 'Jahre'}`
  if (anniversary.daysUntil === 0) return `Heute: ${name} ist ${years} bei euch!`
  const days = `${anniversary.daysUntil} ${anniversary.daysUntil === 1 ? 'Tag' : 'Tagen'}`
  return `In ${days}: ${name} ist ${years} bei euch`
}

// „Meine Chronik“ – alle Wegbegleiter des eigenen Zuhauses über eine gemeinsame Zeitachse.
export default function CompanionsPage({ family }) {
  const { words } = useTheme()
  const [dogs, setDogs] = useState(null)
  const [error, setError] = useState(null)
  // null: Modal zu. { livesWith: null, moreValues: null }: QuickAnimalForm. moreValues gesetzt:
  // "Mehr Angaben …" gewechselt, zeigt stattdessen DogForm damit vorbefüllt (wie in OverviewPage).
  const [animalForm, setAnimalForm] = useState(null)
  const today = useMemo(() => todayIso(), [])
  const navigate = useNavigate()
  const toast = useToast()

  useEffect(() => {
    api
      .listDogs()
      .then(setDogs)
      .catch((err) => setError(err.message))
  }, [])

  const rows = useMemo(() => companionRows(dogs || [], today), [dogs, today])
  const span = useMemo(() => yearSpan(rows, today), [rows, today])
  const anniversary = useMemo(() => nextAnniversary(dogs || [], today), [dogs, today])
  const livingCount = useMemo(() => rows.filter((row) => row.ongoing).length, [rows])
  const years = useMemo(() => yearsTogether(rows), [rows])

  function openAnimalForm() {
    setAnimalForm({ livesWith: null, moreValues: null })
  }

  function closeAnimalForm() {
    setAnimalForm(null)
  }

  function announceCreated(dog) {
    closeAnimalForm()
    toast(`${displayName(dog)} ist jetzt dabei`)
    navigate(`/tier/${dog.id}`)
  }

  async function handleCreate(payload) {
    const dog = await api.createDog(payload)
    announceCreated(dog)
  }

  return (
    <div className="page">
      <header className="page-hero">
        <div>
          <span className="eyebrow">Meine Chronik</span>
          <h1>Wegbegleiter</h1>
          <p className="page-lede">
            {span
              ? `Alle ${words.animals}, die bei euch gelebt haben und leben – seit ${span.from}.`
              : `Alle ${words.animals}, die bei euch gelebt haben und leben.`}
          </p>
          <div className="hero-hints">
            <p className="hero-hint">
              {words.TheGroup} pflegst du {words.inTreeArticle} <Link to="/stammbaum">{words.treeLabel}</Link>.
            </p>
            <p className="hero-hint">
              <Link to="/umgebung">Tierheime & Hundeschulen in der Nähe →</Link>
            </p>
          </div>
        </div>
        <div className="page-hero-side">
          {rows.length > 0 && (
            <dl className="stats">
              <div>
                <dt>{words.animals} gesamt</dt>
                <dd>{rows.length}</dd>
              </div>
              <div>
                <dt>leben bei euch</dt>
                <dd>{livingCount}</dd>
              </div>
              <div>
                <dt>{years === 1 ? 'Jahr' : 'Jahre'} gemeinsam</dt>
                <dd>{years}</dd>
              </div>
            </dl>
          )}
          <div className="hero-actions">
            <button type="button" className="btn btn-primary btn-lg" onClick={openAnimalForm}>
              <Icon name="plus" />
              Tier hinzufügen
            </button>
          </div>
        </div>
      </header>

      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}

      {anniversary && anniversary.daysUntil <= ANNIVERSARY_WINDOW_DAYS && (
        <div className="companions-anniversary">
          <p>{anniversaryText(anniversary)}</p>
        </div>
      )}

      {dogs && rows.length === 0 && (
        <div className="empty-state">
          <ThemeMark size={72} />
          <h3>Noch keine Wegbegleiter</h3>
          <p>
            Noch keine Wegbegleiter mit Einzugs- oder Geburtsdatum. Trag bei deinen Tieren ein, seit wann sie bei euch
            sind.
          </p>
        </div>
      )}

      {dogs && rows.length > 0 && <CompanionTimeline rows={rows} span={span} today={today} />}

      <Modal open={Boolean(animalForm)} title="Neues Tier anlegen" onClose={closeAnimalForm}>
        {animalForm &&
          (animalForm.moreValues ? (
            <DogForm
              allDogs={dogs || []}
              ownFamilyId={family.id}
              initialValues={animalForm.moreValues}
              onSubmit={handleCreate}
              onCancel={closeAnimalForm}
            />
          ) : (
            <QuickAnimalForm
              allDogs={dogs || []}
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
