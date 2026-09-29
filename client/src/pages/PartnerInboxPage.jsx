import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { useIsDemo, useReadOnlyHint } from '../lib/demo.js'
import { withUnread } from '../lib/navItems.js'
import { EMPTY_HINT, RETENTION_HINT } from '../lib/partnerInbox.js'
import Icon from '../components/Icon.jsx'
import InboxMessage from '../components/InboxMessage.jsx'
import { useToast } from '../components/Toast.jsx'

const DEMO_HINT_ID = 'inbox-demo-hint'
const DEMO_INBOX_HINT = 'In der Demo nur zum Ansehen – als gelesen markieren und löschen geht hier nicht.'

// /nachrichten (Phase P2) - das Postfach eines Partner- oder Tierheim-Bereichs: Nachrichten aus
// "Schreib uns" auf Portal und Steckbrief, neueste zuerst (wie der Server sie liefert). Öffnen markiert
// eine ungelesene Nachricht über die API als gelesen. Die Zahl der ungelesenen hält die Seite selbst
// (Startwert unread vom Server) und schreibt sie über onFamilyChange (= setFamily in App.jsx) nach
// me.partner.unread - so stimmt das Badge "Nachrichten" in der Navigation ohne weitere Anfrage.
export default function PartnerInboxPage({ family, onFamilyChange }) {
  const isDemo = useIsDemo()
  const readOnlyHint = useReadOnlyHint(DEMO_INBOX_HINT)
  const toast = useToast()
  const [messages, setMessages] = useState(undefined)
  const [unread, setUnread] = useState(null)
  const [openId, setOpenId] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [error, setError] = useState(null)
  // Laufende "gelesen"-Anfragen - ein Doppelklick schickt keine zweite.
  const pendingRead = useRef(new Set())
  const name = family.partner?.name || family.name

  useEffect(() => {
    let cancelled = false
    api.partnerArea
      .messages()
      .then((data) => {
        if (cancelled) return
        const list = Array.isArray(data?.messages) ? data.messages : []
        setMessages(list)
        setUnread(Number.isInteger(data?.unread) ? data.unread : list.filter((message) => !message.gelesen).length)
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (unread === null || typeof onFamilyChange !== 'function') return
    onFamilyChange((current) => withUnread(current, unread))
  }, [unread, onFamilyChange])

  async function markRead(message) {
    if (isDemo || message.gelesen || pendingRead.current.has(message.id)) return
    pendingRead.current.add(message.id)
    setError(null)
    try {
      const updated = await api.partnerArea.markMessageRead(message.id)
      const gelesenAt = updated?.gelesenAt ?? null
      setMessages((list) => list.map((item) => (item.id === message.id ? { ...item, gelesen: true, gelesenAt } : item)))
      setUnread((count) => Math.max(0, count - 1))
    } catch (err) {
      setError(err.message)
    } finally {
      pendingRead.current.delete(message.id)
    }
  }

  function toggle(message) {
    const opening = openId !== message.id
    setOpenId(opening ? message.id : null)
    if (opening) markRead(message)
  }

  async function remove(message) {
    setError(null)
    try {
      await api.partnerArea.deleteMessage(message.id)
      setMessages((list) => list.filter((item) => item.id !== message.id))
      if (!message.gelesen) setUnread((count) => Math.max(0, count - 1))
      if (openId === message.id) setOpenId(null)
      toast('Nachricht gelöscht.')
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="page partner-inbox-page">
      <header className="page-hero">
        <div>
          <span className="eyebrow">{name}</span>
          <h1>Nachrichten</h1>
          <p className="page-lede">Was Menschen euch über „Schreib uns“ auf eurem Portal oder einem Steckbrief schreiben.</p>
        </div>
      </header>

      {/* Phase U: Zähler, Aufbewahrung und Demo-Hinweis als eine ruhige Kopfzeile direkt über der Liste. */}
      <div className="inbox">
        <div className="inbox-meta">
          {messages?.length > 0 && (
            <p className="inbox-summary" aria-live="polite">
              {messages.length} {messages.length === 1 ? 'Nachricht' : 'Nachrichten'}
              {unread > 0 ? `, davon ${unread} ungelesen` : ''}
            </p>
          )}
          <p className="inbox-retention" role="note">
            <Icon name="clock" />
            {RETENTION_HINT}
          </p>
          {isDemo && (
            <p id={DEMO_HINT_ID} className="field-hint">
              {readOnlyHint}
            </p>
          )}
        </div>

        {(error || loadError) && (
          <div className="error-banner" role="alert">
            {error || loadError}
          </div>
        )}
        {messages === undefined && !loadError && <p className="muted">Lade …</p>}
        {messages?.length === 0 && (
          <div className="empty-state card inbox-empty">
            <Icon name="inbox" />
            <p>{EMPTY_HINT}</p>
          </div>
        )}
        {messages?.length > 0 && (
          <ul className="inbox-list">
            {messages.map((message) => (
              <InboxMessage
                key={message.id}
                message={message}
                open={openId === message.id}
                onToggle={() => toggle(message)}
                onMarkRead={() => markRead(message)}
                onDelete={() => remove(message)}
                demoHintId={isDemo ? DEMO_HINT_ID : undefined}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
