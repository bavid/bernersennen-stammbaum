import { useState } from 'react'
import { api } from '../../api'
import { useTheme } from '../../themes/ThemeProvider.jsx'
import useArmed from '../../hooks/useArmed.js'
import { authCopyFor } from '../AccessSettings.jsx'
import KeyReveal from '../KeyReveal.jsx'
import Icon from '../Icon.jsx'
import { formatVoucherCode } from '../../lib/voucherCode.js'

// Gemeinsamen Schlüssel der Familie erneuern (Leitungs-Mitglied mit eigenem Zuhause, server/routes/
// members.js POST /key): derselbe Nachweis wie in AccessSettings - der EIGENE aktuelle Schlüssel bzw. das
// eigene Passwort (family.auth.kind) -, dann zweistufig bestätigen. Der neue Schlüssel erscheint genau
// einmal (KeyReveal). Wer mit dem gemeinsamen Schlüssel selbst angemeldet ist, sieht diesen Abschnitt
// nicht (MembersPage) - passiert es doch, zeigt der 400 des Servers den Weg in die eigenen Einstellungen.
export default function FamilyKeySection({ family, disabled }) {
  const { words } = useTheme()
  const copy = authCopyFor(family)
  const [confirmValue, setConfirmValue] = useState('')
  const [armed, setArmed] = useArmed()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [newKey, setNewKey] = useState(null)

  async function handleClick() {
    if (!armed) {
      setArmed(true)
      return
    }
    setError(null)
    setSaving(true)
    try {
      const { key } = await api.renewFamilyKey({ [copy.field]: confirmValue })
      setNewKey(key)
      setConfirmValue('')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
      setArmed(false)
    }
  }

  return (
    <section className="card members-section" aria-labelledby="family-key-title">
      <h2 id="family-key-title">Schlüssel {words.ofGroup} erneuern</h2>
      {newKey ? (
        <KeyReveal
          value={newKey}
          continueLabel="Fertig"
          showCardHint={false}
          note={`Wer „${family.name}“ bisher direkt mit dem alten Schlüssel geöffnet hat, braucht ab jetzt diesen. Deine eigene Anmeldung bleibt, wie sie ist.`}
          onContinue={() => setNewKey(null)}
        />
      ) : (
        <>
          <p className="muted">
            Mit dem gemeinsamen Schlüssel öffnet man {words.theGroup} direkt, ohne eigene Chronik. Nach dem Erneuern gilt
            nur noch der neue – alle, die so angemeldet waren, müssen sich neu anmelden.
          </p>
          {error && (
            <div className="error-banner" role="alert">
              {error}
            </div>
          )}
          <div className="field">
            <label className="field-label" htmlFor="family-key-confirm">
              {copy.label}
            </label>
            <input
              id="family-key-confirm"
              type={copy.mono ? 'text' : 'password'}
              className={copy.mono ? 'voucher-code-input' : undefined}
              value={confirmValue}
              onChange={(event) => setConfirmValue(copy.mono ? formatVoucherCode(event.target.value) : event.target.value)}
              placeholder={copy.mono ? 'XXXX-XXXX-XXXX' : undefined}
              autoComplete={copy.autoComplete}
              disabled={disabled}
            />
          </div>
          <button
            type="button"
            className={`btn ${armed ? 'btn-warning' : 'btn-ghost'}`}
            disabled={disabled || saving || !confirmValue}
            onClick={handleClick}
          >
            <Icon name={armed ? 'check' : 'lock'} />
            {saving ? 'Erneuere …' : armed ? 'Ja, Schlüssel erneuern' : 'Schlüssel erneuern'}
          </button>
        </>
      )}
    </section>
  )
}
