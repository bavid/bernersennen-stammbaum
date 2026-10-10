import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { api } from '../api'
import PublicHeader from '../components/PublicHeader.jsx'
import PublicFooter from '../components/PublicFooter.jsx'
import Icon from '../components/Icon.jsx'
import RequestPartnerForm from '../components/RequestPartnerForm.jsx'
import CommunityTicker from '../components/CommunityTicker.jsx'
import TabBar from '../components/TabBar.jsx'
import { useNoIndex } from '../hooks/useNoIndex.js'
import { usePartnerDemo } from '../hooks/usePartnerDemo.js'
import { DEMO_PARTNER_SLUGS } from '../lib/demoPartners.js'
import { PARTNER_REQUEST_ANCHOR } from '../lib/anfragen.js'
import { t } from '../lib/i18n/index.js'

// /partner-werden (Phase 5 Task 4): öffentliche Infoseite für Hundeschulen, Tierheime, Hundesalons und Betreuung.
// Audit (4,8 Bildschirme am Handy, das Formular vor der Erklärung): erst erklären (Reiter „Was ihr bekommt“ /
// „So funktioniert’s“), dann die Demo-Knöpfe (Demo-Partner-Bereiche, lib/demoPartners.js), dann "Partner-Zugang
// anfragen" (Phase N, #anfragen - das Formular zum Aufklappen) und zuletzt der Kontakt zum Betreiber (E-Mail aus
// /api/config, sonst das Impressum). Verlinkt von der Login-Seite ("Mehr
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
  { title: 'Partner-Zugang erhalten', text: 'Ihr bekommt vom Betreiber einen Partner-Zugang – eine Karte oder ein Code.' },
  { title: 'Profil einrichten', text: 'Löst den Zugang ein, wählt euren Namen, Logo und Farbe und schreibt ein paar Sätze über euch.' },
  { title: 'Veröffentlichen', text: 'Sobald die Pflichtangaben stehen, schaltet ihr euer Profil frei – und könnt es jederzeit pausieren.' }
]

const EXPLAIN_TABS = [
  { key: 'vorteile', label: 'Was ihr bekommt' },
  { key: 'schritte', label: 'So funktioniert’s' }
]
const explainPanelId = (key) => `partner-info-panel-${key}`

function BenefitList() {
  return (
    <ul className="partner-info-benefits">
      {BENEFITS.map((benefit) => (
        <li key={benefit.title} className="partner-info-benefit">
          <Icon name={benefit.icon} />
          <h3>{t(benefit.title)}</h3>
          <p>{t(benefit.text)}</p>
        </li>
      ))}
    </ul>
  )
}

function StepList() {
  return (
    <ol className="partner-info-steps">
      {STEPS.map((step, index) => (
        <li key={step.title}>
          <span className="partner-info-step-number" aria-hidden="true">
            {index + 1}
          </span>
          <div>
            <h3>{t(step.title)}</h3>
            <p>{t(step.text)}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}

// Was ein Partner-Profil bietet und wie es losgeht - zwei Reiter statt zweier langer Abschnitte.
function ExplainSection() {
  const [tab, setTab] = useState(EXPLAIN_TABS[0].key)
  return (
    <section className="partner-info-section partner-info-explain card" aria-label={t('Über das Partner-Profil')}>
      <TabBar
        tabs={EXPLAIN_TABS.map((item) => ({ ...item, label: t(item.label) }))}
        current={tab}
        label={t('Über das Partner-Profil')}
        idPrefix="partner-info-tab"
        panelId={explainPanelId}
        onSelect={setTab}
      />
      <div id={explainPanelId('vorteile')} role="tabpanel" aria-labelledby="partner-info-tab-vorteile" hidden={tab !== 'vorteile'}>
        <BenefitList />
      </div>
      <div id={explainPanelId('schritte')} role="tabpanel" aria-labelledby="partner-info-tab-schritte" hidden={tab !== 'schritte'}>
        <StepList />
      </div>
    </section>
  )
}

function DemoButtons({ onDemo }) {
  const { pending, error, startDemo } = usePartnerDemo(onDemo)

  return (
    <div className="partner-info-demo">
      {error && (
        <div className="error-banner" role="alert">
          {t(error)}
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
          {pending === option.key ? t('Lädt …') : t(option.label)}
        </button>
      ))}
      <p className="field-hint">{t('Ohne Anmeldung, schreibgeschützt – so sieht der Partner-Bereich von innen aus.')}</p>
    </div>
  )
}

// Kontakt: die E-Mail aus dem Impressum (server/config.js readLegal); ohne sie der Weg zum Impressum. Bewusst ein
// zweitrangiger Knopf - die Hauptwege der Seite sind die Demo und die Anfrage darüber.
function ContactAction({ legal }) {
  if (legal?.email) {
    return (
      <a href={`mailto:${legal.email}`} className="btn btn-ghost btn-lg">
        <Icon name="mail" /> {t('Kontakt aufnehmen')}
      </a>
    )
  }
  return (
    <Link to="/impressum" className="btn btn-ghost btn-lg">
      {t('Kontakt über das Impressum')}
    </Link>
  )
}

// "Partner-Zugang anfragen" (Phase N) nach Erklärung und Demo; das Formular klappt erst auf Wunsch auf (Audit: die Seite
// war am Handy 4,8 Bildschirme lang). /partner-werden#anfragen (LoginPartnerEntry) öffnet es gleich - ein Router-Link
// scrollt nicht selbst: der Abschnitt rückt nach oben, der Fokus auf seine Überschrift (für Tastatur und Screenreader).
// Das Formular bleibt im Dokument (nur verborgen).
function RequestSection() {
  const { hash } = useLocation()
  const jumped = hash === `#${PARTNER_REQUEST_ANCHOR}`
  const [open, setOpen] = useState(jumped)
  const sectionRef = useRef(null)
  const headingRef = useRef(null)

  useEffect(() => {
    if (!jumped) return
    setOpen(true)
    sectionRef.current?.scrollIntoView?.({ block: 'start' })
    headingRef.current?.focus({ preventScroll: true })
  }, [jumped])

  return (
    <section
      ref={sectionRef}
      id={PARTNER_REQUEST_ANCHOR}
      className="partner-info-section partner-info-request card"
      aria-labelledby="partner-info-request-title"
    >
      <div className="partner-info-request-head">
        <div>
          <h2 id="partner-info-request-title" ref={headingRef} tabIndex={-1}>
            {t('Partner-Zugang anfragen')}
          </h2>
          <p className="muted">{t('Kostenlos für Hundeschulen, Tierheime, Hundesalons und Betreuung.')}</p>
        </div>
        {!open && (
          <button type="button" className="btn btn-primary" aria-expanded="false" aria-controls="partner-info-request-form" onClick={() => setOpen(true)}>
            {t('Anfrage ausfüllen')}
          </button>
        )}
      </div>
      <div id="partner-info-request-form" hidden={!open}>
        <RequestPartnerForm />
      </div>
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
        <span className="eyebrow">{t('Partner werden')}</span>
        <h1>{t('Euer Auftritt bei Familie auf Pfoten')}</h1>
        <p className="page-lede">
          {t(
            'Für Hundeschulen, Tierheime, Hundesalons und Betreuung: ein Profil, das eure Kundschaft direkt in ihre eigene Chronik holt – und euch als Herkunft zeigt.'
          )}
        </p>
      </div>
      {/* Laufband „Zahlen aus der Gemeinschaft“ - nur für Besucher, nicht in der angemeldeten App. */}
      {!family && <CommunityTicker />}

      <ExplainSection />

      <section className="partner-info-section partner-info-showcase card" aria-labelledby="partner-info-demo-title">
        <div>
          <h2 id="partner-info-demo-title">{t('So sieht euer Partner-Bereich aus')}</h2>
          <p className="muted">{t('Drei Demo-Partner zeigen Profil, Kundensicht, Beiträge, Postfach und Einladungscodes – einfach reinklicken.')}</p>
        </div>
        <DemoButtons onDemo={onDemo} />
      </section>

      <RequestSection />

      <section className="partner-info-section partner-info-contact card" aria-labelledby="partner-info-contact-title">
        <div>
          <h2 id="partner-info-contact-title">{t('Lust, dabei zu sein?')}</h2>
          <p>{t('Noch Fragen, bevor ihr anfragt? Schreibt uns einfach direkt.')}</p>
          {/* Phase F: ein Satz zur Finanzierung - Partner-Portale sind heute kostenlos. */}
          <p className="muted partner-info-finanzierung">
            {t('Euer Portal ist heute kostenlos – wie wir uns finanzieren, steht auf')} <Link to="/finanzierung">{t('„So finanzieren wir uns“')}</Link>.
          </p>
          <p className="muted partner-info-netzwerk">
            <Link to="/netzwerk">{t('Ausblick: So könnten Partner sich künftig vernetzen')}</Link>
          </p>
        </div>
        <ContactAction legal={legal} />
      </section>

      <PublicFooter />
    </div>
  )
}
