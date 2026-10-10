import { useId, useState } from 'react'
import { api } from '../api'
import { useIsDemo, useReadOnlyHint } from '../lib/demo.js'
import { hasOwnBot, isBotToken, telegramStatus } from '../lib/partnerTelegram.js'
import ConfirmButton from './ConfirmButton.jsx'
import Icon from './Icon.jsx'
import { useToast } from './Toast.jsx'
import { t } from '../lib/i18n/index.js'

const TOKEN_FORMAT_ERROR = 'Das sieht nicht wie ein Token von BotFather aus – er besteht aus einer Zahl, einem Doppelpunkt und vielen Zeichen.'
const EMPTY_ERROR = 'Bitte zuerst den Token einfügen.'
const SAVED_TOAST = 'Euer Bot ist eingerichtet.'
const REMOVED_TOAST = 'Der eigene Bot ist entfernt.'

// Die drei Schritte in schlichten Worten - der Partner hat BotFather vielleicht noch nie gesehen.
function Guide() {
  return (
    <ol className="telegram-bot-steps">
      <li>{t('In Telegram den Kontakt „BotFather“ öffnen (das ist der offizielle Helfer von Telegram).')}</li>
      <li>{t('Ihm „/newbot“ schicken und einen Namen für euren Bot wählen. BotFather antwortet mit einem langen Token.')}</li>
      <li>{t('Den Token hier einfügen und speichern – fertig.')}</li>
    </ol>
  )
}

// Das Token-Feld: nur zum Eintragen - ein gespeicherter Token wird nie wieder angezeigt (die Antwort des Servers nennt nur
// den Bot-Namen). Enter speichert, eine offensichtlich falsche Eingabe kommt gar nicht erst zum Server.
function TokenForm({ onSaved, onCancel, locked }) {
  const fieldId = useId()
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(event) {
    event.preventDefault()
    if (locked || busy) return
    const trimmed = token.trim()
    if (!trimmed) return setError(t(EMPTY_ERROR))
    if (!isBotToken(trimmed)) return setError(t(TOKEN_FORMAT_ERROR))
    setBusy(true)
    setError(null)
    try {
      onSaved(telegramStatus(await api.partnerArea.saveTelegramBot(trimmed)))
      setToken('')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="telegram-bot-form" onSubmit={handleSubmit} noValidate>
      <div className="field">
        <label className="field-label" htmlFor={fieldId}>
          {t('Token von BotFather')}
        </label>
        <input
          id={fieldId}
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={token}
          disabled={locked}
          placeholder="123456789:AbCd…"
          aria-describedby={`${fieldId}-hint`}
          aria-invalid={error ? 'true' : undefined}
          onChange={(event) => setToken(event.target.value)}
        />
        <p className="field-hint" id={`${fieldId}-hint`}>
          {t('Wird verschlüsselt gespeichert und nie wieder angezeigt.')}
        </p>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="telegram-bot-form-actions">
        <button type="submit" className="btn btn-primary" disabled={locked || busy}>
          <Icon name="check" />
          {busy ? t('Prüfe …') : t('Speichern')}
        </button>
        {onCancel && (
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
            {t('Abbrechen')}
          </button>
        )}
      </div>
    </form>
  )
}

// „Eigener Telegram-Bot“ in der Karte "Benachrichtigungen" (PartnerTelegramSection): Partner können statt des Team-Bots
// ihren eigenen Bot verwenden - Anleitung (drei Schritte), Token-Feld, danach „eingerichtet · @name“ mit „Bot wechseln“
// und „Bot entfernen“. Jede Antwort des Servers ist der neue Telegram-Status (onStatus). openByDefault: ohne jeden Bot
// steht die Anleitung gleich offen. Demo und Admin-Ansicht: sichtbar, gesperrt.
export default function TelegramOwnBot({ status, onStatus, openByDefault = false }) {
  const isDemo = useIsDemo()
  const readOnlyHint = useReadOnlyHint()
  const toast = useToast()
  const [editing, setEditing] = useState(openByDefault)
  const [removing, setRemoving] = useState(false)
  const [error, setError] = useState(null)
  const own = hasOwnBot(status)
  const titleId = useId()

  function handleSaved(next) {
    setEditing(false)
    onStatus(next)
    toast(t(SAVED_TOAST))
  }

  async function handleRemove() {
    setRemoving(true)
    setError(null)
    try {
      onStatus(telegramStatus(await api.partnerArea.removeTelegramBot()))
      setEditing(false)
      toast(t(REMOVED_TOAST))
    } catch (err) {
      setError(err.message)
    } finally {
      setRemoving(false)
    }
  }

  return (
    <section className="telegram-own-bot" aria-labelledby={titleId}>
      <h3 id={titleId}>{t('Eigener Telegram-Bot')}</h3>
      {own ? (
        <p className="telegram-state is-connected">
          <Icon name="check" />
          {t('Eingerichtet · @{name}', { name: status.bot.username })}
        </p>
      ) : (
        <p className="muted">
          {status.eingerichtet
            ? t('Zurzeit schreibt euch der Bot von Familie auf Pfoten. Ihr könnt stattdessen einen eigenen Bot verwenden.')
            : t('Mit einem eigenen Bot bekommt ihr die Hinweise direkt in Telegram – in drei Schritten eingerichtet.')}
        </p>
      )}
      {editing && (
        <>
          <Guide />
          <TokenForm onSaved={handleSaved} onCancel={own || status.eingerichtet ? () => setEditing(false) : null} locked={isDemo} />
        </>
      )}
      {!editing && (
        <div className="telegram-actions">
          <button type="button" className="btn btn-ghost" disabled={isDemo || removing} onClick={() => setEditing(true)}>
            <Icon name={own ? 'rotate' : 'plus'} />
            {own ? t('Bot wechseln') : t('Eigenen Bot einrichten')}
          </button>
          {own && <ConfirmButton label="Bot entfernen" confirmLabel="Wirklich entfernen?" icon="close" disabled={isDemo || removing} onConfirm={handleRemove} />}
        </div>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {isDemo && <p className="field-hint">{readOnlyHint}</p>}
    </section>
  )
}
