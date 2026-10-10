import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useTheme } from '../themes/ThemeProvider.jsx'
import Icon from './Icon.jsx'
import ParentPicker from './ParentPicker.jsx'
import PhotoPicker from './PhotoPicker.jsx'
import ConfirmButton from './ConfirmButton.jsx'
import { formatDateLong, todayIso } from '../lib/dates.js'
import { shortName } from '../lib/timeline.js'
import { isEditable } from '../lib/areas.js'
import { t } from '../lib/i18n/index.js'
import { Button } from './ui/index.js'

const EMPTY_FORM = { mutterDogId: '', vater: { dogId: '', freitext: '' }, datum: todayIso(), wurfInfo: '', fotos: [] }

// initialMother: Id einer Hündin, die vorgewählt sein soll (LittersPage ?mutter=) - nur, wenn sie zur Auswahl steht.
// focusOnOpen: über einen Link geöffnet - dann springt die Seite zum Formular, und der Fokus steht in der ersten Angabe.
function BreedingForm({ ownDogs, allDogs, initialMother = null, focusOnOpen = false, onCreated, onCancel }) {
  const { theme, words } = useTheme()
  const formRef = useRef(null)
  const motherRef = useRef(null)
  // ownDogs (aus listDogs) enthält seit dem Teilen auch hierher geteilte, nicht bearbeitbare Tiere –
  // ein Deckakt lässt sich aber nur mit eigenen Hündinnen eintragen (der Server würde alles andere ablehnen).
  const mothers = ownDogs.filter((d) => d.geschlecht === 'huendin' && (d.tierart || 'hund') === 'hund' && isEditable(d))
  const [form, setForm] = useState(() => ({
    ...EMPTY_FORM,
    mutterDogId: mothers.some((dog) => dog.id === initialMother) ? initialMother : ''
  }))
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const update = (patch) => setForm((current) => ({ ...current, ...patch }))

  useEffect(() => {
    if (!focusOnOpen) return
    formRef.current?.scrollIntoView?.({ block: 'start' })
    motherRef.current?.focus({ preventScroll: true })
  }, [focusOnOpen])

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    setSaving(true)
    try {
      const created = await api.createBreedingEvent({
        mutterDogId: form.mutterDogId,
        vaterDogId: form.vater.dogId || null,
        vaterFreitext: form.vater.freitext || null,
        datum: form.datum,
        wurfInfo: form.wurfInfo,
        fotoUrls: form.fotos
      })
      onCreated(created)
      setForm({ ...EMPTY_FORM, mutterDogId: form.mutterDogId })
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="form-stack card breeding-form" onSubmit={handleSubmit} ref={formRef}>
      <h3>{words.addMating}</h3>
      {error && <div className="error-banner" role="alert">{error}</div>}
      <div className="field">
        <label className="field-label" htmlFor="mutter">
          {t('Hündin')}
        </label>
        <select
          id="mutter"
          ref={motherRef}
          value={form.mutterDogId}
          onChange={(e) => update({ mutterDogId: e.target.value ? Number(e.target.value) : '' })}
          required
        >
          <option value="">{t('– Hündin {ofGroup} wählen –', { ofGroup: words.ofGroup })}</option>
          {mothers.map((dog) => (
            <option key={dog.id} value={dog.id}>
              {dog.name}
            </option>
          ))}
        </select>
      </div>
      <ParentPicker label={t('Rüde')} sex="ruede" dogs={allDogs} value={form.vater} onChange={(vater) => update({ vater })} />
      <div className="field">
        <label className="field-label" htmlFor="breeding-date">
          {t('Datum {matingOf}', { matingOf: words.matingOf })} <span className="muted">{t('(auch geplant)')}</span>
        </label>
        <input id="breeding-date" type="date" value={form.datum} onChange={(e) => update({ datum: e.target.value })} required />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="wurf-info">
          {t('Notizen')}
        </label>
        <textarea
          id="wurf-info"
          value={form.wurfInfo}
          onChange={(e) => update({ wurfInfo: e.target.value })}
          placeholder={theme.texts.matingNotesPlaceholder}
        />
      </div>
      <div className="field">
        <span className="field-label">{t('Fotos')}</span>
        <PhotoPicker value={form.fotos} onChange={(fotos) => update({ fotos })} onBusyChange={setUploading} onError={setError} />
      </div>
      <div className="form-actions">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t('Abbrechen')}
        </Button>
        <Button type="submit" disabled={saving || uploading || !form.mutterDogId}>
          {saving ? t('Speichere …') : t('Eintragen')}
        </Button>
      </div>
    </form>
  )
}

export function BreedingEvent({ event, onDelete, onOpenPhoto }) {
  const { words } = useTheme()
  const father = event.vater_name || event.vater_freitext
  return (
    <li className="breeding-event">
      <time className="breeding-date" dateTime={event.datum}>
        {words.mating} · {formatDateLong(event.datum)}
      </time>
      <div className="breeding-pair">
        <Link to={`/tier/${event.mutter_dog_id}`}>{shortName(event.mutter_name)}</Link>
        <Icon name="heart" />
        {event.vater_dog_id ? (
          <Link to={`/tier/${event.vater_dog_id}`}>{shortName(father)}</Link>
        ) : (
          <span>{father || t('unbekannter Rüde')}</span>
        )}
      </div>
      {event.wurf_info && <p className="breeding-info">{event.wurf_info}</p>}
      {event.foto_urls.length > 0 && (
        <div className="entry-photos count-3">
          {event.foto_urls.map((url) => (
            <button type="button" key={url} className="entry-photo" onClick={() => onOpenPhoto(url)} aria-label={t('Foto vergrößern')}>
              <img src={url} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}
      {onDelete && (
        <div className="breeding-actions">
          <ConfirmButton onConfirm={() => onDelete(event)} label={t('Löschen')} />
        </div>
      )}
    </li>
  )
}

// Das bisherige Zuchtbuch als Abschnitt der Würfe-Seite: für die, die züchten – alle anderen sehen es zugeklappt.
// canWrite (Phase R): ohne Schreibrecht (Gast in einer Familie) kein "Deckakt eintragen"; Löschen hängt an onDelete.
// Phase U: im Standard-Auftritt "Verpaarungen" statt "Zuchtbuch" und "Verpaarung" statt "Deckakt".
// request (Familienbande 2, LittersPage ?verpaarung=neu&mutter=): { key, mother } - öffnet das Formular (mit der Hündin
// vorgewählt), springt dorthin und setzt den Fokus hinein; ein neuer key öffnet es erneut.
export default function BreedingRecords({ events, ownDogs, allDogs, canWrite = true, request = null, onCreated, onDelete, onOpenPhoto }) {
  const { theme, words } = useTheme()
  const [writing, setWriting] = useState(false)

  useEffect(() => {
    if (request && canWrite) setWriting(true)
  }, [request, canWrite])

  return (
    <section className="breeding-records" aria-labelledby="breeding-records-title">
      <div className="section-head">
        <h2 id="breeding-records-title" className="section-title">
          {words.breedingBook}
        </h2>
        {canWrite && !writing && (
          <Button type="button" variant="ghost" onClick={() => setWriting(true)}>
            <Icon name="plus" /> {words.addMating}
          </Button>
        )}
      </div>
      <p className="muted">{theme.texts.breedingIntro}</p>
      {writing && (
        <BreedingForm
          key={request?.key ?? 0}
          ownDogs={ownDogs}
          allDogs={allDogs}
          initialMother={request?.mother ?? null}
          focusOnOpen={Boolean(request)}
          onCreated={(created) => {
            onCreated(created)
            setWriting(false)
          }}
          onCancel={() => setWriting(false)}
        />
      )}
      {events.length > 0 && (
        <details className="breeding-all">
          <summary>
            {t('Alle {matings} ({n})', { matings: words.matings, n: events.length })}
          </summary>
          <ol className="breeding-list">
            {events.map((event) => (
              <BreedingEvent key={event.id} event={event} onDelete={onDelete} onOpenPhoto={onOpenPhoto} />
            ))}
          </ol>
        </details>
      )}
    </section>
  )
}
