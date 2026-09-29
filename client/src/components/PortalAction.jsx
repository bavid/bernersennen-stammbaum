import { Fragment, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import RedeemForm from './RedeemForm.jsx'
import KeyReveal from './KeyReveal.jsx'
import Icon from './Icon.jsx'
import { startRoute } from '../lib/areas.js'

// Demo-Knöpfe des Portals: "Demo ansehen" (Zuhause) immer, "Demo als Tierheim ansehen" (Phase T Task 6)
// nur mit partner.shelterDemo, "Demo als Partner ansehen" (Phase P1) nur mit partner.partnerDemo - beide
// meldet der Server nur, wenn der jeweilige Demo-Bereich tatsächlich existiert (sonst liefe der Knopf ins
// Leere). Der Partner-Demo gibt der Server über den slug den passenden Demo-Partner-Bereich.
function demoOptions(partner) {
  return [
    { key: 'zuhause', label: 'Demo ansehen', args: undefined },
    partner.shelterDemo && { key: 'tierheim', label: 'Demo als Tierheim ansehen', args: { as: 'tierheim' } },
    partner.partnerDemo && { key: 'partner', label: 'Demo als Partner ansehen', args: { as: 'partner', slug: partner.slug } }
  ].filter(Boolean)
}

// Wie der Demo-Knopf der Login-Seite (LoginPage.jsx handleDemo): api.demo() -> onRedeemed (=
// handleVoucherLogin in App.jsx: setFamily + navigate(startRoute(me)), für die Partner-Demo also /profil) -
// keine eigene Navigation hier. Ein Fehler erscheint direkt über dem Knopf, der ihn ausgelöst hat.
function DemoButtons({ partner, onRedeemed }) {
  const [pending, setPending] = useState(null)
  const [failure, setFailure] = useState(null)

  async function startDemo(option) {
    setFailure(null)
    setPending(option.key)
    try {
      onRedeemed(await (option.args ? api.demo(option.args) : api.demo()))
    } catch (err) {
      setFailure({ key: option.key, message: err.message })
      setPending(null)
    }
  }

  return demoOptions(partner).map((option) => (
    <Fragment key={option.key}>
      {failure?.key === option.key && (
        <div className="error-banner" role="alert">
          {failure.message}
        </div>
      )}
      <button type="button" className="btn btn-ghost btn-block" onClick={() => startDemo(option)} disabled={pending !== null}>
        {pending === option.key ? 'Lädt …' : option.label}
      </button>
    </Fragment>
  ))
}

// Aktion des Portals: "Gutschein einlösen" (wie /v, aber der Partner steckt bereits im Code) samt Demo-
// Knöpfen. Angemeldete sehen stattdessen den Weg zurück bzw. zum Abmelden. In der Kundensicht (preview)
// nur ein Hinweis - dort lässt sich weder einlösen noch eine Demo starten.
export default function PortalAction({ partner, family, preview, onRedeemed, onLogout }) {
  const navigate = useNavigate()
  const [redeemResult, setRedeemResult] = useState(null)

  function handleRedeemed(response) {
    const { key, fromOthers, ...me } = response
    setRedeemResult({ key, me })
  }

  if (preview) {
    return (
      <section className="card partner-portal-action preview-placeholder">
        <Icon name="lock" />
        <p>Hier lösen eure Kundinnen und Kunden ihren Gutschein ein – in der Vorschau ausgeblendet.</p>
      </section>
    )
  }

  return (
    <section className="card partner-portal-action">
      {family ? (
        <>
          <p>
            Ihr seid angemeldet als <strong>{family.name}</strong>.
          </p>
          <button type="button" className="btn btn-primary btn-block" onClick={() => navigate(startRoute(family))}>
            Zurück zu eurer Chronik
          </button>
          <p className="field-hint">Um einen Gutschein einzulösen, meldet euch zuerst ab.</p>
          <button type="button" className="btn btn-ghost btn-block" onClick={onLogout}>
            Abmelden und Gutschein einlösen
          </button>
        </>
      ) : redeemResult ? (
        <KeyReveal value={redeemResult.key} onContinue={() => onRedeemed(redeemResult.me)} />
      ) : (
        <>
          <RedeemForm onRedeemed={handleRedeemed} />
          <div className="login-demo">
            <span className="login-demo-divider">oder</span>
            <DemoButtons partner={partner} onRedeemed={onRedeemed} />
          </div>
        </>
      )}
    </section>
  )
}
