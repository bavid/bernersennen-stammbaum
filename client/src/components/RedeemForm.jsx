import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import Icon from './Icon.jsx'
import Honeypot from './Honeypot.jsx'
import RedeemAccountFields, { EMPTY_ACCOUNT, accountPayload } from './RedeemAccountFields.jsx'
import PartnerSetupFields from './PartnerSetupFields.jsx'
import HandoverConsent from './HandoverConsent.jsx'
import useFocusFirstError from '../hooks/useFocusFirstError.js'
import { formatVoucherCode, isCompleteVoucherCode } from '../lib/voucherCode.js'
import { partnerAccessFrom, partnerSetupPayload, validatePartnerSetup } from '../lib/partnerSetup.js'
import { useT } from '../lib/i18n/index.js'
import { Button } from './ui/index.js'

const NAME_MAX_LENGTH = 80
const EMPTY_PARTNER_VALUES = { name: '', typ: '', plz: '' }

const STATUS_KEYS = {
  offen: 'login.redeemForm.valid',
  eingelöst: 'login.redeemForm.redeemed',
  abgelaufen: 'login.redeemForm.expired',
  widerrufen: 'login.redeemForm.revoked',
  unbekannt: 'login.redeemForm.unknown'
}

function withoutKeys(object, keys) {
  return Object.fromEntries(Object.entries(object).filter(([key]) => !keys.includes(key)))
}

// Ein Gutschein wird zu "Meiner Chronik": Code, Name fürs Zuhause, optional ein eigener Benutzer. Ein
// Partner-Zugang (api.checkVoucher meldet zweck 'partnerzugang', Phase P) richtet stattdessen ein
// Partner-Profil ein (PartnerSetupFields). onRedeemed bekommt die volle Server-Antwort (inkl.
// key/fromOthers) – die aufrufende Seite entscheidet, was damit passiert (erst den Schlüssel zeigen,
// siehe KeyReveal). autoFocus (Audit V7a): auf der Login-Seite holt der Fokus das Code-Feld ins Bild; im Portal steht
// das Formular ganz unten - dort ohne Fokus, sonst springt die Seite beim Laden ans Ende.
export default function RedeemForm({ initialCode = '', hint = null, onRedeemed, onPartnerModeChange, autoFocus = true }) {
  const t = useT()
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
  // Code, dessen Prüfung gerade läuft (null: keine) - "Prüfe …" und die Sperre gegen eine doppelte
  // Anfrage gelten nur für den aktuellen Code; ein geänderter Code darf sofort neu geprüft werden.
  const [checkingCode, setCheckingCode] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  // Der Code, für den eine Prüfung gilt: eine späte Antwort zu einem inzwischen geänderten Code wird verworfen.
  const latestCode = useRef(code)
  // Wie VoucherSessionCard (App.jsx, cancelled): nach dem Aushängen (z. B. Wechsel zu "Anmelden" oder
  // KeyReveal) setzt eine noch ausstehende Antwort keinen Zustand mehr.
  const isMounted = useRef(false)
  const { formRef, bannerRef, focusFirstError } = useFocusFirstError()

  const status = checkResult?.status || null
  const handover = checkResult?.handover || null
  // Phase V2: eine Besuchs-Einladung - mit der neuen Chronik ist man gleich mit diesem Zuhause verbunden.
  const visit = checkResult?.besuch || null
  const partnerAccess = partnerAccessFrom(checkResult)
  const isPartnerMode = Boolean(partnerAccess)
  const checking = checkingCode === code

  async function checkCode(value) {
    setCheckingCode(value)
    let result = null
    try {
      result = (await api.checkVoucher(value)) || null
    } catch {
      result = null
    }
    if (!isMounted.current) return
    setCheckingCode((current) => (current === value ? null : current))
    if (latestCode.current === value) setCheckResult(result)
  }

  useEffect(() => {
    isMounted.current = true
    return () => {
      isMounted.current = false
    }
  }, [])

  // Nur beim Öffnen (deshalb leere Abhängigkeiten): ein vorausgefüllter Code (/v#CODE) wird gleich
  // geprüft - sonst sähe ein Partner bis zum ersten Verlassen des Code-Felds das Kunden-Formular statt
  // "Partner-Profil einrichten". Jede spätere Prüfung stößt handleCodeBlur an; latestCode ist ein Ref,
  // checkCode liest nur Refs und Setter - ein erneutes Ausführen bei jeder Eingabe wäre falsch.
  useEffect(() => {
    if (isCompleteVoucherCode(latestCode.current)) checkCode(latestCode.current)
  }, [])

  // LoginPage passt die Kopfzeile an ("Partner-Profil einrichten" statt "Neue Chronik").
  useEffect(() => {
    onPartnerModeChange?.(isPartnerMode)
  }, [isPartnerMode, onPartnerModeChange])

  function handleCodeChange(value) {
    const formatted = formatVoucherCode(value)
    latestCode.current = formatted
    setCode(formatted)
    setCheckResult(null)
    setShelterMayRead(false)
    setPartnerErrors({})
  }

  function handleCodeBlur() {
    if (!isCompleteVoucherCode(code) || checkResult || checking) return
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
      if (!isMounted.current) return
      setError(err.message)
      setLoading(false)
      focusFirstError()
    }
  }

  const knownInvalid = Boolean(status) && status !== 'offen'
  const statusText = status ? t(STATUS_KEYS[status] || STATUS_KEYS.unbekannt) : null
  const submitLabel = partnerAccess ? t('login.redeemForm.createPartner') : t('login.redeemForm.createHome')

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
          {t('login.redeemForm.code')}
        </label>
        <input
          id="redeem-code"
          className="voucher-code-input"
          value={code}
          onChange={(e) => handleCodeChange(e.target.value)}
          onBlur={handleCodeBlur}
          placeholder="XXXX-XXXX-XXXX"
          autoComplete="off"
          autoFocus={autoFocus}
          required
        />
        {checking && <p className="field-hint">{t('login.redeemForm.checking')}</p>}
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
          {visit && (
            <p className="handover-notice" role="status">
              {t('login.redeemForm.visit', { name: visit.name })}
            </p>
          )}
          {handover && (
            <div className="handover-notice" role="status">
              <p>{t('login.redeemForm.handover', { animal: handover.animalName, shelter: handover.shelterName })}</p>
              <HandoverConsent shelterName={handover.shelterName} checked={shelterMayRead} onChange={setShelterMayRead} />
            </div>
          )}
          <div className="field">
            <label className="field-label" htmlFor="redeem-name">
              {t('login.redeemForm.homeName')}
            </label>
            <input
              id="redeem-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('login.redeemForm.homePlaceholder')}
              maxLength={NAME_MAX_LENGTH}
              required
            />
          </div>
        </>
      )}
      <RedeemAccountFields value={account} onChange={setAccount} />
      <Honeypot value={website} onChange={setWebsite} />
      <Button size="lg" block type="submit" disabled={loading || knownInvalid}>
        {loading ? t('login.redeemForm.creating') : submitLabel}
      </Button>
      {partnerAccess && (
        <p className="field-hint partner-setup-hint">{t('login.redeemForm.partnerHint')}</p>
      )}
    </form>
  )
}
