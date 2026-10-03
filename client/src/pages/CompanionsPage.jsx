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
import { isOwnHome, isVisit } from '../lib/visits.js'
import { withErlebtMitOffen } from '../lib/erlebtMit.js'
import ErlebtMitRequests from '../components/erlebtMit/ErlebtMitRequests.jsx'
import NewGuestsNotice from '../components/visits/NewGuestsNotice.jsx'
import Lightbox from '../components/Lightbox.jsx'

const ANNIVERSARY_WINDOW_DAYS = 30

// "In 5 Tagen: Nele ist 5 Jahre bei euch" / "Heute: Nele ist 5 Jahre bei euch!" - zu Besuch "hier" (where).
function anniversaryText(anniversary, where) {
  const name = displayName(anniversary.dog)
  const years = `${anniversary.years} ${anniversary.years === 1 ? 'Jahr' : 'Jahre'}`
  if (anniversary.daysUntil === 0) return `Heute: ${name} ist ${years} ${where}!`
  const days = `${anniversary.daysUntil} ${anniversary.daysUntil === 1 ? 'Tag' : 'Tagen'}`
  return `In ${days}: ${name} ist ${years} ${where}`
}

// „Meine Chronik“ – alle Wegbegleiter des eigenen Zuhauses über eine gemeinsame Zeitachse.
// onFamilyChange (Phase V2, optional): setFamily aus App.jsx - für die Zahl offener "Erlebt mit"-Anfragen (Badge).
export default function CompanionsPage({ family, onFamilyChange }) {
  const { words } = useTheme()
  const [dogs, setDogs] = useState(null)
  const [error, setError] = useState(null)
  // null: Modal zu. { livesWith: null, moreValues: null }: QuickAnimalForm. moreValues gesetzt:
  // "Mehr Angaben …" gewechselt, zeigt stattdessen DogForm damit vorbefüllt (wie in OverviewPage).
  const [animalForm, setAnimalForm] = useState(null)
  const today = useMemo(() => todayIso(), [])
  const navigate = useNavigate()
  const toast = useToast()
  // Phase V2: zu Besuch die Wegbegleiter des besuchten Zuhauses - nur ansehen, kein "Tier hinzufügen".
  const visiting = isVisit(family)
  const [photo, setPhoto] = useState(null)

  useEffect(() => {
    api
      .listDogs()
      .then(setDogs)
      .catch((err) => setError(err.message))
  }, [])

  const rows = useMemo(() => companionRows(dogs || [], today), [dogs, today])
  const loadingDogs = dogs === null && !error
  const where = visiting ? 'hier' : 'bei euch'
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
          {/* Audit V7a: zu Besuch nur der Name - "Zu Besuch bei …" sagen schon das Band und der Bereichswechsler; und
              die Tiere leben dort "hier", nicht "bei euch". */}
          <span className="eyebrow">{visiting ? family.name : 'Meine Chronik'}</span>
          <h1>Wegbegleiter</h1>
          <p className="page-lede">
            {span
              ? `Alle ${words.animals}, die ${where} gelebt haben und leben – seit ${span.from}.`
              : `Alle ${words.animals}, die ${where} gelebt haben und leben.`}
          </p>
          {/* Audit V7a: "Tierheime & Hundeschulen in der Nähe" steht im Fuß jeder Seite - hier nicht noch einmal. */}
          {!visiting && (
            <p className="hero-hint">
              {words.TheGroup} pflegst du {words.inTreeArticle} <Link to="/stammbaum">{words.treeLabel}</Link>.
            </p>
          )}
        </div>
        <div className="page-hero-side">
          {/* Audit V7a: schon beim Laden mit Platzhaltern - sonst schoben die Kennzahlen nach der Antwort Knopf und Seite
              nach unten. Ohne Tiere fallen sie danach weg. */}
          {(loadingDogs || rows.length > 0) && (
            <dl className="stats" aria-busy={loadingDogs || undefined}>
              <div>
                <dt>{words.animals} gesamt</dt>
                <dd>{loadingDogs ? '–' : rows.length}</dd>
              </div>
              <div>
                <dt>leben {where}</dt>
                <dd>{loadingDogs ? '–' : livingCount}</dd>
              </div>
              <div>
                <dt>{years === 1 ? 'Jahr' : 'Jahre'} gemeinsam</dt>
                <dd>{loadingDogs ? '–' : years}</dd>
              </div>
            </dl>
          )}
          {!visiting && (
            <div className="hero-actions">
              <button type="button" className="btn btn-primary btn-lg" onClick={openAnimalForm}>
                <Icon name="plus" />
                Tier hinzufügen
              </button>
            </div>
          )}
        </div>
      </header>

      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}

      {/* security-review V2 (M-3): neue Gäste bleiben sichtbar, bis „Passt“ oder „Gast entfernen“ - nur wenn /me welche meldet. */}
      {isOwnHome(family) && family.neueGaeste > 0 && <NewGuestsNotice onFamilyChange={onFamilyChange} />}

      {/* Phase V2: nur wenn /me offene "Erlebt mit"-Anfragen meldet - sonst keine zusätzliche Anfrage beim Laden. */}
      {isOwnHome(family) && family.erlebtMitOffen > 0 && (
        <ErlebtMitRequests
          onOpenPhoto={setPhoto}
          onCountChange={(offen) => onFamilyChange?.((current) => withErlebtMitOffen(current, offen))}
        />
      )}

      {anniversary && anniversary.daysUntil <= ANNIVERSARY_WINDOW_DAYS && (
        <div className="companions-anniversary">
          <p>{anniversaryText(anniversary, where)}</p>
        </div>
      )}

      {dogs && rows.length === 0 && (
        <div className="empty-state">
          <ThemeMark size={72} />
          <h3>Noch keine Wegbegleiter</h3>
          {/* Audit V7a: nicht noch einmal "Noch keine Wegbegleiter …", und einheitlich "ihr" - ohne Tiere der erste Schritt */}
          <p>
            {visiting
              ? `Hier sind noch keine ${words.animals} mit Einzugs- oder Geburtsdatum eingetragen.`
              : dogs.length === 0
              ? 'Legt euer erstes Tier an – mit Einzugs- oder Geburtsdatum erscheint es hier auf der Zeitleiste.'
              : `Hier erscheinen eure ${words.animals}, sobald ein Einzugs- oder Geburtsdatum eingetragen ist – ` +
                'tragt bei ihnen ein, seit wann sie bei euch sind.'}
          </p>
        </div>
      )}

      {dogs && rows.length > 0 && <CompanionTimeline rows={rows} span={span} today={today} where={where} />}

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

      <Lightbox src={photo} onClose={() => setPhoto(null)} />
    </div>
  )
}
