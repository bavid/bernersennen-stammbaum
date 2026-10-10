import { useState } from 'react'
import { api } from '../api'
import AdminField, { fieldProps } from './AdminField.jsx'
import { chatLabel, notifyErrorMessage } from '../lib/adminNotify.js'
import { Button } from './ui/index.js'

const TOKEN_ID = 'admin-notify-token'
const CHAT_ID = 'admin-notify-chat-id'

// Schritt 2: Bot-Token eintragen. Der Server prüft ihn bei Telegram (getMe) und speichert ihn verschlüsselt; zurück
// kommt nur tokenHinweis ("…abcd"). Das Feld bleibt danach leer - der Token wird nie wieder angezeigt.
function TokenForm({ settings, onChange }) {
  const [token, setToken] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const hint = settings.tokenHinweis
    ? `Gespeichert: ${settings.tokenHinweis} – der Token wird nie wieder angezeigt. Ein neuer ersetzt ihn.`
    : 'Wird verschlüsselt gespeichert und nie wieder angezeigt.'

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    if (!token.trim()) return setError('Bitte zuerst den Bot-Token einfügen.')
    setSaving(true)
    try {
      onChange(await api.admin.saveTelegram({ token: token.trim() }))
      setToken('')
    } catch (err) {
      setError(notifyErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="admin-notify-inline" onSubmit={handleSubmit} noValidate>
      <AdminField id={TOKEN_ID} label="Bot-Token" hint={hint} error={error}>
        <input
          {...fieldProps(TOKEN_ID, { error, hint: true })}
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
      </AdminField>
      <Button type="submit" variant="ink" disabled={saving}>
        {saving ? 'Prüfe …' : 'Speichern'}
      </Button>
    </form>
  )
}

// Schritt 4: Chat wählen. "Chat finden" fragt Telegram nach den Chats, die dem Bot zuletzt geschrieben haben; ein
// Klick trägt die ID ins Feld - oder man trägt sie von Hand ein. Erst "Speichern" übernimmt sie. AdminNotify hängt
// diese Form mit key={chatId} ein: nach dem Speichern oder Entfernen beginnt sie frisch.
function ChatForm({ settings, onChange }) {
  const [chatId, setChatId] = useState(settings.chatId || '')
  const [chats, setChats] = useState(null)
  const [finding, setFinding] = useState(false)
  const [findError, setFindError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const hint = settings.chatId
    ? `Gespeichert: ${settings.chatId}`
    : 'Wird beim Auswählen eingetragen – oder von Hand (Zahl oder @kanalname).'

  async function handleFind() {
    setFindError(null)
    setFinding(true)
    try {
      setChats(await api.admin.findTelegramChats())
    } catch (err) {
      setFindError(notifyErrorMessage(err))
    } finally {
      setFinding(false)
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    if (!chatId.trim()) return setError('Bitte einen Chat wählen oder die Chat-ID eintragen.')
    setSaving(true)
    try {
      onChange(await api.admin.saveTelegram({ chatId: chatId.trim() }))
    } catch (err) {
      setError(notifyErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="admin-notify-chat">
      <Button type="button" variant="ghost" onClick={handleFind} disabled={finding}>
        {finding ? 'Suche …' : 'Chat finden'}
      </Button>
      {findError && (
        <p className="field-error" role="alert">
          {findError}
        </p>
      )}
      {chats && chats.length === 0 && (
        <p className="field-hint">Keine Chats gefunden – dem Bot zuerst „/start“ schreiben, dann noch einmal suchen.</p>
      )}
      {chats && chats.length > 0 && (
        <fieldset className="admin-notify-chats">
          <legend className="field-label">Gefundene Chats</legend>
          {chats.map((chat) => (
            <label key={chat.id} className="check">
              <input type="radio" name="admin-notify-chat" checked={chatId === chat.id} onChange={() => setChatId(chat.id)} />
              {chatLabel(chat)}
            </label>
          ))}
        </fieldset>
      )}
      <form className="admin-notify-inline" onSubmit={handleSubmit} noValidate>
        <AdminField id={CHAT_ID} label="Chat-ID" hint={hint} error={error}>
          <input {...fieldProps(CHAT_ID, { error, hint: true })} value={chatId} onChange={(e) => setChatId(e.target.value)} spellCheck={false} />
        </AdminField>
        <Button type="submit" variant="ink" disabled={saving}>
          {saving ? 'Speichere …' : 'Speichern'}
        </Button>
      </form>
    </div>
  )
}

// Schritt 5: Testnachricht - erst möglich, wenn Token und Chat stehen (eingerichtet).
function TestMessage({ eingerichtet }) {
  const [state, setState] = useState({ phase: 'idle' })

  async function handleSend() {
    setState({ phase: 'sending' })
    try {
      await api.admin.sendNotifyTest()
      setState({ phase: 'sent' })
    } catch (err) {
      setState({ phase: 'error', message: notifyErrorMessage(err) })
    }
  }

  return (
    <div className="admin-notify-test">
      <Button type="button" variant="ghost" onClick={handleSend} disabled={!eingerichtet || state.phase === 'sending'}>
        {state.phase === 'sending' ? 'Sende …' : 'Testnachricht senden'}
      </Button>
      {!eingerichtet && <p className="field-hint">Geht, sobald Bot-Token und Chat gespeichert sind.</p>}
      {state.phase === 'sent' && (
        <p className="field-hint-success" role="status">
          Testnachricht verschickt – schau in Telegram nach.
        </p>
      )}
      {state.phase === 'error' && (
        <p className="field-error" role="alert">
          {state.message}
        </p>
      )}
    </div>
  )
}

// Einrichtung in fünf kurzen Schritten (AdminNotify). settings: Antwort von GET /api/admin/notify-settings;
// onChange bekommt nach jedem Speichern die neue Antwort.
export default function AdminNotifySetup({ settings, onChange }) {
  return (
    <ol className="admin-notify-steps">
      <li>
        <h3>Bot anlegen</h3>
        <p>In Telegram @BotFather öffnen, „/newbot“ schicken, einen Namen wählen und den Token kopieren, den BotFather schickt.</p>
      </li>
      <li>
        <h3>Token speichern</h3>
        <TokenForm settings={settings} onChange={onChange} />
      </li>
      <li>
        <h3>Bot starten</h3>
        <p>Dem eigenen Bot in Telegram „/start“ schreiben – vorher darf er dir keine Nachrichten schicken.</p>
      </li>
      <li>
        <h3>Chat wählen</h3>
        <ChatForm key={settings.chatId || 'ohne'} settings={settings} onChange={onChange} />
      </li>
      <li>
        <h3>Testen</h3>
        <TestMessage eingerichtet={settings.eingerichtet} />
      </li>
    </ol>
  )
}
