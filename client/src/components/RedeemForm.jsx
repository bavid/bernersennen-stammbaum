import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import Icon from './Icon.jsx'
import Honeypot from './Honeypot.jsx'
import RedeemAccountFields, { EMPTY_ACCOUNT, accountPayload } from './RedeemAccountFields.jsx'
import PartnerSetupFields from './PartnerSetupFields.jsx'
import useFocusFirstError from '../hooks/useFocusFirstError.js'
import { formatVoucherCode, isCompleteVoucherCode } from '../lib/voucherCode.js'
import { partnerAccessFrom, partnerSetupPayload, validatePartnerSetup } from '../lib/partnerSetup.js'

const NAME_MAX_LENGTH = 80
const EMPTY_PARTNER_VALUES = { name: '', typ: '', plz: '' }

const STATUS_TEXT = {
  offen: 'Gutschein gültig',
  eingelöst: 'Dieser Gutschein wurde schon eingelöst.',
  abgelaufen: 'Dieser Gutschein ist abgelaufen.',
  widerrufen: 'Dieser Gutschein wurde zurückgezogen.',
  unbekannt: 'Diesen Gutschein kennen wir nicht.'
}

function withoutKeys(object, keys) {
  return Object.fromEntries(Object.entries(object).filter(([key]) => !keys.includes(key)))
}

// Ein Gutschein wird zu "Meiner Chronik": Code, Name fürs Zuhause, optional ein eigener Benutzer. Ein
// Partner-Zugang (api.checkVoucher meldet zweck 'partnerzugang', Phase P) richtet stattdessen ein
// Partner-Profil ein (PartnerSetupFields). onRedeemed bekommt die volle Server-Antwort (inkl.
// key/fromOthers) – die aufrufende Seite entscheidet, was damit passiert (erst den Schlüssel zeigen,
// siehe KeyReveal).
export default function RedeemForm({ initialCode = '', hint = null, onRedeemed }) {
  const [code, setCode] = useState(() => formatVoucherCode(initialCode))
  const [name, setName] = useState('')
  const [partnerValues, setPartnerValues] = useState(EMPTY_PARTNER_VALUES)
  const [partnerErrors, setPartnerErrors] = useState({})
  const [account, setAccount] = useState(EMPTY_ACCOUNT)
  const [website, setWebsite] = useState('')
  // Antwort von api.checkVoucher für den aktuellen Code: status, bei einem Übergabe-Gutschein handover
  // { animalName, shelterName } (Umzugs-Hinweis und Einwilligung "Tierheim darf weiter mitlesen",
  // shelterMayRead geht als optionales Feld an api.redeemVoucher), bei einem Partner-Zugang zweck.
  const [checkResult, setCheckResult] = useState(null)
  const [shelterMayRead, setShelterMayRead] = useState(false)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  // Der Code, für den eine Prüfung gilt: eine späte Antwort zu einem inzwischen geänderten Code wird verworfen.
  const latestCode = useRef(code)
  const { formRef, bannerRef, focusFirstError } = useFocusFirstError()

  const status = checkResult?.status || null
  const handover = checkResult?.handover || null
  const partnerAccess = partnerAccessFrom(checkResult)

  async function checkCode(value) {
    setChecking(true)
    try {
      const result = await api.checkVoucher(value)
      if (latestCode.current === value) setCheckResult(result || null)
    } catch {
      if (latestCode.current === value) setCheckResult(null)
    } finally {
      setChecking(false)
    }
  }

  // Ein vorausgefüllter Code (/v#CODE) wird gleich geprüft - sonst sähe ein Partner bis zum ersten
  // Verlassen des Code-Felds das Kunden-Formular statt "Partner-Profil einrichten".
  useEffect(() => {
    if (isCompleteVoucherCode(latestCode.current)) checkCode(latestCode.current)
  }, [])

  function handleCodeChange(value) {
    const formatted = formatVoucherCode(value)
    latestCode.current = formatted
    setCode(formatted)
    setCheckResult(null)
    setShelterMayRead(false)
    setPartnerErrors({})
  }

  function handleCodeBlur() {
    if (!isCompleteVoucherCode(code) || checkResult) return
    checkCode(code)
  }

  function handlePartnerChange(patch) {
    setPartnerValues((current) => ({ ...current, ...patch }))
    setPartnerErrors((current) => withoutKeys(current, Object.keys(patch)))
  }

  function fieldsPayload() {
    if (partnerAccess) return partnerSetupPayload(partnerValues, partnerAccess)
    return { name, shelterMayRead: handover ? shelterMayRead : undefined }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    if (partnerAccess) {
      const errors = validatePartnerSetup(partnerValues, partnerAccess)
      setPartnerErrors(errors)
      if (Object.keys(errors).length > 0) {
        focusFirstError()
        return
      }
    }
    setLoading(true)
    try {
      const me = await api.redeemVoucher({ code, ...fieldsPayload(), ...accountPayload(account), website })
      onRedeemed(me)
    } catch (err) {
      setError(err.message)
      setLoading(false)
      focusFirstError()
    }
  }

  const knownInvalid = Boolean(status) && status !== 'offen'
  const statusText = status ? STATUS_TEXT[status] || STATUS_TEXT.unbekannt : null
  const submitLabel = partnerAccess ? 'Partner-Profil einrichten' : 'Meine Chronik anlegen'

  return (
    <form ref={formRef} className="form-stack" onSubmit={handleSubmit}>
      {hint && !partnerAccess && (
        <p className="field-hint redeem-hint" role="status">
          {hint}
        </p>
      )}
      {error && (
        <div ref={bannerRef} className="error-banner" role="alert" tabIndex={-1}>
          {error}
        </div>
      )}
      <div className={`field ${knownInvalid ? 'has-error' : ''}`}>
        <label className="field-label" htmlFor="redeem-code">
          Gutscheincode
        </label>
        <input
          id="redeem-code"
          className="voucher-code-input"
          value={code}
          onChange={(e) => handleCodeChange(e.target.value)}
          onBlur={handleCodeBlur}
          placeholder="XXXX-XXXX-XXXX"
          autoComplete="off"
          autoFocus
          required
        />
        {checking && <p className="field-hint">Prüfe …</p>}
        {!checking && statusText && (
          <p className={status === 'offen' ? 'field-hint field-hint-success' : 'field-error'} role={status === 'offen' ? 'status' : 'alert'}>
            {status !== 'offen' && <Icon name="alert" />} {statusText}
          </p>
        )}
      </div>
      {partnerAccess ? (
        <PartnerSetupFields access={partnerAccess} values={partnerValues} errors={partnerErrors} onChange={handlePartnerChange} />
      ) : (
        <>
          {handover && (
            <div className="handover-notice" role="status">
              <p>
                Mit diesem Gutschein zieht {handover.animalName} aus {handover.shelterName} zu euch – mit der ganzen Chronik.
              </p>
              <label className="check">
                <input type="checkbox" checked={shelterMayRead} onChange={(e) => setShelterMayRead(e.target.checked)} />
                {handover.shelterName} darf weiter mitlesen (freiwillig, jederzeit widerrufbar)
              </label>
            </div>
          )}
          <div className="field">
            <label className="field-label" htmlFor="redeem-name">
              Wie heißt euer Zuhause?
            </label>
            <input
              id="redeem-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z. B. Zuhause am Deich"
              maxLength={NAME_MAX_LENGTH}
              required
            />
          </div>
        </>
      )}
      <RedeemAccountFields value={account} onChange={setAccount} />
      <Honeypot value={website} onChange={setWebsite} />
      <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={loading || knownInvalid}>
        {loading ? 'Lege an …' : submitLabel}
      </button>
      {partnerAccess && (
        <p className="field-hint partner-setup-hint">Privat eine eigene Chronik führen? Dafür gibt es Kunden-Gutscheine.</p>
      )}
    </form>
  )
}
