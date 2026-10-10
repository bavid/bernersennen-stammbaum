import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { useIsDemo, useReadOnlyHint } from '../lib/demo.js'
import { formatDateLong } from '../lib/dates.js'
import { LIMIT_HINT, MAX_TERMINE, TERMINE_HINT, formatTagKurz } from '../lib/termine.js'
import ConfirmButton from './ConfirmButton.jsx'
import Icon from './Icon.jsx'
import TerminForm from './TerminForm.jsx'
import TerminOverview from './TerminOverview.jsx'
import { useToast } from './Toast.jsx'
import { t } from '../lib/i18n/index.js'

const DEMO_HINT_ID = 'partner-termine-demo-hint'

// Einzelne Termine, deren Tag vorbei ist - sie zählen weiter zur Obergrenze, bis der Partner sie löscht.
function PastTermine({ termine, demoHintId, onDelete }) {
  if (termine.length === 0) return null
  return (
    <details className="termin-past">
      <summary>{t('Vergangene Termine ({n})', { n: termine.length })}</summary>
      <ul className="termin-past-list">
        {termine.map((termin) => (
          <li key={termin.id}>
            <span>
              <strong>{termin.titel}</strong> – {formatDateLong(termin.serieBis || termin.datum)}
            </span>
            <ConfirmButton
              className="termin-action"
              onConfirm={() => onDelete(termin)}
              ariaLabel={t('{title} löschen', { title: termin.titel })}
              disabled={Boolean(demoHintId)}
              describedBy={demoHintId}
            />
          </li>
        ))}
      </ul>
    </details>
  )
}

// Der Kalender eines Partners (Phase V4a) - auf /kalender (Partner) bzw. als Reiter "Kalender" im Profil (Tierheim):
// oben Hinweis und Zähler "x von 50", dann das Formular (Anlegen/Bearbeiten) oder die Übersicht der nächsten zwölf
// Monate nach Monat (TerminOverview). Jede Änderung antwortet mit der ganzen Liste vom Server - die ersetzt den Stand
// hier. In der Demo ist alles sichtbar, aber gesperrt. showTitle (Audit V7a): auf /kalender steht direkt darüber die
// Seitenüberschrift "Kalender" - dort bleibt "Eure Termine" nur für Screenreader; im Profil-Reiter der Tierheime sichtbar.
export default function PartnerTermineEditor({ showTitle = true }) {
  const isDemo = useIsDemo()
  const readOnlyHint = useReadOnlyHint()
  const toast = useToast()
  const [data, setData] = useState(undefined)
  const [loadError, setLoadError] = useState(null)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(null) // null, 'new' oder ein Termin
  const [busyId, setBusyId] = useState(null)
  const termine = data?.termine ?? []
  const termineById = useMemo(() => new Map(termine.map((termin) => [termin.id, termin])), [termine])
  const isFull = termine.length >= (data?.max ?? MAX_TERMINE)
  const demoHintId = isDemo ? DEMO_HINT_ID : undefined

  useEffect(() => {
    let cancelled = false
    api.partnerArea
      .termine()
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Eine Änderung am Server - die Antwort ist die neue Liste. busy: die Id, deren Knöpfe solange gesperrt sind.
  async function change(request, { busy = null, message }) {
    setError(null)
    setBusyId(busy)
    try {
      setData(await request())
      toast(message)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  function handleSaved(saved, { created }) {
    setData(saved)
    setEditing(null)
    setError(null)
    toast(created ? t('Termin angelegt – er steht jetzt auf eurem Portal.') : t('Gespeichert – die Änderung ist sofort online.'))
  }

  function handleToggleAbsage(item) {
    const label = t('{title} am {date}', { title: item.titel, date: formatTagKurz(item.datum) })
    if (item.abgesagt) {
      return change(() => api.partnerArea.wiederTermin(item.terminId, item.datum), { busy: item.terminId, message: t('{label} findet wieder statt.', { label }) })
    }
    return change(() => api.partnerArea.absagenTermin(item.terminId, item.datum), { busy: item.terminId, message: t('{label} fällt aus.', { label }) })
  }

  function handleDelete(termin) {
    return change(() => api.partnerArea.deleteTermin(termin.id), { busy: termin.id, message: t('Termin gelöscht.') })
  }

  return (
    <section className="partner-termine" aria-labelledby="partner-termine-title">
      <div className="partner-termine-head">
        <div>
          <h2 id="partner-termine-title" className={showTitle ? undefined : 'visually-hidden'}>
            {t('Eure Termine')}
          </h2>
          <p className="partner-termine-hint">{t(TERMINE_HINT)}</p>
        </div>
        {data && (
          <span className="pill partner-termine-count" aria-live="polite">
            {t('{n} von {max}', { n: termine.length, max: data.max })}
          </span>
        )}
      </div>

      {editing ? (
        <TerminForm
          key={editing === 'new' ? 'new' : editing.id}
          termin={editing === 'new' ? null : editing}
          today={data.heute}
          onSaved={handleSaved}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <div className="partner-termine-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setEditing('new')}
            disabled={isDemo || isFull || !data}
            aria-describedby={demoHintId}
          >
            <Icon name="plus" /> {t('Termin anlegen')}
          </button>
          {isDemo && (
            <p id={DEMO_HINT_ID} className="field-hint">
              {readOnlyHint}
            </p>
          )}
          {!isDemo && isFull && <p className="field-hint">{t(LIMIT_HINT)}</p>}
        </div>
      )}

      {error && !editing && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {loadError && (
        <div className="error-banner" role="alert">
          {loadError}
        </div>
      )}
      {data === undefined && !loadError && <p className="muted">{t('Lade …')}</p>}
      {data && !editing && (
        <>
          <TerminOverview
            vorkommen={data.vorkommen}
            termineById={termineById}
            busyId={busyId}
            demoHintId={demoHintId}
            onEdit={setEditing}
            onDelete={handleDelete}
            onToggleAbsage={handleToggleAbsage}
          />
          <PastTermine termine={termine.filter((termin) => termin.abgelaufen)} demoHintId={demoHintId} onDelete={handleDelete} />
        </>
      )}
    </section>
  )
}
