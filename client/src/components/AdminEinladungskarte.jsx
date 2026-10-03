import { useEffect, useState } from 'react'
import { api } from '../api'
import AdminField, { fieldProps } from './AdminField.jsx'
import EinladungBack from './visitenkarte/EinladungBack.jsx'
import useFocusFirstError from '../hooks/useFocusFirstError.js'
import { musterCodes } from '../lib/visitenkarte.js'
import { hostLabel, printBaseUrl } from '../lib/voucherPrint.js'
import {
  RUECKSEITE_LIMITS,
  RUECKSEITE_VORGABEN,
  SCHRITT_FIELDS,
  rueckseiteClientErrors,
  rueckseiteForm,
  rueckseiteModel,
  rueckseitePayload
} from '../lib/einladungskarte.js'

// Admin-Einstellung "Einladungskarte – Rückseite" (Reiter "Einstellungen", server/routes/adminEinladungskarte.js): die
// Rückseite, die Familie auf Pfoten auf jede Einladungskarte der Partner druckt - Titel, Text, bis zu drei Schritte und
// die gezeigte Adresse (leer = die Adresse, auf die der QR-Code zeigt). Daneben die Live-Vorschau mit derselben
// Komponente wie im Designer der Partner (visitenkarte/EinladungBack.jsx) und einem Muster-Code. Fehler stehen am Feld
// (vom Client wie vom Server, dort über details.feld); danach springt der Fokus zum ersten Fehler.

const ID_PREFIX = 'admin-einladung-'
const FIELD_KEYS = ['titel', 'text', ...SCHRITT_FIELDS, 'adresse', 'schritte']
// Spielraum für "https://" vor der Adresse - der Server nimmt es ab.
const ADRESSE_INPUT_SLACK = 8
const [MUSTER_CODE] = musterCodes(1)

const id = (key) => `${ID_PREFIX}${key}`

function Preview({ form, card }) {
  const rueckseite = rueckseiteModel(rueckseitePayload(form), card)
  return (
    <figure className="admin-einladung-preview">
      <EinladungBack card={card} rueckseite={rueckseite} code={MUSTER_CODE} muster />
      <figcaption className="field-hint">Vorschau mit Muster-Code – jede gedruckte Karte trägt ihren eigenen.</figcaption>
    </figure>
  )
}

function useRueckseite() {
  const [state, setState] = useState({ form: null, card: null, error: null })
  useEffect(() => {
    let cancelled = false
    const origin = window.location.origin
    Promise.all([api.admin.einladungskarte(), api.config().catch(() => null)])
      .then(([result, config]) => {
        const baseUrl = printBaseUrl(config?.publicUrl, origin)
        if (!cancelled) setState({ form: rueckseiteForm(result.rueckseite), card: { baseUrl, host: hostLabel(baseUrl) }, error: null })
      })
      .catch((err) => {
        if (!cancelled) setState((current) => ({ ...current, error: err.message }))
      })
    return () => {
      cancelled = true
    }
  }, [])
  return [state, setState]
}

function Fields({ form, errors, card, update }) {
  const bind = (key, hint = false) => fieldProps(id(key), { error: errors[key], hint })
  return (
    <div className="form-grid">
      <AdminField id={id('titel')} label="Titel" error={errors.titel} className="span-2">
        <input {...bind('titel')} value={form.titel} maxLength={RUECKSEITE_LIMITS.titel} onChange={(e) => update({ titel: e.target.value })} />
      </AdminField>
      <AdminField id={id('text')} label="Text" error={errors.text} hint={`${form.text.length} / ${RUECKSEITE_LIMITS.text} Zeichen`} className="span-2">
        <textarea {...bind('text', true)} value={form.text} maxLength={RUECKSEITE_LIMITS.text} rows={3} onChange={(e) => update({ text: e.target.value })} />
      </AdminField>
      <fieldset className="admin-einladung-schritte span-2" aria-describedby={errors.schritte ? id('schritte-error') : undefined}>
        <legend className="field-label">So geht’s – bis zu drei Schritte (leer = ohne)</legend>
        {SCHRITT_FIELDS.map((key, index) => (
          <AdminField key={key} id={id(key)} label={`Schritt ${index + 1}`} error={errors[key]}>
            <input {...bind(key)} value={form[key]} maxLength={RUECKSEITE_LIMITS.schritt} onChange={(e) => update({ [key]: e.target.value })} />
          </AdminField>
        ))}
        {errors.schritte && (
          <p className="field-error" id={id('schritte-error')} role="alert">
            {errors.schritte}
          </p>
        )}
      </fieldset>
      <AdminField
        id={id('adresse')}
        label="Gezeigte Adresse"
        error={errors.adresse}
        hint="Leer lassen: die Adresse, auf die der QR-Code zeigt. Der QR-Code zeigt immer auf die echte Einlöse-Seite."
        className="span-2"
      >
        <input
          {...bind('adresse', true)}
          value={form.adresse}
          maxLength={RUECKSEITE_LIMITS.adresse + ADRESSE_INPUT_SLACK}
          placeholder={`${card.host}/v`}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => update({ adresse: e.target.value })}
        />
      </AdminField>
    </div>
  )
}

export default function AdminEinladungskarte() {
  const [{ form, card, error: loadError }, setState] = useRueckseite()
  const [errors, setErrors] = useState({})
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const { formRef, bannerRef, focusFirstError } = useFocusFirstError()

  function update(patch) {
    setState((current) => ({ ...current, form: { ...current.form, ...patch } }))
    setErrors((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !(key in patch) && key !== 'schritte')))
    setSaved(false)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    setSaved(false)
    const clientErrors = rueckseiteClientErrors(form)
    setErrors(clientErrors)
    if (Object.keys(clientErrors).length) return focusFirstError()
    setSaving(true)
    try {
      const result = await api.admin.saveEinladungskarte(rueckseitePayload(form))
      setState((current) => ({ ...current, form: rueckseiteForm(result.rueckseite) }))
      setSaved(true)
    } catch (err) {
      const feld = err.details?.feld
      if (FIELD_KEYS.includes(feld)) setErrors({ [feld]: err.message })
      else setError(err.message)
      focusFirstError()
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="admin-einladung card" aria-labelledby="admin-einladung-title">
      <div className="admin-section-head">
        <h2 id="admin-einladung-title">Einladungskarte – Rückseite</h2>
      </div>
      <p className="admin-section-intro muted">
        Die Partner gestalten die Vorderseite ihrer Einladungskarten, die Rückseite kommt von hier – für alle Partner gleich, mit
        einem eigenen Code auf jeder Karte. Reiner Text.
      </p>
      {loadError && (
        <div className="error-banner" role="alert">
          {loadError}
        </div>
      )}
      {!form && !loadError && <p className="muted">Lade …</p>}
      {form && (
        <div className="admin-einladung-layout">
          <form ref={formRef} className="form-stack" onSubmit={handleSubmit} noValidate>
            {error && (
              <div ref={bannerRef} className="error-banner" role="alert" tabIndex={-1}>
                {error}
              </div>
            )}
            <Fields form={form} errors={errors} card={card} update={update} />
            <div className="form-actions">
              <p className="field-hint field-hint-success" role="status">
                {saved ? 'Gespeichert.' : ''}
              </p>
              <span className="form-actions-spacer" />
              <button type="button" className="btn btn-ghost" onClick={() => update(rueckseiteForm(RUECKSEITE_VORGABEN))}>
                Vorgaben einsetzen
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Speichere …' : 'Speichern'}
              </button>
            </div>
          </form>
          <Preview form={form} card={card} />
        </div>
      )}
    </section>
  )
}
