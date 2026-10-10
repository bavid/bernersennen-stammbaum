import AdminField, { fieldProps } from './AdminField.jsx'
import useSpendenForm from '../hooks/useSpendenForm.js'
import { QUELLEN, SPENDE_LIMITS, spendeForm, spendePayload } from '../lib/spendenLive.js'
import { Button } from './ui/index.js'

const ID = 'admin-spende-'
const id = (key) => `${ID}${key}`

// „Spenden erfassen“: eine eingegangene Spende schnell eintragen oder ändern (AdminSpenden) - Betrag in Euro, Datum
// (Vorgabe heute), Quelle, optional Name und Nachricht, „öffentlich zeigen“. Ohne Namen erscheint sie als „Anonym“.
// onSave bekommt die Nutzlast (Cent) und darf werfen; nach einer neuen Spende leert sich das Formular (Datum und Quelle
// bleiben), damit die nächste gleich folgen kann.
export default function AdminSpendeForm({ spende = null, onSave, onCancel }) {
  const initial = spendeForm(spende)
  const { form, errors, error, saving, update, handleSubmit, formRef, bannerRef, setForm } = useSpendenForm(initial, spendePayload, async (payload) => {
    await onSave(payload)
    if (!spende) setForm((current) => ({ ...spendeForm(null), datum: current.datum, quelle: current.quelle }))
  })
  const bind = (key, hint = false) => fieldProps(id(key), { error: errors[key], hint })
  const title = spende ? 'Spende ändern' : 'Neue Spende'

  return (
    <form ref={formRef} className="form-stack admin-quartal-form admin-spende-form" onSubmit={handleSubmit} noValidate aria-label={title}>
      {error && (
        <div ref={bannerRef} className="error-banner" role="alert" tabIndex={-1}>
          {error}
        </div>
      )}
      <div className="form-grid">
        <AdminField id={id('betrag')} label="Betrag in Euro" error={errors.betrag}>
          <input {...bind('betrag')} inputMode="decimal" placeholder="0,00" value={form.betrag} onChange={(e) => update('betrag', e.target.value)} />
        </AdminField>
        <AdminField id={id('datum')} label="Datum" error={errors.datum}>
          <input {...bind('datum')} type="date" value={form.datum} onChange={(e) => update('datum', e.target.value)} />
        </AdminField>
        <AdminField id={id('quelle')} label="Quelle" error={errors.quelle}>
          <select {...bind('quelle')} value={form.quelle} onChange={(e) => update('quelle', e.target.value)}>
            {QUELLEN.map((q) => (
              <option key={q.key} value={q.key}>
                {q.label}
              </option>
            ))}
          </select>
        </AdminField>
        <AdminField id={id('anzeigename')} label="Name (optional)" error={errors.anzeigename} hint="leer = „Anonym“">
          <input {...bind('anzeigename', true)} value={form.anzeigename} maxLength={SPENDE_LIMITS.anzeigename} onChange={(e) => update('anzeigename', e.target.value)} />
        </AdminField>
        <AdminField id={id('nachricht')} label="Nachricht (optional)" error={errors.nachricht} className="span-2">
          <input {...bind('nachricht')} value={form.nachricht} maxLength={SPENDE_LIMITS.nachricht} onChange={(e) => update('nachricht', e.target.value)} />
        </AdminField>
      </div>
      <label className="admin-spenden-check">
        <input type="checkbox" checked={form.oeffentlich} onChange={(e) => update('oeffentlich', e.target.checked)} />
        Öffentlich in „Zuletzt gespendet“ zeigen (der Betrag zählt immer in die Summen)
      </label>
      <div className="form-actions">
        <Button type="submit" disabled={saving}>
          {saving ? 'Speichere …' : spende ? 'Speichern' : 'Spende erfassen'}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Abbrechen
          </Button>
        )}
      </div>
    </form>
  )
}
