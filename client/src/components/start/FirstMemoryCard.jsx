import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { api } from '../../api'
import Avatar from '../Avatar.jsx'
import Icon from '../Icon.jsx'
import usePhotoUpload from '../../hooks/usePhotoUpload.js'
import { composerAnimals } from './StartComposer.jsx'
import { useIsDemo, useReadOnlyHint } from '../../lib/demo.js'
import { rememberFirstMemorySkip } from '../../lib/firstMemory.js'
import { readSetting } from '../../lib/storage.js'
import { displayName } from '../../lib/timeline.js'
import { todayIso } from '../../lib/dates.js'
import { t } from '../../lib/i18n/index.js'
import { Button } from '../ui/index.js'

const NO_ANIMAL = 'Bitte wählt ein Tier.'
const NO_NAME = 'Bitte tragt den Namen eures Tiers ein.'
const NO_CONTENT = 'Bitte wählt ein Foto oder schreibt einen Satz.'

// Was fehlt noch? { message, field } mit dem Feld, auf das der Fokus springt - oder null.
function missing({ animals, dogId, name, photo, sentence }) {
  if (animals.length === 0 && !name.trim()) return { message: NO_NAME, field: 'name' }
  if (animals.length > 0 && !dogId) return { message: NO_ANIMAL, field: 'animal' }
  if (!photo && !sentence.trim()) return { message: NO_CONTENT, field: 'sentence' }
  return null
}

function PhotoStep({ photo, disabled, onPhoto, onError, onBusy }) {
  const { busy, upload } = usePhotoUpload({ onUploaded: (urls) => onPhoto(urls[0]), onError, onBusyChange: onBusy })
  return (
    <li className="first-memory-step">
      <span className="first-memory-step-label">{t('Ein Foto')}</span>
      <div className="first-memory-photo-row">
        {photo && (
          <span className="first-memory-photo">
            <img src={photo} alt={t('Euer Foto')} width={56} height={56} />
          </span>
        )}
        <label className={`btn btn-ghost first-memory-pick${disabled || busy ? ' is-disabled' : ''}`}>
          <Icon name="camera" />
          {busy ? t('Lädt …') : photo ? t('Anderes Foto') : t('Foto wählen')}
          <input
            type="file"
            accept="image/*"
            className="visually-hidden"
            disabled={disabled || busy}
            onChange={(event) => upload(event.target.files)}
          />
        </label>
      </div>
    </li>
  )
}

function AnimalStep({ animals, dogId, onPick, name, onName, disabled }) {
  if (animals.length === 0) {
    return (
      <li className="first-memory-step">
        <label className="first-memory-step-label" htmlFor="first-memory-name">
          {t('Wie heißt euer Tier?')}
        </label>
        <input id="first-memory-name" type="text" maxLength={80} autoComplete="off" value={name} disabled={disabled} onChange={(e) => onName(e.target.value)} />
      </li>
    )
  }
  return (
    <li className="first-memory-step">
      <span className="first-memory-step-label" id="first-memory-animal-label">
        {t('Um wen geht es?')}
      </span>
      <div className="start-composer-animals first-memory-animals" role="group" aria-labelledby="first-memory-animal-label">
        {animals.map((dog) => (
          <button key={dog.id} type="button" className="start-composer-animal first-memory-animal" aria-pressed={dog.id === dogId} onClick={() => onPick(dog.id)}>
            <Avatar dog={dog} size={32} />
            <span>{displayName(dog)}</span>
          </button>
        ))}
      </div>
    </li>
  )
}

// Speichern: erst (falls nötig) das Tier, dann die Erinnerung. Ein schon angelegtes Tier wird bei einem zweiten Versuch
// wiederverwendet - nie zwei Tiere für eine Erinnerung.
function useFirstMemorySave(family, onCreated) {
  const [createdDog, setCreatedDog] = useState(null)
  return async function save({ dogId, name, photo, sentence }) {
    let dog = createdDog
    if (!dogId && !dog) {
      dog = await api.createDog({ name: name.trim(), fotoUrl: photo || null })
      setCreatedDog(dog)
    }
    const entry = await api.createTimelineEntry({
      dogId: dogId || dog.id,
      autorName: readSetting('autorName', '') || family.name,
      datum: todayIso(),
      titel: t('Unsere erste Erinnerung'),
      text: sentence.trim(),
      fotoUrls: photo ? [photo] : []
    })
    onCreated?.(entry, dog)
  }
}

function SentenceStep({ value, onChange, disabled }) {
  return (
    <li className="first-memory-step">
      <label className="first-memory-step-label" htmlFor="first-memory-sentence">
        {t('Ein Satz dazu')}
      </label>
      <input
        id="first-memory-sentence"
        type="text"
        maxLength={300}
        autoComplete="off"
        placeholder={t('z. B. Erster Spaziergang am See.')}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    </li>
  )
}

function Actions({ readOnly, saving, uploading, onSkip }) {
  const readOnlyHint = useReadOnlyHint()
  return (
    <>
      <div className="first-memory-actions">
        <Button type="submit" disabled={readOnly || saving || uploading}>
          {saving ? t('Wird festgehalten …') : t('Festhalten')}
        </Button>
        <Button type="button" variant="ghost" className="first-memory-skip" onClick={onSkip} disabled={saving}>
          {t('Später')}
        </Button>
      </div>
      {readOnly && <p className="first-memory-hint">{readOnlyHint}</p>}
    </>
  )
}

const FIELD_SELECTORS = { name: '#first-memory-name', animal: '.first-memory-animal', sentence: '#first-memory-sentence' }

// Die drei Schritte samt „Festhalten“ und „Später“. onDone nach dem Speichern.
function FirstMemoryForm({ family, animals, readOnly, onCreated, onDone, onSkip }) {
  const [fields, setFields] = useState(() => ({ dogId: animals.length === 1 ? animals[0].id : null, name: '', photo: null, sentence: '' }))
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const formRef = useRef(null)
  const save = useFirstMemorySave(family, onCreated)
  const set = (key) => (value) => setFields((current) => ({ ...current, [key]: value }))

  async function handleSubmit(event) {
    event.preventDefault()
    if (readOnly || saving || uploading) return
    const gap = missing({ animals, ...fields })
    setError(gap ? t(gap.message) : null)
    if (gap) {
      formRef.current?.querySelector(FIELD_SELECTORS[gap.field])?.focus()
      return
    }
    setSaving(true)
    try {
      await save(fields)
      onDone()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <form ref={formRef} className="first-memory-form" onSubmit={handleSubmit} noValidate>
      <p className="first-memory-intro">{t('Drei kleine Schritte, dann steht sie in eurem Album.')}</p>
      <ol className="first-memory-steps">
        <PhotoStep photo={fields.photo} disabled={readOnly || saving} onPhoto={set('photo')} onError={setError} onBusy={setUploading} />
        <AnimalStep animals={animals} dogId={fields.dogId} onPick={set('dogId')} name={fields.name} onName={set('name')} disabled={saving} />
        <SentenceStep value={fields.sentence} onChange={set('sentence')} disabled={saving} />
      </ol>
      {error && (
        <p className="form-error first-memory-error" role="alert">
          {error}
        </p>
      )}
      <Actions readOnly={readOnly} saving={saving} uploading={uploading} onSkip={onSkip} />
    </form>
  )
}

// „Eure erste Erinnerung“ (Plan 2027: „Erste Erinnerung in 60 Sekunden“) - für ein neues Zuhause ohne eigene Erinnerung
// oben auf Start: drei kleine Schritte auf einem Bildschirm (Foto, Tier, ein Satz) und ein Knopf „Festhalten“. Ohne Tier
// legt er es mit an (Name, das Foto als Bild). „Später“ legt die Karte für dieses Zuhause weg (lib/firstMemory.js). In der
// Demo und der Admin-Ansicht nur eine Vorschau: nichts wird hochgeladen, gespeichert oder gemerkt. Nach dem Speichern
// bleibt nur die Freude stehen (aria-live, Fokus darauf).
export default function FirstMemoryCard({ family, dogs, onCreated, onSkip }) {
  const readOnly = useIsDemo()
  const titleId = useId()
  const animals = useMemo(() => composerAnimals(dogs), [dogs])
  const [done, setDone] = useState(false)
  const doneRef = useRef(null)

  useEffect(() => {
    if (done) doneRef.current?.focus()
  }, [done])

  function handleSkip() {
    if (!readOnly) rememberFirstMemorySkip(family.id)
    onSkip?.()
  }

  return (
    <section className="card first-memory" aria-labelledby={titleId}>
      <h2 id={titleId} className="first-memory-title">
        {t('Eure erste Erinnerung')}
      </h2>
      <div role="status" aria-live="polite" className="first-memory-live">
        {done && (
          <p className="first-memory-done hand" tabIndex={-1} ref={doneRef}>
            {t('Festgehalten – eure erste Erinnerung ist da.')}
          </p>
        )}
      </div>
      {!done && (
        <FirstMemoryForm family={family} animals={animals} readOnly={readOnly} onCreated={onCreated} onDone={() => setDone(true)} onSkip={handleSkip} />
      )}
    </section>
  )
}
