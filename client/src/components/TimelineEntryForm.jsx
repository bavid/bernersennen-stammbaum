import { useId, useState } from 'react'
import { useTheme } from '../themes/ThemeProvider.jsx'
import ConfirmButton from './ConfirmButton.jsx'
import Icon from './Icon.jsx'
import MehrAngaben from './MehrAngaben.jsx'
import AutoTextarea from './entryForm/AutoTextarea.jsx'
import DatumChip from './entryForm/DatumChip.jsx'
import EntryExtras, { NameField } from './entryForm/EntryExtras.jsx'
import FotoFeld from './entryForm/FotoFeld.jsx'
import SichtbarkeitWahl from './entryForm/SichtbarkeitWahl.jsx'
import useEntryDraft from '../hooks/useEntryDraft.js'
import useFocusFirstError from '../hooks/useFocusFirstError.js'
import { todayIso } from '../lib/dates.js'
import { readDraft, titleSuggestion } from '../lib/entryForm.js'
import { taggedDogIds } from '../lib/erlebtMit.js'
import { readSetting, writeSetting } from '../lib/storage.js'
import '../styles/entry-form.css'

const CONTENT_ERROR = 'Erzähl kurz, was passiert ist – oder füge ein Foto hinzu.'
const NAME_ERROR = 'Bitte gib deinen Namen an.'
const DATE_ERROR = 'Bitte wähle ein Datum.'

function initialForm(entry, draft) {
  return {
    text: draft?.text ?? entry?.text ?? '',
    titel: draft?.titel ?? entry?.titel ?? '',
    datum: draft?.datum || entry?.datum || todayIso(),
    fotos: draft?.fotos ?? entry?.foto_urls ?? [],
    privat: draft ? draft.privat : Boolean(entry?.privat),
    erlebtMit: draft?.erlebtMit ?? taggedDogIds(entry),
    kategorie: entry?.kategorie || '',
    isPublic: Boolean(entry?.is_public)
  }
}

function validate(form, autorName) {
  const errors = {}
  if (!form.text.trim() && !form.titel.trim() && form.fotos.length === 0) errors.content = CONTENT_ERROR
  if (!form.datum) errors.datum = DATE_ERROR
  if (!autorName.trim()) errors.name = NAME_ERROR
  return errors
}

const draftValues = (form) => ({ text: form.text, titel: form.titel, datum: form.datum, fotos: form.fotos, privat: form.privat, erlebtMit: form.erlebtMit })

// Neue oder bearbeitete Erinnerung („Erinnerung festhalten“): Fotos zuerst, dann „Was ist passiert?“ (wächst mit), eine
// Überschrift nur, wenn man will (sonst der erste Satz, lib/entryForm.js - der Server braucht eine), das Datum als Chip
// „Heute“, im eigenen Zuhause die Sichtbarkeit als zwei klare Möglichkeiten, alles Weitere unter „Mehr“ (Name, „Mit dabei“,
// Tierheim-Felder). Fehler stehen am Feld, der Fokus geht zum ersten. Eine neue Erinnerung behält je Tier einen Entwurf
// (draftKey, hooks/useEntryDraft.js), falls das Formular aus Versehen zugeht.
// isHousehold: aktiver Bereich ist ein Zuhause (nur dort „privat“); isShelter: Tierheim (Kategorie, öffentlich); canTag
// (Phase V2): „Mit dabei“ im eigenen Zuhause; shareNames: Familien, in die das Tier geteilt ist; submitLabel: Knopf für eine
// neue Erinnerung (Vorgabe „Festhalten“).
export default function TimelineEntryForm({ entry, isHousehold, isShelter, canTag, shareNames = [], draftKey, submitLabel, onSubmit, onDelete, onCancel }) {
  const { words } = useTheme()
  const textId = useId()
  const titelId = useId()
  const errorIds = { content: useId(), name: useId(), datum: useId() }
  const draftId = entry ? null : (draftKey ?? null)
  const [restored] = useState(() => (draftId ? readDraft(draftId) : null))
  const [form, setForm] = useState(() => initialForm(entry, restored))
  const [autorName, setAutorName] = useState(() => entry?.autor_name || readSetting('autorName', ''))
  const [nameKnown] = useState(() => Boolean(autorName.trim()))
  const [moreOpen, setMoreOpen] = useState(false)
  const [draftNotice, setDraftNotice] = useState(Boolean(restored))
  const [errors, setErrors] = useState({})
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const { formRef, bannerRef, focusFirstError } = useFocusFirstError()
  const entwurf = useEntryDraft(draftId, draftValues(form))
  const suggestion = titleSuggestion(form.text, form.datum, words.entry)

  const update = (patch) => {
    setForm((current) => ({ ...current, ...patch }))
    setErrors((current) => (Object.keys(current).length ? {} : current))
  }

  function discardDraft() {
    entwurf.discard()
    setForm(initialForm(entry, null))
    setDraftNotice(false)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    const found = validate(form, autorName)
    setErrors(found)
    if (Object.keys(found).length) {
      if (found.name && nameKnown) setMoreOpen(true)
      focusFirstError()
      return
    }
    setSaving(true)
    try {
      writeSetting('autorName', autorName.trim())
      const tags = canTag ? { erlebtMit: form.privat ? [] : form.erlebtMit } : {}
      await onSubmit({
        autorName,
        datum: form.datum,
        titel: form.titel.trim() || suggestion,
        text: form.text,
        fotoUrls: form.fotos,
        privat: Boolean(isHousehold && form.privat),
        kategorie: form.kategorie || null,
        isPublic: form.isPublic,
        ...tags
      })
      entwurf.clear()
    } catch (err) {
      setError(err.message)
      setSaving(false)
      focusFirstError()
    }
  }

  async function handleDelete() {
    setError(null)
    setSaving(true)
    try {
      await onDelete()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  const nameField = <NameField value={autorName} onChange={setAutorName} error={errors.name} errorId={errorIds.name} />
  const hasMore = nameKnown || canTag || isShelter
  const summary = [nameKnown && autorName.trim() && `von ${autorName.trim()}`, canTag && 'Mit dabei', isShelter && 'Kategorie, Steckbrief']
    .filter(Boolean)
    .join(' · ')

  return (
    <form className="entry-form" ref={formRef} onSubmit={handleSubmit} noValidate>
      {error && (
        <div className="error-banner" role="alert" ref={bannerRef} tabIndex={-1}>
          {error}
        </div>
      )}
      {draftNotice && (
        <p className="entry-draft-notice">
          <Icon name="edit" />
          <span>Euer Entwurf ist noch da.</span>
          <button type="button" className="link-button" onClick={discardDraft}>
            Verwerfen
          </button>
        </p>
      )}
      <FotoFeld value={form.fotos} onChange={(fotos) => update({ fotos })} onBusyChange={setUploading} onError={setError} />
      <div className="field">
        <label className="field-label" htmlFor={textId}>
          Was ist passiert?
        </label>
        <AutoTextarea
          id={textId}
          name="text"
          value={form.text}
          onChange={(event) => update({ text: event.target.value })}
          placeholder="z. B. Heute waren wir zum ersten Mal am See …"
          maxLength={5000}
          autoFocus={!entry}
          aria-invalid={errors.content ? true : undefined}
          aria-describedby={errors.content ? errorIds.content : undefined}
        />
        {errors.content && (
          <p className="field-error" id={errorIds.content}>
            {errors.content}
          </p>
        )}
      </div>
      <div className="field">
        <label className="field-label" htmlFor={titelId}>
          Überschrift <span className="muted">(optional)</span>
        </label>
        <input id={titelId} name="titel" value={form.titel} onChange={(event) => update({ titel: event.target.value })} maxLength={120} placeholder={`sonst: „${suggestion}“`} />
      </div>
      {!nameKnown && nameField}
      <DatumChip value={form.datum} onChange={(datum) => update({ datum })} invalid={Boolean(errors.datum)} errorId={errorIds.datum} />
      {errors.datum && (
        <p className="field-error" id={errorIds.datum}>
          {errors.datum}
        </p>
      )}
      {isHousehold && <SichtbarkeitWahl privat={form.privat} onChange={(privat) => update({ privat })} shareNames={shareNames} />}
      {hasMore && (
        <MehrAngaben summary={summary} open={moreOpen} onToggle={setMoreOpen}>
          <EntryExtras form={form} onChange={update} name={nameKnown ? nameField : null} canTag={canTag} isShelter={isShelter} />
        </MehrAngaben>
      )}
      <div className="form-actions">
        {onDelete && <ConfirmButton onConfirm={handleDelete} label={`${words.entry} löschen`} disabled={saving} />}
        <span className="form-actions-spacer" />
        {onCancel && (
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Abbrechen
          </button>
        )}
        <button className="btn btn-primary" type="submit" disabled={saving || uploading}>
          {saving ? 'Speichere …' : entry ? 'Speichern' : submitLabel || words.tellActionShort}
        </button>
      </div>
    </form>
  )
}
