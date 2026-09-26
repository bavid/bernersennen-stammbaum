import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { api } from '../api'
import Icon from '../components/Icon.jsx'
import { useToast } from '../components/Toast.jsx'
import { relativeTime } from '../lib/dates.js'
import { readSetting, writeSetting } from '../lib/storage.js'

const TYPES = {
  feedback: {
    label: 'Feedback',
    icon: 'heart',
    prompt: 'Was gefällt dir, was fehlt dir, was könnte besser sein?',
    placeholder: 'z. B. Es wäre toll, wenn man Einträge auch als Liste für alle Hunde sehen könnte.'
  },
  problem: {
    label: 'Problem melden',
    icon: 'alert',
    prompt: 'Was hast du gemacht, was ist passiert – und was hättest du erwartet?',
    placeholder: 'z. B. Beim Hochladen eines Fotos von Trude kam eine Fehlermeldung.'
  }
}

const STATUS_LABEL = { offen: 'offen', erledigt: 'erledigt' }

function MessageForm({ fromPage, onSent }) {
  const [type, setType] = useState('feedback')
  const [text, setText] = useState('')
  const [autorName, setAutorName] = useState(() => readSetting('autorName', ''))
  const [contact, setContact] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const config = TYPES[type]

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    setSaving(true)
    try {
      writeSetting('autorName', autorName.trim())
      const sent = await api.sendMessage({ type, text, autorName, contact, page: type === 'problem' ? fromPage : undefined })
      onSent(sent)
      setText('')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="card form-stack contact-form" onSubmit={handleSubmit}>
      <div className="segmented contact-type" role="group" aria-label="Art der Nachricht">
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
            Dein Name
          </label>
          <input id="contact-name" value={autorName} onChange={(e) => setAutorName(e.target.value)} maxLength={60} required />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="contact-reach">
            Wie erreicht dich der Admin? <span className="muted">(optional)</span>
          </label>
          <input
            id="contact-reach"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="E-Mail oder Telefon"
            maxLength={120}
          />
        </div>
      </div>
      {type === 'problem' && (
        <p className="field-hint">
          Damit sich das Problem nachvollziehen lässt, werden die zuletzt besuchte Seite
          {fromPage ? ` (${fromPage})` : ''} und dein Browser mitgeschickt.
        </p>
      )}
      <button type="submit" className="btn btn-primary btn-lg" disabled={saving}>
        <Icon name="send" />
        {saving ? 'Sende …' : type === 'problem' ? 'Problem melden' : 'Feedback senden'}
      </button>
    </form>
  )
}

export default function ContactAdminPage() {
  const location = useLocation()
  const fromPage = location.state?.from || null
  const [messages, setMessages] = useState(null)
  const toast = useToast()

  useEffect(() => {
    api
      .listMessages()
      .then(setMessages)
      .catch(() => setMessages([]))
  }, [])

  function handleSent(message) {
    setMessages((current) => [message, ...(current || [])])
    toast('Danke! Deine Nachricht ist beim Admin angekommen.')
  }

  return (
    <div className="page">
      <header className="page-hero">
        <div>
          <span className="eyebrow">Schreib dem Admin</span>
          <h1>Schreib dem Admin</h1>
          <p className="page-lede">
            Eine Idee, wie die Chronik besser wird – oder hakt irgendwo etwas? Schreib es hier, der Admin liest jede
            Nachricht.
          </p>
        </div>
      </header>

      <div className="contact-layout">
        <MessageForm fromPage={fromPage} onSent={handleSent} />

        <section aria-labelledby="contact-history" className="contact-history">
          <h2 id="contact-history" className="section-title">
            Eure Nachrichten
          </h2>
          {messages && messages.length === 0 && <p className="muted">Aus eurem Rudel wurde noch nichts geschrieben.</p>}
          {messages && messages.length > 0 && (
            <ul className="contact-list">
              {messages.map((message) => (
                <li key={message.id} className={`contact-item is-${message.status}`}>
                  <span className={`pill ${message.type === 'problem' ? 'pill-rust' : ''}`}>{TYPES[message.type].label}</span>
                  <span className={`contact-status is-${message.status}`}>
                    {message.status === 'erledigt' && <Icon name="check" />}
                    {STATUS_LABEL[message.status]}
                  </span>
                  <p className="contact-text">{message.text}</p>
                  <p className="contact-meta">
                    {message.autor_name} · {relativeTime(message.created_at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
