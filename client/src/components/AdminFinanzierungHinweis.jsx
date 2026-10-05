import { useState } from 'react'
import { api } from '../api'
import AdminField, { fieldProps } from './AdminField.jsx'
import FinanzierungMithelfen from './finanzierung/FinanzierungMithelfen.jsx'
import useFocusFirstError from '../hooks/useFocusFirstError.js'
import { FINANZIERUNG_LIMITS, hinweisForm, hinweisPayload, serverFieldError, zielForm, zielPayload, zielText } from '../lib/finanzierung.js'

const ID = 'admin-finanz-'
const id = (key) => `${ID}${key}`

// Ein kleines Formular mit Speichern-Knopf, Erfolgsmeldung und Fehlerbanner - für Spenden-Hinweis und Ziel gleich. Nach
// einem Fehler springt der Fokus zum ersten Feldfehler bzw. zum Banner (useFocusFirstError, wie AdminQuartalForm).
function useSave(save, onSaved) {
  const [state, setState] = useState({ saving: false, saved: false, error: null, fieldErrors: {} })
  const { formRef, bannerRef, focusFirstError } = useFocusFirstError()
  const clearField = (key) => setState((s) => ({ ...s, saved: false, fieldErrors: Object.fromEntries(Object.entries(s.fieldErrors).filter(([k]) => k !== key)) }))

  async function submit(event, { payload, errors }) {
    event.preventDefault()
    if (!payload) {
      setState((s) => ({ ...s, saved: false, fieldErrors: errors }))
      focusFirstError()
      return
    }
    setState({ saving: true, saved: false, error: null, fieldErrors: {} })
    try {
      onSaved(await save(payload))
      setState({ saving: false, saved: true, error: null, fieldErrors: {} })
    } catch (err) {
      const field = serverFieldError(err)
      setState({ saving: false, saved: false, error: field ? null : err.message, fieldErrors: field ? { [field.field]: field.message } : {} })
      focusFirstError()
    }
  }
  return { ...state, formRef, bannerRef, clearField, submit }
}

function SaveRow({ saving, saved }) {
  return (
    <div className="form-actions">
      <button type="submit" className="btn btn-primary" disabled={saving}>
        {saving ? 'Speichere …' : 'Speichern'}
      </button>
      {saved && (
        <span className="field-hint" role="status">
          Gespeichert.
        </span>
      )}
    </div>
  )
}

function HinweisForm({ hinweis, onSaved }) {
  const [form, setForm] = useState(() => hinweisForm(hinweis))
  const save = useSave((payload) => api.admin.saveFinanzierungHinweis(payload).then((r) => r.spendenHinweis), (saved) => {
    setForm(hinweisForm(saved))
    onSaved(saved)
  })
  const update = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }))
    save.clearField(key)
  }
  const bind = (key, hint = false) => fieldProps(id(key), { error: save.fieldErrors[key], hint })

  return (
    <form ref={save.formRef} className="form-stack" onSubmit={(e) => save.submit(e, { payload: hinweisPayload(form), errors: {} })} noValidate>
      <h3>Spenden-Hinweis</h3>
      {save.error && (
        <div ref={save.bannerRef} className="error-banner" role="alert" tabIndex={-1}>
          {save.error}
        </div>
      )}
      <div className="form-grid">
        <AdminField
          id={id('text')}
          label="Text (z. B. Spendenkonto und Verwendungszweck)"
          error={save.fieldErrors.text}
          hint={`${form.text.length} / ${FINANZIERUNG_LIMITS.hinweisText} Zeichen · leer = kein Hinweis`}
          className="span-2"
        >
          <textarea {...bind('text', true)} value={form.text} maxLength={FINANZIERUNG_LIMITS.hinweisText} rows={3} onChange={(e) => update('text', e.target.value)} />
        </AdminField>
        <AdminField id={id('url')} label="Spenden-Link (optional)" error={save.fieldErrors.url} hint="Nur http(s)://… – öffnet in einem neuen Tab. Nie ein Zahlungsformular in der App." className="span-2">
          <input {...bind('url', true)} type="url" value={form.url} placeholder="https://…" onChange={(e) => update('url', e.target.value)} />
        </AdminField>
      </div>
      <SaveRow saving={save.saving} saved={save.saved} />
    </form>
  )
}

function ZielForm({ ziel, onSaved }) {
  const [form, setForm] = useState(() => zielForm(ziel))
  const save = useSave((payload) => api.admin.saveFinanzierungZiel(payload).then((r) => r.ziel), (saved) => {
    setForm(zielForm(saved))
    onSaved(saved)
  })
  const update = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }))
    save.clearField(key)
  }
  const bind = (key, hint = false) => fieldProps(id(key), { error: save.fieldErrors[key], hint })

  return (
    <form ref={save.formRef} className="form-stack" onSubmit={(e) => save.submit(e, zielPayload(form))} noValidate>
      <h3>Aktuelles Ziel</h3>
      {save.error && (
        <div ref={save.bannerRef} className="error-banner" role="alert" tabIndex={-1}>
          {save.error}
        </div>
      )}
      <div className="form-grid">
        <AdminField id={id('titel')} label="Wofür" error={save.fieldErrors.titel} hint="z. B. Hundewiese am Deich · leer = kein Ziel" className="span-2">
          <input {...bind('titel', true)} value={form.titel} maxLength={FINANZIERUNG_LIMITS.zielTitel} onChange={(e) => update('titel', e.target.value)} />
        </AdminField>
        <AdminField id={id('betrag')} label="Betrag in Euro (optional)" error={save.fieldErrors.betrag} hint="z. B. 500 oder 1.250,50">
          <input {...bind('betrag', true)} inputMode="decimal" value={form.betrag} placeholder="500" onChange={(e) => update('betrag', e.target.value)} />
        </AdminField>
        <AdminField id={id('empfaenger')} label="Empfänger (optional)" error={save.fieldErrors.empfaenger}>
          <input {...bind('empfaenger')} value={form.empfaenger} maxLength={FINANZIERUNG_LIMITS.empfaenger} onChange={(e) => update('empfaenger', e.target.value)} />
        </AdminField>
      </div>
      <SaveRow saving={save.saving} saved={save.saved} />
    </form>
  )
}

// Spenden-Hinweis und Ziel in einer Karte, rechts daneben die Vorschau: die Karte „Mithelfen“ genau wie auf der Seite
// und der Ziel-Satz. Die Vorschau zeigt den GESPEICHERTEN Stand (die Seite ist bis zu fünf Minuten im Cache).
export default function AdminFinanzierungHinweis({ hinweis, ziel, onHinweisSaved, onZielSaved }) {
  return (
    <section className="card admin-finanz-card" aria-labelledby={id('hinweis-title')}>
      <h2 id={id('hinweis-title')} className="visually-hidden">
        Spenden-Hinweis und Ziel
      </h2>
      <div className="admin-finanz-layout">
        <div className="admin-finanz-forms">
          <HinweisForm hinweis={hinweis} onSaved={onHinweisSaved} />
          <ZielForm ziel={ziel} onSaved={onZielSaved} />
        </div>
        <figure className="admin-finanz-preview">
          <figcaption className="field-hint">Vorschau – so steht es auf der Seite.</figcaption>
          {ziel?.titel ? (
            <p className="finanz-ziel">
              {zielText(ziel)}
              {ziel.empfaenger && <> – Empfänger: {ziel.empfaenger}</>}
            </p>
          ) : (
            <p className="muted">Kein Ziel eingetragen.</p>
          )}
          {hinweis?.text || hinweis?.url ? <FinanzierungMithelfen hinweis={hinweis} /> : <p className="muted">Ohne Spenden-Hinweis zeigt die Seite keine Karte „Mithelfen“.</p>}
        </figure>
      </div>
    </section>
  )
}
