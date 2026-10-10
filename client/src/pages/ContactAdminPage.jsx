import { useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { api } from '../api'
import { useTheme } from '../themes/ThemeProvider.jsx'
import Icon from '../components/Icon.jsx'
import { useToast } from '../components/Toast.jsx'
import { getLang, t } from '../lib/i18n/index.js'

function buildTypes(words) {
  return {
    feedback: {
      label: t('Feedback'),
      icon: 'heart',
      prompt: t('Was gefällt dir, was fehlt dir, was könnte besser sein?'),
      placeholder: t('z. B. Es wäre toll, wenn man {entries} auch als Liste für alle {animals} sehen könnte.', {
        entries: words.entries,
        animals: words.animals
      })
    },
    problem: {
      label: t('Problem melden'),
      icon: 'alert',
      prompt: t('Was hast du gemacht, was ist passiert – und was hättest du erwartet?'),
      placeholder: t('z. B. Beim Hochladen eines Fotos von Tilda kam eine Fehlermeldung.')
    }
  }
}

function MessageForm({ fromPage, onSent }) {
  const { words } = useTheme()
  const lang = getLang()
  const TYPES = useMemo(() => buildTypes(words), [words, lang])
  const [type, setType] = useState('feedback')
  const [text, setText] = useState('')
  // Bewusst nicht vorausgefüllt: ohne Namen kommt die Nachricht anonym an
  const [autorName, setAutorName] = useState('')
  const [contact, setContact] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const config = TYPES[type]

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    setSaving(true)
    try {
      await api.sendMessage({ type, text, autorName, contact, page: type === 'problem' ? fromPage : undefined })
      onSent()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="card form-stack contact-form" onSubmit={handleSubmit}>
      <div className="segmented contact-type" role="group" aria-label={t('Art der Nachricht')}>
        {Object.entries(TYPES).map(([key, option]) => (
          <button type="button" key={key} aria-pressed={type === key} onClick={() => setType(key)}>
            <Icon name={option.icon} /> {option.label}
          </button>
        ))}
      </div>
      {error && <div className="error-banner" role="alert">{error}</div>}
      <div className="field">
        <label className="field-label" htmlFor="contact-text">
          {config.prompt}
        </label>
        <textarea
          id="contact-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={config.placeholder}
          maxLength={4000}
          rows={6}
          required
        />
      </div>
      <div className="form-grid">
        <div className="field">
          <label className="field-label" htmlFor="contact-name">
            {t('Dein Name')} <span className="muted">{t('(freiwillig)')}</span>
          </label>
          <input
            id="contact-name"
            value={autorName}
            onChange={(e) => setAutorName(e.target.value)}
            placeholder={t('leer lassen = anonym')}
            maxLength={60}
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="contact-reach">
            {t('Wie erreicht dich der Admin?')} <span className="muted">{t('(freiwillig)')}</span>
          </label>
          <input
            id="contact-reach"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder={t('E-Mail oder Telefon')}
            maxLength={120}
          />
        </div>
      </div>
      {type === 'problem' && (
        <p className="field-hint">
          {t('Damit sich das Problem nachvollziehen lässt, werden die zuletzt besuchte Seite{page} und dein Browser mitgeschickt.', {
            page: fromPage ? ` (${fromPage})` : ''
          })}
        </p>
      )}
      <button type="submit" className="btn btn-primary btn-lg" disabled={saving}>
        <Icon name="send" />
        {saving ? t('Sende …') : type === 'problem' ? t('Problem melden') : t('Feedback senden')}
      </button>
    </form>
  )
}

function SentNotice({ onAgain }) {
  return (
    <div className="card contact-sent" role="status">
      <span className="contact-sent-icon">
        <Icon name="check" />
      </span>
      <h2>{t('Danke, ist angekommen!')}</h2>
      <p className="muted">{t('Deine Nachricht liegt jetzt beim Admin – und nur dort.')}</p>
      <button type="button" className="btn btn-ghost" onClick={onAgain}>
        <Icon name="plus" /> {t('Noch etwas schreiben')}
      </button>
    </div>
  )
}

function PrivacyNote() {
  const { words } = useTheme()
  return (
    <aside className="contact-privacy" aria-labelledby="contact-privacy-title">
      <h2 id="contact-privacy-title">
        <Icon name="lock" /> {t('Bleibt unter uns')}
      </h2>
      <ul>
        <li>{t('Nur der Admin liest deine Nachricht. Die anderen {inGroup} sehen sie nicht – auch nicht hinterher.', { inGroup: words.inGroup })}</li>
        <li>{t('Dein Name ist freiwillig. Lässt du ihn leer, kommt die Nachricht anonym an.')}</li>
        <li>{t('Wenn du eine Antwort möchtest, hinterlass einfach eine E-Mail oder Telefonnummer.')}</li>
      </ul>
    </aside>
  )
}

export default function ContactAdminPage() {
  const location = useLocation()
  const fromPage = location.state?.from || null
  const [sent, setSent] = useState(false)
  const toast = useToast()

  function handleSent() {
    setSent(true)
    toast(t('Danke! Deine Nachricht ist beim Admin angekommen.'))
  }

  return (
    <div className="page">
      <header className="page-hero">
        <div>
          <span className="eyebrow">{t('Schreib dem Admin')}</span>
          <h1>{t('Schreib dem Admin')}</h1>
          <p className="page-lede">
            {t('Eine Idee, wie die Chronik besser wird – oder hakt irgendwo etwas? Schreib es hier, der Admin liest jede Nachricht.')}
          </p>
        </div>
      </header>

      <div className="contact-layout">
        {sent ? <SentNotice onAgain={() => setSent(false)} /> : <MessageForm fromPage={fromPage} onSent={handleSent} />}
        <PrivacyNote />
      </div>
    </div>
  )
}
