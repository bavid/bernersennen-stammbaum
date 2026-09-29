import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import ThemeMark from '../components/ThemeMark.jsx'
import PublicFooter from '../components/PublicFooter.jsx'
import Icon from '../components/Icon.jsx'
import { useNoIndex } from '../hooks/useNoIndex.js'
import { DEMO_PARTNER_SLUGS } from '../lib/demoPartners.js'

// /partner-werden (Phase 5 Task 4): öffentliche Infoseite für Hundeschulen, Tierheime, Hundesalons und Betreuung -
// was ein Partner-Profil bietet, wie es losgeht, zwei Demo-Knöpfe (Demo-Partner-Bereiche, lib/demoPartners.js,
// wie "Demo als Partner ansehen" auf dem Portal) und der Kontakt zum Betreiber (E-Mail aus /api/config, sonst
// das Impressum). Verlinkt vom Fuß der Login-Seite ("Für Partner") und aus der Partnerliste. noindex, bis die
// Domain steht (Phase G) - dann den Hook hier entfernen.

export const DEMO_PARTNERS = [
  { key: 'hundeschule', label: 'Demo als Hundeschule ansehen', slug: DEMO_PARTNER_SLUGS.hundeschule },
  { key: 'hundesalon', label: 'Demo als Hundesalon ansehen', slug: DEMO_PARTNER_SLUGS.hundesalon }
]

const BENEFITS = [
  { icon: 'globe', title: 'Profil & Einblicke', text: 'Euer eigenes Portal mit Logo, Farbe, Text und Fotos aus eurer Arbeit – ihr pflegt es selbst.' },
  { icon: 'eye', title: 'Kundensicht', text: 'Seht jederzeit, wie eure Kundschaft euch findet – in „Entdecken“ und auf eurem Portal, auch vor der Veröffentlichung.' },
  { icon: 'inbox', title: 'Schreib uns mit Postfach', text: 'Anfragen über euer Portal landen in eurem Postfach – ohne Weiterleitung, ohne fremde Dienste.' },
  { icon: 'megaphone', title: 'Beiträge als Anzeige', text: 'Kurse, Aktionen und Termine erscheinen gekennzeichnet in „Entdecken“, nach kurzer Freigabe.' },
  { icon: 'printer', title: 'Kunden-Gutscheine', text: 'Karten mit eurem Auftritt: Jede legt für eure Kundschaft eine eigene Chronik an – und zeigt, dass sie von euch kommt.' }
]

const STEPS = [
  { title: 'Partner-Zugang erhalten', text: 'Ihr bekommt vom Betreiber einen Partner-Zugang – eine Karte oder ein Code, kostenlos.' },
  { title: 'Profil einrichten', text: 'Löst den Zugang ein, wählt euren Namen, Logo und Farbe und schreibt ein paar Sätze über euch.' },
  { title: 'Veröffentlichen', text: 'Sobald die Pflichtangaben stehen, schaltet ihr euer Profil frei – und könnt es jederzeit pausieren.' }
]

function DemoButtons({ onDemo }) {
  const [pending, setPending] = useState(null)
  const [error, setError] = useState(null)

  async function startDemo(option) {
    setError(null)
    setPending(option.key)
    try {
      onDemo(await api.demo({ as: 'partner', slug: option.slug }))
    } catch (err) {
      setError(err.message)
      setPending(null)
    }
  }

  return (
    <div className="partner-info-demo">
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {DEMO_PARTNERS.map((option) => (
        <button key={option.key} type="button" className="btn btn-ghost" onClick={() => startDemo(option)} disabled={pending !== null}>
          {pending === option.key ? 'Lädt …' : option.label}
        </button>
      ))}
      <p className="field-hint">Ohne Anmeldung, schreibgeschützt – so sieht der Partner-Bereich von innen aus.</p>
    </div>
  )
}

// Kontakt: die E-Mail aus dem Impressum (server/config.js readLegal); ohne sie der Weg zum Impressum.
function ContactAction({ legal }) {
  if (legal?.email) {
    return (
      <a href={`mailto:${legal.email}`} className="btn btn-primary btn-lg">
        <Icon name="mail" /> Kontakt aufnehmen
      </a>
    )
  }
  return (
    <Link to="/impressum" className="btn btn-primary btn-lg">
      Kontakt über das Impressum
    </Link>
  )
}

export default function PartnerInfoPage({ onDemo }) {
  const [legal, setLegal] = useState(null)
  useNoIndex()

  useEffect(() => {
    let cancelled = false
    api
      .config()
      .then((data) => {
        if (!cancelled) setLegal(data.legal || null)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="public-page partner-info-page">
      <header className="partners-hero">
        <ThemeMark size={56} />
        <span className="eyebrow">Partner werden</span>
        <h1>Euer Auftritt bei Familie auf Pfoten</h1>
        <p className="page-lede">
          Für Hundeschulen, Tierheime, Hundesalons und Betreuung: ein kostenloses Profil, das eure Kundschaft direkt in ihre eigene
          Chronik holt – und euch als Herkunft zeigt.
        </p>
      </header>

      <section className="partner-info-section" aria-labelledby="partner-info-benefits-title">
        <h2 id="partner-info-benefits-title">Was ihr bekommt</h2>
        <ul className="partner-info-benefits">
          {BENEFITS.map((benefit) => (
            <li key={benefit.title} className="card partner-info-benefit">
              <Icon name={benefit.icon} />
              <h3>{benefit.title}</h3>
              <p>{benefit.text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="partner-info-section" aria-labelledby="partner-info-steps-title">
        <h2 id="partner-info-steps-title">So funktioniert’s</h2>
        <ol className="partner-info-steps">
          {STEPS.map((step, index) => (
            <li key={step.title}>
              <span className="partner-info-step-number" aria-hidden="true">
                {index + 1}
              </span>
              <div>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="partner-info-section partner-info-actions card" aria-labelledby="partner-info-actions-title">
        <div>
          <h2 id="partner-info-actions-title">Erst mal reinschauen?</h2>
          <p className="muted">Zwei Demo-Partner zeigen, wie Profil, Kundensicht, Postfach und Kunden-Gutscheine aussehen.</p>
        </div>
        <DemoButtons onDemo={onDemo} />
        <div className="partner-info-contact">
          <p>
            <strong>Lust, dabei zu sein?</strong> Schreibt uns kurz, wer ihr seid – wir melden uns mit eurem Partner-Zugang.
          </p>
          <ContactAction legal={legal} />
        </div>
      </section>

      <PublicFooter />
    </div>
  )
}
