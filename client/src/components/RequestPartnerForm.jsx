import AdminField, { fieldProps } from './AdminField.jsx'
import Honeypot from './Honeypot.jsx'
import Icon from './Icon.jsx'
import KontaktMerkenHinweis from './KontaktMerkenHinweis.jsx'
import useRequestForm from '../hooks/useRequestForm.js'
import { useTheme } from '../themes/ThemeProvider.jsx'
import { SETUP_TYPE_OPTIONS } from '../lib/partnerTypes.js'
import {
  ANFRAGE_TYP,
  EMPTY_PARTNER_REQUEST,
  MAX_EMAIL_LENGTH,
  MAX_FIRMA_LENGTH,
  MAX_NACHRICHT_LENGTH,
  MAX_NAME_LENGTH
} from '../lib/anfragen.js'

export const PARTNER_REQUEST_SUCCESS = 'Danke! Wir melden uns mit eurem Partner-Zugang.'
const PLZ_LENGTH = 5

// "Partner-Zugang anfragen" (Phase N): Hundeschulen, Tierheime & Co. fragen einen Partner-Zugang an - auf
// /partner-werden (PartnerInfoPage, #anfragen) und in Partner-Demos (DemoBanner, im Modal). Oben kurz, warum man
// anfragt (Wortlaut vom Betreiber). Pflicht: Name des Angebots, Art (dieselbe Auswahl wie beim Einrichten des Profils,
// lib/partnerTypes.js) und E-Mail; PLZ, Ansprechperson und Nachricht freiwillig. Anrede "ihr". Ablauf wie
// RequestVoucherForm (hooks/useRequestForm.js).
export default function RequestPartnerForm({ idPrefix = 'request-partner' }) {
  const { theme } = useTheme()
  const { form, update, website, setWebsite, fieldErrors, error, sent, sending, handleSubmit, formRef, bannerRef, successRef } =
    useRequestForm(ANFRAGE_TYP.partner, EMPTY_PARTNER_REQUEST)
  const id = (key) => `${idPrefix}-${key}`
  const bind = (key, options = {}) => fieldProps(id(key), { error: fieldErrors[key], ...options })
  const input = (key) => ({ ...bind(key), value: form[key], onChange: (e) => update(key, e.target.value) })

  if (sent) {
    return (
      <p ref={successRef} className="request-success" role="status" tabIndex={-1}>
        <Icon name="check" />
        {PARTNER_REQUEST_SUCCESS}
      </p>
    )
  }

  return (
    <form ref={formRef} className="request-form form-stack" onSubmit={handleSubmit} noValidate>
      <div className="request-why">
        <h3>Warum anfragen?</h3>
        <p>
          {theme.appName} wächst Schritt für Schritt: Wir sind ein kleines Projekt mit begrenzter Server-Kapazität und
          richten Partner-Profile deshalb einzeln ein. Erzählt uns kurz, wer ihr seid – wir melden uns mit eurem
          Partner-Zugang.
        </p>
      </div>

      {error && (
        <div ref={bannerRef} className="error-banner" role="alert" tabIndex={-1}>
          {error}
        </div>
      )}

      <AdminField id={id('firma')} label="Hundeschule, Tierheim oder Geschäft" error={fieldErrors.firma}>
        <input {...input('firma')} required maxLength={MAX_FIRMA_LENGTH} autoComplete="organization" />
      </AdminField>

      <div className="form-grid">
        <AdminField id={id('partnerTyp')} label="Art des Angebots" error={fieldErrors.partnerTyp}>
          <select {...input('partnerTyp')} required>
            <option value="">Bitte wählen</option>
            {SETUP_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </AdminField>
        <AdminField id={id('plz')} label="Postleitzahl (freiwillig)" error={fieldErrors.plz}>
          <input {...input('plz')} inputMode="numeric" maxLength={PLZ_LENGTH} autoComplete="postal-code" />
        </AdminField>
      </div>

      <div className="form-grid">
        <AdminField id={id('name')} label="Ansprechperson (freiwillig)" error={fieldErrors.name}>
          <input {...input('name')} maxLength={MAX_NAME_LENGTH} autoComplete="name" />
        </AdminField>
        <AdminField id={id('email')} label="E-Mail-Adresse" error={fieldErrors.email}>
          <input {...input('email')} type="email" required maxLength={MAX_EMAIL_LENGTH} autoComplete="email" />
        </AdminField>
      </div>

      <AdminField
        id={id('nachricht')}
        label="Nachricht (freiwillig)"
        hint={`${form.nachricht.trim().length} / ${MAX_NACHRICHT_LENGTH} Zeichen`}
        error={fieldErrors.nachricht}
      >
        <textarea
          {...bind('nachricht', { hint: true })}
          value={form.nachricht}
          onChange={(e) => update('nachricht', e.target.value)}
          maxLength={MAX_NACHRICHT_LENGTH}
          rows={4}
        />
      </AdminField>

      <KontaktMerkenHinweis />

      <Honeypot id={id('hp')} value={website} onChange={setWebsite} />

      <p className="request-privacy">
        Eure Angaben nutzen wir nur für diese Anfrage.{' '}
        <a href="/datenschutz" target="_blank" rel="noopener noreferrer">
          Mehr zum Datenschutz
        </a>
      </p>

      <button type="submit" className="btn btn-primary btn-block" disabled={sending}>
        <Icon name="send" />
        {sending ? 'Sende …' : 'Partner-Zugang anfragen'}
      </button>
    </form>
  )
}
