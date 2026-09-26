import { useEffect, useState } from 'react'
import { api } from '../api'
import Icon from './Icon.jsx'
import ConfirmButton from './ConfirmButton.jsx'
import { relativeTime } from '../lib/dates.js'

const TYPE_FILTERS = [
  ['', 'Alle'],
  ['feedback', 'Feedback'],
  ['problem', 'Probleme']
]
const STATUS_FILTERS = [
  ['offen', 'Offen'],
  ['erledigt', 'Erledigt'],
  ['', 'Alle']
]

function Filter({ label, options, value, onChange }) {
  return (
    <div className="segmented segmented-sm" role="group" aria-label={label}>
      {options.map(([key, text]) => (
        <button type="button" key={key || 'all'} aria-pressed={value === key} onClick={() => onChange(key)}>
          {text}
        </button>
      ))}
    </div>
  )
}

function Message({ message, onStatus, onDelete }) {
  const done = message.status === 'erledigt'
  return (
    <li className={`admin-message is-${message.type} ${done ? 'is-done' : ''}`}>
      <div className="admin-message-head">
        <span className={`pill ${message.type === 'problem' ? 'pill-rust' : ''}`}>
          <Icon name={message.type === 'problem' ? 'alert' : 'heart'} />
          {message.type === 'problem' ? 'Problem' : 'Feedback'}
        </span>
        <strong>{message.autor_name}</strong>
        <span className="muted">
          {message.family_name} · {relativeTime(message.created_at)}
        </span>
        {done && <span className="pill">erledigt {message.resolved_at ? relativeTime(message.resolved_at) : ''}</span>}
      </div>
      <p className="admin-message-text">{message.text}</p>
      <dl className="admin-message-details">
        {message.contact && (
          <div>
            <dt>Kontakt</dt>
            <dd>{message.contact}</dd>
          </div>
        )}
        {message.page && (
          <div>
            <dt>Seite</dt>
            <dd>{message.page}</dd>
          </div>
        )}
        {message.user_agent && (
          <div>
            <dt>Browser</dt>
            <dd className="admin-message-ua">{message.user_agent}</dd>
          </div>
        )}
      </dl>
      <div className="admin-message-actions">
        <button type="button" className="btn btn-ghost" onClick={() => onStatus(message, done ? 'offen' : 'erledigt')}>
          <Icon name={done ? 'arrowLeft' : 'check'} />
          {done ? 'Wieder öffnen' : 'Als erledigt markieren'}
        </button>
        <ConfirmButton onConfirm={() => onDelete(message)} label="Löschen" confirmLabel="Wirklich löschen?" />
      </div>
    </li>
  )
}

// "Schreib dem Admin" – Posteingang im Admin-Bereich
export default function AdminMessages({ onCountChange }) {
  const [type, setType] = useState('')
  const [status, setStatus] = useState('offen')
  const [messages, setMessages] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.admin
      .messages({ type, status })
      .then(setMessages)
      .catch((err) => setError(err.message))
  }, [type, status])

  async function handleStatus(message, next) {
    try {
      await api.admin.updateMessage(message.id, next)
      setMessages((list) => (status ? list.filter((m) => m.id !== message.id) : list.map((m) => (m.id === message.id ? { ...m, status: next } : m))))
      onCountChange(next === 'erledigt' ? -1 : 1)
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDelete(message) {
    try {
      await api.admin.deleteMessage(message.id)
      setMessages((list) => list.filter((m) => m.id !== message.id))
      if (message.status === 'offen') onCountChange(-1)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <section className="admin-inbox" aria-labelledby="admin-inbox-title">
      <div className="admin-inbox-head">
        <h2 id="admin-inbox-title">Nachrichten</h2>
        <Filter label="Art" options={TYPE_FILTERS} value={type} onChange={setType} />
        <Filter label="Status" options={STATUS_FILTERS} value={status} onChange={setStatus} />
      </div>
      {error && <div className="error-banner" role="alert">{error}</div>}
      {messages && messages.length === 0 && (
        <p className="muted admin-inbox-empty">Keine Nachrichten für diesen Filter.</p>
      )}
      {messages && messages.length > 0 && (
        <ul className="admin-messages">
          {messages.map((message) => (
            <Message key={message.id} message={message} onStatus={handleStatus} onDelete={handleDelete} />
          ))}
        </ul>
      )}
    </section>
  )
}
