import { useState } from 'react'
import { api } from '../api'
import useFocusFirstError from '../hooks/useFocusFirstError.js'
import AdminField, { fieldProps } from './AdminField.jsx'
import Honeypot from './Honeypot.jsx'
import Icon from './Icon.jsx'
import KontaktMerkenHinweis from './KontaktMerkenHinweis.jsx'
import { kontaktFor, saveKontakt } from '../lib/kontaktDefaults.js'
import {
  EMPTY_CONTACT_FORM,
  MAX_NACHRICHT_LENGTH,
  MAX_NAME_LENGTH,
  MIN_NACHRICHT_LENGTH,
  contactClientErrors,
  contactErrorField,
  contactErrorMessage,
  toContactPayload
} from '../lib/contactPartner.js'
import { t } from '../lib/i18n/index.js'
import { Button } from './ui/index.js'

const IDS = {
  name: 'contact-partner-name',
  email: 'contact-partner-email',
  telefon: 'contact-partner-telefon',
  nachricht: 'contact-partner-nachricht'
}
const HONEYPOT_ID = 'contact-partner-hp'
const REACHABLE_HINT_ID = 'contact-partner-reachable-hint'
const REACHABLE_FIELDS = ['email', 'telefon']

function withoutKeys(object, keys) {
  return Object.fromEntries(Object.entries(object).filter(([key]) => !keys.includes(key)))
}

function contactIntro(partner) {
  const person = typeof partner.ansprechperson === 'string' ? partner.ansprechperson.trim() : ''
  return person ? t('Deine Nachricht geht an {person} von {name}.', { person, name: partner.name }) : null
}

function nachrichtHint(length) {
  const minimum = length < MIN_NACHRICHT_LENGTH ? ` · ${t('mindestens {n}', { n: MIN_NACHRICHT_LENGTH })}` : ''
  return `${t('{n} / {max} Zeichen', { n: length, max: MAX_NACHRICHT_LENGTH })}${minimum}`
}

// "Schreib uns" (Phase P2): Nachricht an einen Partner, landet in dessen Postfach (/nachrichten). Name
// freiwillig, E-Mail ODER Telefon Pflicht (sonst gäbe es keine Antwort), Nachricht 10-2000 Zeichen, dazu
// der Honigtopf "website" (Honeypot). bezugSlug: vom Steckbrief aus das Tier, um das es geht. demo: '1',
// wenn das Portal mit ?demo=1 geladen wurde. Nach dem Absenden bleibt das Formular leer stehen, darüber
// der Dank. Fehler stehen am Feld (400) oder oben (403 Demo, 404, 429) - der Fokus springt hin.
export default function ContactPartnerForm({ partner, bezugSlug, demo }) {
  const [form, setForm] = useState(() => ({ ...EMPTY_CONTACT_FORM, ...kontaktFor(EMPTY_CONTACT_FORM) }))
  const [website, setWebsite] = useState('')
  const [fieldErrorKeys, setFieldErrors] = useState({})
  // Meldungen bleiben deutsch im State und werden erst beim Anzeigen übersetzt.
  const fieldErrors = Object.fromEntries(Object.entries(fieldErrorKeys).map(([key, message]) => [key, message && t(message)]))
  const [error, setError] = useState(null)
  const [sent, setSent] = useState(false)
  const [sending, setSending] = useState(false)
  const { formRef, bannerRef, focusFirstError } = useFocusFirstError()
  const bind = (key, { hint } = {}) => fieldProps(IDS[key], { error: fieldErrors[key], hint })
  const intro = contactIntro(partner)

  function update(patch) {
    setForm((current) => ({ ...current, ...patch }))
    // E-Mail und Telefon hängen zusammen: wer eins davon ausfüllt, erledigt den Fehler "eins von beiden".
    const keys = Object.keys(patch)
    const cleared = keys.some((key) => REACHABLE_FIELDS.includes(key)) ? [...keys, ...REACHABLE_FIELDS] : keys
    setFieldErrors((current) => withoutKeys(current, cleared))
    setSent(false)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    setSent(false)
    const clientErrors = contactClientErrors(form)
    setFieldErrors(clientErrors)
    if (Object.keys(clientErrors).length) {
      focusFirstError()
      return
    }

    setSending(true)
    try {
      const payload = { ...toContactPayload(form), ...(bezugSlug ? { bezugSlug } : {}), website }
      await api.contactPartner(partner.slug, payload, { demo })
      saveKontakt(form)
      setForm({ ...EMPTY_CONTACT_FORM, ...kontaktFor(EMPTY_CONTACT_FORM) })
      setSent(true)
    } catch (err) {
      const field = contactErrorField(err)
      if (field) setFieldErrors({ [field]: err.message })
      else setError(contactErrorMessage(err))
      focusFirstError()
    } finally {
      setSending(false)
    }
  }

  return (
    <form ref={formRef} className="contact-partner-form form-stack" onSubmit={handleSubmit} noValidate>
      {/* Phase V4b: an wen die Nachricht geht - nur mit Ansprechperson (den Partner nennt schon der Titel des Dialogs). */}
      {intro && <p className="contact-partner-intro">{intro}</p>}
      {sent && (
        <p className="contact-partner-success" role="status">
          <Icon name="check" />
          {t('Danke! {name} meldet sich bei dir.', { name: partner.name })}
        </p>
      )}
      {error && (
        <div ref={bannerRef} className="error-banner" role="alert" tabIndex={-1}>
          {t(error)}
        </div>
      )}

      <AdminField id={IDS.name} label={t('Dein Name (freiwillig)')} error={fieldErrors.name}>
        <input {...bind('name')} value={form.name} onChange={(e) => update({ name: e.target.value })} maxLength={MAX_NAME_LENGTH} autoComplete="name" />
      </AdminField>

      <fieldset className="contact-partner-reachable" aria-describedby={REACHABLE_HINT_ID}>
        <legend>{t('So erreicht {name} dich', { name: partner.name })}</legend>
        <p className="field-hint" id={REACHABLE_HINT_ID}>
          {t('E-Mail oder Telefon – mindestens eins davon.')}
        </p>
        <div className="form-grid">
          <AdminField id={IDS.email} label={t('E-Mail')} error={fieldErrors.email}>
            <input {...bind('email')} type="email" value={form.email} onChange={(e) => update({ email: e.target.value })} autoComplete="email" />
          </AdminField>
          <AdminField id={IDS.telefon} label={t('Telefon')} error={fieldErrors.telefon}>
            <input {...bind('telefon')} type="tel" value={form.telefon} onChange={(e) => update({ telefon: e.target.value })} autoComplete="tel" />
          </AdminField>
        </div>
      </fieldset>
      <KontaktMerkenHinweis />

      <AdminField id={IDS.nachricht} label={t('Deine Nachricht')} hint={nachrichtHint(form.nachricht.trim().length)} error={fieldErrors.nachricht}>
        <textarea
          {...bind('nachricht', { hint: true })}
          value={form.nachricht}
          onChange={(e) => update({ nachricht: e.target.value })}
          maxLength={MAX_NACHRICHT_LENGTH}
          rows={6}
        />
      </AdminField>

      <Honeypot id={HONEYPOT_ID} value={website} onChange={setWebsite} />

      <p className="contact-partner-privacy">
        {t('Deine Angaben gehen nur an {name}. Wir verschicken keine E-Mails; Nachrichten werden nach 180 Tagen gelöscht.', {
          name: partner.name
        })}{' '}
        <a href="/datenschutz" target="_blank" rel="noopener noreferrer">
          {t('Mehr zum Datenschutz')}
        </a>
      </p>

      <Button type="submit" block disabled={sending}>
        <Icon name="send" />
        {sending ? t('Sende …') : t('Nachricht senden')}
      </Button>
    </form>
  )
}
