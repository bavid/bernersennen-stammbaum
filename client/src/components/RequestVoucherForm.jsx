import AdminField, { fieldProps } from './AdminField.jsx'
import Honeypot from './Honeypot.jsx'
import Icon from './Icon.jsx'
import KontaktMerkenHinweis from './KontaktMerkenHinweis.jsx'
import useRequestForm from '../hooks/useRequestForm.js'
import { useTheme } from '../themes/ThemeProvider.jsx'
import { ANFRAGE_TYP, EMPTY_VOUCHER_REQUEST, MAX_EMAIL_LENGTH, MAX_NACHRICHT_LENGTH, MAX_NAME_LENGTH } from '../lib/anfragen.js'
import { t } from '../lib/i18n/index.js'

export const VOUCHER_REQUEST_SUCCESS = 'Danke! Wir melden uns per E-Mail, sobald wieder Platz ist.'

// "Noch keinen Gutschein?" (Phase N): Besucher fragen einen Gutschein an - auf der Login-Seite (LoginVoucherRequest)
// und in Demo-Sitzungen (DemoBanner, im Modal). Oben kurz, warum es Gutscheine gibt (Wortlaut vom Betreiber), dann
// Name freiwillig, E-Mail Pflicht (der Server prüft zusätzlich, ob es die Domain gibt), Nachricht freiwillig bis 1000
// Zeichen, dazu der Honigtopf. Nach dem Absenden klappt das Formular zu und macht dem Dank Platz. idPrefix: eigene
// ids je Einsatzort. autoFocus: erstes Feld fokussieren (nach dem Aufklappen auf der Login-Seite).
export default function RequestVoucherForm({ idPrefix = 'request-voucher', autoFocus = false }) {
  const { theme } = useTheme()
  const { form, update, website, setWebsite, fieldErrors, error, sent, sending, handleSubmit, formRef, bannerRef, successRef } =
    useRequestForm(ANFRAGE_TYP.gutschein, EMPTY_VOUCHER_REQUEST)
  const id = (key) => `${idPrefix}-${key}`
  const bind = (key, options = {}) => fieldProps(id(key), { error: fieldErrors[key], ...options })

  if (sent) {
    return (
      <p ref={successRef} className="request-success" role="status" tabIndex={-1}>
        <Icon name="check" />
        {t(VOUCHER_REQUEST_SUCCESS)}
      </p>
    )
  }

  return (
    <form ref={formRef} className="request-form form-stack" onSubmit={handleSubmit} noValidate>
      <div className="request-why">
        <h3>{t('Warum per Einladungscode?')}</h3>
        <p>
          {t(
            '{app} ist ein kleines, privat betriebenes Projekt: ohne Tracking, ohne Datenhandel und mit einem bewusst kleinen eigenen Server. Damit alles schnell und zuverlässig bleibt, nehmen wir neue Familien nach und nach auf. Schreib uns kurz – wir schicken dir deinen persönlichen Code, sobald wieder Platz ist.',
            { app: theme.appName }
          )}
        </p>
      </div>

      {error && (
        <div ref={bannerRef} className="error-banner" role="alert" tabIndex={-1}>
          {error}
        </div>
      )}

      <AdminField id={id('name')} label={t('Dein Name (freiwillig)')} error={fieldErrors.name}>
        <input
          {...bind('name')}
          value={form.name}
          onChange={(e) => update('name', e.target.value)}
          maxLength={MAX_NAME_LENGTH}
          autoComplete="name"
          autoFocus={autoFocus}
        />
      </AdminField>

      <AdminField id={id('email')} label={t('Deine E-Mail-Adresse')} error={fieldErrors.email}>
        <input
          {...bind('email')}
          type="email"
          required
          value={form.email}
          onChange={(e) => update('email', e.target.value)}
          maxLength={MAX_EMAIL_LENGTH}
          autoComplete="email"
        />
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

      <Honeypot id={id('hp')} value={website} onChange={setWebsite} />

      <p className="request-privacy">
        {t('Deine Angaben nutzen wir nur für diese Anfrage.')}{' '}
        <a href="/datenschutz" target="_blank" rel="noopener noreferrer">
          {t('Mehr zum Datenschutz')}
        </a>
      </p>

      <button type="submit" className="btn btn-primary btn-block" disabled={sending}>
        <Icon name="send" />
        {sending ? t('Sende …') : t('Einladungscode anfragen')}
      </button>
    </form>
  )
}
