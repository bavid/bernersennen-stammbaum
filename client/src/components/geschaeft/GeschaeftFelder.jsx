import AdminField, { fieldProps } from '../AdminField.jsx'
import KontaktMerkenHinweis from '../KontaktMerkenHinweis.jsx'
import { MAX_EMAIL_LENGTH, MAX_FIRMA_LENGTH, MAX_NACHRICHT_LENGTH, MAX_NAME_LENGTH } from '../../lib/anfragen.js'
import { ART_OPTIONS, MAX_ORT_LENGTH, MAX_TELEFON_LENGTH, MAX_WEBSEITE_LENGTH } from '../../lib/geschaeftAnfrage.js'
import { t } from '../../lib/i18n/index.js'

const PLZ_LENGTH = 5

// Bindet ein Textfeld an das Formular der Geschäftsanfrage (hooks/useGeschaeftAnfrage.js).
export function fieldBinder({ form, update, fieldErrors, id }) {
  const bind = (key, options = {}) => fieldProps(id(key), { error: fieldErrors[key], ...options })
  const input = (key) => ({ ...bind(key), value: form[key], onChange: (e) => update(key, e.target.value) })
  return { bind, input }
}

// Schritt 1: Betrieb - Name, Art, PLZ + Ort, Webseite, deutschlandweit tätig.
export function BetriebFelder({ form, update, fieldErrors, id }) {
  const { bind, input } = fieldBinder({ form, update, fieldErrors, id })
  return (
    <>
      <AdminField id={id('firma')} label={t('Name des Betriebs')} error={fieldErrors.firma}>
        <input {...input('firma')} required maxLength={MAX_FIRMA_LENGTH} autoComplete="organization" />
      </AdminField>
      <AdminField id={id('art')} label={t('Art')} error={fieldErrors.art}>
        <select {...input('art')} required>
          <option value="">{t('Bitte wählen')}</option>
          {ART_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {t(option.label)}
            </option>
          ))}
        </select>
      </AdminField>
      <div className="geschaeft-plz-ort">
        <AdminField id={id('plz')} label={t('PLZ')} error={fieldErrors.plz}>
          <input {...input('plz')} required inputMode="numeric" maxLength={PLZ_LENGTH} autoComplete="postal-code" />
        </AdminField>
        <AdminField id={id('ort')} label={t('Ort')} error={fieldErrors.ort}>
          <input {...input('ort')} required maxLength={MAX_ORT_LENGTH} autoComplete="address-level2" />
        </AdminField>
      </div>
      <AdminField id={id('webseite')} label={t('Webseite (freiwillig)')} hint={t('Beginnt mit https://')} error={fieldErrors.webseite}>
        <input
          {...bind('webseite', { hint: true })}
          value={form.webseite}
          onChange={(e) => update('webseite', e.target.value)}
          type="url"
          inputMode="url"
          maxLength={MAX_WEBSEITE_LENGTH}
          placeholder="https://"
        />
      </AdminField>
      <label className="geschaeft-check" htmlFor={id('bundesweit')}>
        <input id={id('bundesweit')} type="checkbox" checked={form.bundesweit} onChange={(e) => update('bundesweit', e.target.checked)} />
        <span>{t('Deutschlandweit tätig?')}</span>
      </label>
    </>
  )
}

// Schritt 2: Kontakt - Ansprechperson, E-Mail, Telefon, Nachricht.
export function KontaktFelder({ form, update, fieldErrors, id }) {
  const { bind, input } = fieldBinder({ form, update, fieldErrors, id })
  return (
    <>
      <AdminField id={id('name')} label={t('Ansprechperson')} error={fieldErrors.name}>
        <input {...input('name')} required maxLength={MAX_NAME_LENGTH} autoComplete="name" />
      </AdminField>
      <AdminField id={id('email')} label={t('E-Mail-Adresse')} error={fieldErrors.email}>
        <input {...input('email')} type="email" required maxLength={MAX_EMAIL_LENGTH} autoComplete="email" />
      </AdminField>
      <AdminField id={id('telefon')} label={t('Telefon (freiwillig)')} error={fieldErrors.telefon}>
        <input {...input('telefon')} type="tel" maxLength={MAX_TELEFON_LENGTH} autoComplete="tel" />
      </AdminField>
      <AdminField
        id={id('nachricht')}
        label={t('Nachricht (freiwillig)')}
        hint={t('{n} / {max} Zeichen', { n: form.nachricht.trim().length, max: MAX_NACHRICHT_LENGTH })}
        error={fieldErrors.nachricht}
      >
        <textarea
          {...bind('nachricht', { hint: true })}
          value={form.nachricht}
          onChange={(e) => update('nachricht', e.target.value)}
          maxLength={MAX_NACHRICHT_LENGTH}
          rows={3}
        />
      </AdminField>
      <KontaktMerkenHinweis />
    </>
  )
}
