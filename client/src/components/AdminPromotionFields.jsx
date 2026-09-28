import AdminField, { fieldProps } from './AdminField.jsx'
import { BEREICH_LABELS, EMPFEHLUNG_HINT, FUTTER_HINT, KENNZEICHNUNGEN, TIERART_LABELS } from '../lib/adminMarketing.js'

const IDS = {
  titel: 'admin-promo-titel',
  bereich: 'admin-promo-bereich',
  kennzeichnung: 'admin-promo-kennzeichnung',
  empfohlenVon: 'admin-promo-empfohlen-von',
  partnerId: 'admin-promo-partner',
  text: 'admin-promo-text',
  url: 'admin-promo-url',
  tierart: 'admin-promo-tierart',
  sort: 'admin-promo-sort',
  start: 'admin-promo-start',
  ende: 'admin-promo-ende'
}

const PARTNER_STATUS_SUFFIX = { entwurf: ' (Entwurf)', pausiert: ' (pausiert)' }
const LEGAL_HINT_CLASS = 'admin-legal-hint'

// Die Felder einer Empfehlung/Anzeige (server/lib/promotions.js validatePromotion), ohne eigenen Zustand:
// form und fieldErrors kommen aus AdminPromotionForm, Änderungen gehen als Patch über update zurück.
// Rechtliche Hinweise erscheinen am auslösenden Feld: "Futter" -> keine Gesundheitsversprechen im Text,
// "Empfehlung" -> nur ohne Gegenleistung, und "Empfohlen von" wird Pflicht.
export default function AdminPromotionFields({ form, fieldErrors, partners, update, onKennzeichnungChange }) {
  const isEmpfehlung = form.kennzeichnung === 'Empfehlung'
  const isFutter = form.bereich === 'futter'
  const bind = (key, { hint } = {}) => fieldProps(IDS[key], { error: fieldErrors[key], hint })

  return (
    <div className="form-grid">
      <AdminField id={IDS.titel} label="Titel" error={fieldErrors.titel} className="span-2">
        <input {...bind('titel')} value={form.titel} onChange={(e) => update({ titel: e.target.value })} maxLength={120} required />
      </AdminField>

      <AdminField id={IDS.bereich} label="Bereich" error={fieldErrors.bereich}>
        <select {...bind('bereich')} value={form.bereich} onChange={(e) => update({ bereich: e.target.value })}>
          {Object.entries(BEREICH_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </AdminField>

      <AdminField
        id={IDS.kennzeichnung}
        label="Kennzeichnung"
        error={fieldErrors.kennzeichnung}
        hint={isEmpfehlung ? EMPFEHLUNG_HINT : null}
        hintClassName={LEGAL_HINT_CLASS}
      >
        <select
          {...bind('kennzeichnung', { hint: isEmpfehlung })}
          value={form.kennzeichnung}
          onChange={(e) => onKennzeichnungChange(e.target.value)}
        >
          {KENNZEICHNUNGEN.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </AdminField>

      <AdminField id={IDS.empfohlenVon} label={isEmpfehlung ? 'Empfohlen von (Pflicht)' : 'Empfohlen von (optional)'} error={fieldErrors.empfohlenVon}>
        <input
          {...bind('empfohlenVon')}
          value={form.empfohlenVon}
          onChange={(e) => update({ empfohlenVon: e.target.value })}
          maxLength={120}
          required={isEmpfehlung}
          placeholder="z. B. Tierheim Sonnenhang"
        />
      </AdminField>

      <AdminField id={IDS.partnerId} label="Partner (optional)" error={fieldErrors.partnerId}>
        <select {...bind('partnerId')} value={form.partnerId} onChange={(e) => update({ partnerId: e.target.value })}>
          <option value="">Kein Partner</option>
          {partners.map((partner) => (
            <option key={partner.id} value={String(partner.id)}>
              {partner.name}
              {PARTNER_STATUS_SUFFIX[partner.status] || ''}
            </option>
          ))}
        </select>
      </AdminField>

      <AdminField
        id={IDS.text}
        label="Text (optional)"
        error={fieldErrors.text}
        hint={isFutter ? FUTTER_HINT : null}
        hintClassName={LEGAL_HINT_CLASS}
        className="span-2"
      >
        <textarea {...bind('text', { hint: isFutter })} value={form.text} onChange={(e) => update({ text: e.target.value })} maxLength={600} rows={3} />
      </AdminField>

      <AdminField id={IDS.url} label="Link (optional)" error={fieldErrors.url} className="span-2">
        <input
          {...bind('url')}
          type="url"
          value={form.url}
          onChange={(e) => update({ url: e.target.value })}
          maxLength={300}
          placeholder="https://…"
        />
      </AdminField>

      <AdminField id={IDS.tierart} label="Tierart" error={fieldErrors.tierart}>
        <select {...bind('tierart')} value={form.tierart} onChange={(e) => update({ tierart: e.target.value })}>
          <option value="">Alle Tierarten</option>
          {Object.entries(TIERART_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </AdminField>

      <AdminField id={IDS.sort} label="Reihenfolge" error={fieldErrors.sort} hint="Kleinere Zahl steht weiter oben.">
        <input {...bind('sort', { hint: true })} type="number" step={1} value={form.sort} onChange={(e) => update({ sort: e.target.value })} />
      </AdminField>

      <AdminField id={IDS.start} label="Sichtbar ab (optional)" error={fieldErrors.start}>
        <input {...bind('start')} type="date" value={form.start} onChange={(e) => update({ start: e.target.value })} />
      </AdminField>

      <AdminField id={IDS.ende} label="Sichtbar bis (optional)" error={fieldErrors.ende}>
        <input {...bind('ende')} type="date" value={form.ende} onChange={(e) => update({ ende: e.target.value })} />
      </AdminField>

      <div className="field span-2">
        <label className="check">
          <input id="admin-promo-aktiv" type="checkbox" checked={form.aktiv} onChange={(e) => update({ aktiv: e.target.checked })} />
          Aktiv (im Reiter „Entdecken“ sichtbar)
        </label>
      </div>
    </div>
  )
}
