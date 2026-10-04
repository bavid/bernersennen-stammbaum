import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { api } from '../api'
import PublicHeader from '../components/PublicHeader.jsx'
import PublicFooter from '../components/PublicFooter.jsx'
import Icon from '../components/Icon.jsx'
import RequestPartnerForm from '../components/RequestPartnerForm.jsx'
import { useNoIndex } from '../hooks/useNoIndex.js'
import { usePartnerDemo } from '../hooks/usePartnerDemo.js'
import { DEMO_PARTNER_SLUGS } from '../lib/demoPartners.js'
import { PARTNER_REQUEST_ANCHOR } from '../lib/anfragen.js'

// /partner-werden (Phase 5 Task 4): öffentliche Infoseite für Hundeschulen, Tierheime, Hundesalons und Betreuung -
// ganz oben zwei große Demo-Knöpfe (Demo-Partner-Bereiche, lib/demoPartners.js - Phase U: erst ansehen, dann
// lesen), darunter "Partner-Zugang anfragen" (Phase N, #anfragen), was ein Partner-Profil bietet, wie es losgeht,
// und der Kontakt zum Betreiber (E-Mail aus /api/config, sonst das Impressum). Verlinkt von der Login-Seite ("Mehr
// erfahren", "Partner-Zugang anfragen", "Für Partner") und aus der Partnerliste. noindex, bis die Domain steht
// (Phase G) - dann den Hook hier entfernen.

export const DEMO_PARTNERS = [
  { key: 'hundeschule', label: 'Demo als Hundeschule ansehen', target: { as: 'partner', slug: DEMO_PARTNER_SLUGS.hundeschule } },
  { key: 'tierheim', label: 'Demo als Tierheim ansehen', target: { as: 'tierheim' } },
  { key: 'hundesalon', label: 'Demo als Hundesalon ansehen', target: { as: 'partner', slug: DEMO_PARTNER_SLUGS.hundesalon } }
]

const BENEFITS = [
  { icon: 'globe', title: 'Profil & Einblicke', text: 'Euer eigenes Portal mit Logo, Farbe, Text und Fotos aus eurer Arbeit – ihr pflegt es selbst.' },
  { icon: 'eye', title: 'Kundensicht', text: 'Seht jederzeit, wie eure Kundschaft euch findet – in „Entdecken“ und auf eurem Portal, auch vor der Veröffentlichung.' },
  { icon: 'inbox', title: 'Schreib uns mit Postfach', text: 'Anfragen über euer Portal landen in eurem Postfach – ohne Weiterleitung, ohne fremde Dienste.' },
  { icon: 'megaphone', title: 'Beiträge als Anzeige', text: 'Kurse, Aktionen und Termine erscheinen gekennzeichnet in „Entdecken“, nach kurzer Freigabe.' },
  // Phase V4a: der Kalender der Partner.
  { icon: 'calendar', title: 'Kalender', text: 'Kurse und offene Stunden – einmalig oder als Serie – stehen sofort auf eurem Portal und als nächster Termin in „Entdecken“.' },
  // Audit V7a: die Visitenkarten (Phase V5) gehören dazu - vorher stand nur "Kunden-Gutscheine" da.
  {
    icon: 'printer',
    title: 'Visitenkarten & Einladungscodes',
    text: 'Visitenkarten mit QR-Code zu eurem Portal zum Selberdrucken – auf Wunsch mit Einladungscode, mit dem eure Kundschaft eine eigene Chronik anlegt.'
  }
]

const STEPS = [
  { title: 'Partner-Zugang erhalten', text: 'Ihr bekommt vom Betreiber einen Partner-Zugang – eine Karte oder ein Code, kostenlos.' },
  { title: 'Profil einrichten', text: 'Löst den Zugang ein, wählt euren Namen, Logo und Farbe und schreibt ein paar Sätze über euch.' },
  { title: 'Veröffentlichen', text: 'Sobald die Pflichtangaben stehen, schaltet ihr euer Profil frei – und könnt es jederzeit pausieren.' }
]

function DemoButtons({ onDemo }) {
  const { pending, error, startDemo } = usePartnerDemo(onDemo)

  return (
    <div className="partner-info-demo">
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {DEMO_PARTNERS.map((option, index) => (
        <button
          key={option.key}
          type="button"
          className={`btn btn-lg ${index === 0 ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => startDemo(option.key, option.target)}
          disabled={pending !== null}
        >
          {pending === option.key ? 'Lädt …' : option.label}
        </button>
      ))}
      <p className="field-hint">Ohne Anmeldung, schreibgeschützt – so sieht der Partner-Bereich von innen aus.</p>
    </div>
  )
}

// Kontakt: die E-Mail aus dem Impressum (server/config.js readLegal); ohne sie der Weg zum Impressum. Bewusst ein
// zweitrangiger Knopf - die Hauptwege der Seite sind die Demo und die Anfrage darüber.
function ContactAction({ legal }) {
  if (legal?.email) {
    return (
      <a href={`mailto:${legal.email}`} className="btn btn-ghost btn-lg">
        <Icon name="mail" /> Kontakt aufnehmen
      </a>
    )
  }
  return (
    <Link to="/impressum" className="btn btn-ghost btn-lg">
      Kontakt über das Impressum
    </Link>
  )
}

// "Partner-Zugang anfragen" (Phase N) direkt unter den Demo-Knöpfen. /partner-werden#anfragen (LoginPartnerEntry)
// springt hierher - ein Router-Link scrollt nicht selbst: der Abschnitt rückt nach oben, der Fokus auf seine
// Überschrift (für Tastatur und Screenreader).
function RequestSection() {
  const { hash } = useLocation()
  const sectionRef = useRef(null)
  const headingRef = useRef(null)

  useEffect(() => {
    if (hash !== `#${PARTNER_REQUEST_ANCHOR}`) return
    sectionRef.current?.scrollIntoView?.({ block: 'start' })
    headingRef.current?.focus({ preventScroll: true })
  }, [hash])

  return (
    <section
      ref={sectionRef}
      id={PARTNER_REQUEST_ANCHOR}
      className="partner-info-section partner-info-request card"
      aria-labelledby="partner-info-request-title"
    >
      <div>
        <h2 id="partner-info-request-title" ref={headingRef} tabIndex={-1}>
          Partner-Zugang anfragen
        </h2>
        <p className="muted">Kostenlos für Hundeschulen, Tierheime, Hundesalons und Betreuung.</p>
      </div>
      <RequestPartnerForm />
    </section>
  )
}

// family: die laufende Sitzung (App.jsx) oder null - nur für das Ziel von "Zurück" (PublicHeader).
export default function PartnerInfoPage({ onDemo, family = null }) {
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
      <PublicHeader family={family} />

      <div className="partners-hero">
        <span className="eyebrow">Partner werden</span>
        <h1>Euer Auftritt bei Familie auf Pfoten</h1>
      </div>

      <section className="partner-info-section partner-info-showcase card" aria-labelledby="partner-info-demo-title">
        <div>
          <h2 id="partner-info-demo-title">So sieht euer Partner-Bereich aus</h2>
          <p className="muted">Drei Demo-Partner zeigen Profil, Kundensicht, Beiträge, Postfach und Einladungscodes – einfach reinklicken.</p>
        </div>
        <DemoButtons onDemo={onDemo} />
      </section>

      <RequestSection />

      <section className="partner-info-section" aria-labelledby="partner-info-benefits-title">
        <h2 id="partner-info-benefits-title">Was ihr bekommt</h2>
        <p className="page-lede">
          Für Hundeschulen, Tierheime, Hundesalons und Betreuung: ein kostenloses Profil, das eure Kundschaft direkt in ihre eigene
          Chronik holt – und euch als Herkunft zeigt.
        </p>
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

      <section className="partner-info-section partner-info-contact card" aria-labelledby="partner-info-contact-title">
        <div>
          <h2 id="partner-info-contact-title">Lust, dabei zu sein?</h2>
          <p>Noch Fragen, bevor ihr anfragt? Schreibt uns einfach direkt.</p>
        </div>
        <ContactAction legal={legal} />
      </section>

      <PublicFooter />
    </div>
  )
}
