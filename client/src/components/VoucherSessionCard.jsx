import { useEffect, useState } from 'react'
import { api } from '../api'
import { isReadOnly } from '../lib/demo.js'
import { formatVoucherCode } from '../lib/voucherCode.js'
import { t } from '../lib/i18n/index.js'
import HandoverConsent from './HandoverConsent.jsx'
import VisitClaimCard from './visits/VisitClaimCard.jsx'
import { Button } from './ui/index.js'

// Karte auf /v#CODE mit laufender Sitzung (Phase T Task 5): normalerweise nur "Abmelden und Gutschein
// einlösen" - trägt der Code aber einen offenen Übergabe-Gutschein UND die Sitzung ist das eigene
// Zuhause selbst (nicht ein beigetretenes Rudel, nicht ein klassischer Rudel-Login), bietet sie
// stattdessen "In „Mein Zuhause“ übernehmen" (api.claimVoucher, ohne Ab-/Anmelden). code kommt aus dem
// #Hash der Adresse (App.jsx voucherCode) - ohne Code (z. B. direkter Aufruf von /v) bleibt es bei der
// einfachen Karte, ganz ohne Prüf-Anfrage.
// Phase V2: trägt der Code eine offene Besuchs-Einladung (checkVoucher meldet besuch), bietet die Karte im eigenen
// Zuhause stattdessen das Verbinden an (VisitClaimCard, onVisitConnected bekommt das neue "me").
export default function VoucherSessionCard({ family, code, onLogout, onClaimed, onVisitConnected }) {
  const [handover, setHandover] = useState(null)
  const [visit, setVisit] = useState(null)
  const [shelterMayRead, setShelterMayRead] = useState(false)
  const [claiming, setClaiming] = useState(false)
  const [error, setError] = useState(null)

  // voucherCode (App.jsx) kommt roh aus dem #Hash - wie RedeemForm/LoginForm geht auch hier nur der
  // formatierte Code (XXXX-XXXX-XXXX) an die API, nie der rohe Hash-Text.
  const formattedCode = formatVoucherCode(code)
  // final-review Phase T Finding 10: eine Demo-Sitzung darf nichts übernehmen (schreibgeschützt wie
  // jede andere Demo-Aktion, api.claimVoucher würde ohnehin mit 403 ablehnen) - canClaim schließt sie
  // deshalb schon hier aus, statt erst den Fehler vom Server abzuwarten.
  const hasHouseholdHome = family.home?.art === 'zuhause'
  const canClaim = !isReadOnly(family) && family.art === 'zuhause' && Boolean(family.home) && family.id === family.home.id
  // Ein Haushalt, der gerade ein Rudel ansieht (Gruppenseite), kann von hier aus nicht übernehmen -
  // canClaim ist dann false, ohne dass wir wüssten, ob der Code überhaupt einen offenen Übergabe-
  // Gutschein trägt. "Abmelden und neu einlösen" wäre hier die falsche Empfehlung (verschenkt die
  // Übernahme in die bestehende Chronik) - stattdessen der Hinweis, zuerst zurückzuwechseln.
  const viewingGroupAsHousehold = hasHouseholdHome && family.id !== family.home.id

  useEffect(() => {
    let cancelled = false
    if (!formattedCode || !canClaim) {
      setHandover(null)
      setVisit(null)
      return undefined
    }
    api
      .checkVoucher(formattedCode)
      .then((result) => {
        if (cancelled) return
        setHandover(result.handover || null)
        setVisit(result.besuch || null)
      })
      .catch(() => {
        if (!cancelled) setHandover(null)
      })
    return () => {
      cancelled = true
    }
  }, [formattedCode, canClaim])

  async function handleClaim() {
    setError(null)
    setClaiming(true)
    try {
      const { dogId } = await api.claimVoucher({ code: formattedCode, shelterMayRead })
      onClaimed(dogId)
    } catch (err) {
      setError(err.message)
      setClaiming(false)
    }
  }

  if (visit) return <VisitClaimCard code={formattedCode} visit={visit} onConnected={onVisitConnected} />

  if (handover) {
    return (
      <div className="card voucher-session-card">
        {error && (
          <div className="error-banner" role="alert">
            {error}
          </div>
        )}
        <p>
          {t('Mit diesem Übergabe-Code zieht {animal} aus {shelter} zu euch – mit der ganzen Chronik.', {
            animal: handover.animalName,
            shelter: handover.shelterName
          })}
        </p>
        <HandoverConsent shelterName={handover.shelterName} checked={shelterMayRead} onChange={setShelterMayRead} />
        <Button type="button" block disabled={claiming} onClick={handleClaim}>
          {claiming ? t('Übernehme …') : t('In „Mein Zuhause“ übernehmen')}
        </Button>
      </div>
    )
  }

  return (
    <div className="card voucher-session-card">
      <p>
        {t('Du bist angemeldet als')} <strong>{family.name}</strong>.
      </p>
      {viewingGroupAsHousehold && (
        <p className="field-hint">{t('Wechselt zuerst zu „Mein Zuhause“ (über „Start“), um das Tier zu übernehmen.')}</p>
      )}
      <Button type="button" block onClick={onLogout}>
        {t('Abmelden und Einladungscode einlösen')}
      </Button>
    </div>
  )
}
