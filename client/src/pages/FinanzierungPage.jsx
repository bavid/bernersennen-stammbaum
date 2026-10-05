import { useEffect, useState } from 'react'
import { api } from '../api'
import PublicHeader from '../components/PublicHeader.jsx'
import PublicFooter from '../components/PublicFooter.jsx'
import Icon from '../components/Icon.jsx'
import FinanzierungQuartale from '../components/finanzierung/FinanzierungQuartale.jsx'
import FinanzierungMithelfen from '../components/finanzierung/FinanzierungMithelfen.jsx'
import { zielText } from '../lib/finanzierung.js'

// Phase F: /finanzierung - „So finanzieren wir uns“ (docs/superpowers/specs/2026-09-27-marketing-gutscheine-partner-design.md,
// Phase F). Öffentlich wie Impressum und Datenschutz (App.jsx), derselbe schlanke Rahmen (PublicHeader, PublicFooter). In
// einfachen Worten: der Grundsatz, wer was zahlt, wohin das Geld geht, die Zahlen je Quartal und - wenn der Admin etwas
// eingetragen hat - der Weg zum Mithelfen. Zahlen, Ziel und Spenden-Hinweis kommen aus GET /api/finanzierung
// (server/lib/finanzierung.js); ohne Einträge zeigt die Seite den Grundsatz ohne Zahlen. Keine Rechtsform als Tatsache,
// nie „ohne Werbung“ (Partner-Angebote gibt es - gekennzeichnet).

export const GRUNDSATZ = 'Keine fremde Werbung, kein Tracking, kein Datenhandel – getragen von Spenden und lokalen Partnern.'

const WER_ZAHLT = [
  { wer: 'Nutzerinnen und Nutzer', was: 'kostenlos', text: 'Zuhause, Familien und Chronik – immer frei.' },
  { wer: 'Partner-Portale', was: 'kostenlos', text: 'Hundeschulen, Tierheime, Salons und Betreuung zeigen sich mit eigenem Portal.' },
  { wer: 'Hervorhebung „überall sichtbar“', was: 'vorerst kostenlos', text: 'Ein Partner erscheint in „Entdecken“ nicht nur in der Nähe – klar als Partner gekennzeichnet.' }
]

const WOHIN = [
  { icon: 'wrench', title: 'Zuerst der Betrieb', text: 'Server, Domain und Sicherungen – damit eure Erinnerungen sicher bleiben.' },
  { icon: 'heart', title: 'Dann Tiere und Tierschutz', text: 'Spenden an Tierheime und Tierschutz – offen genannt, sobald es so weit ist.' },
  { icon: 'mapPin', title: 'Und lokale Projekte', text: 'Hundewiese, Kotbeutel-Spender, Trinkstellen – kleine Dinge vor Ort.' }
]

function Section({ id, title, children, className = '' }) {
  return (
    <section className={`finanz-section ${className}`.trim()} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>{title}</h2>
      {children}
    </section>
  )
}

function Grundsatz() {
  return (
    <Section id="finanz-grundsatz" title="Unser Grundsatz">
      <p>
        Familie auf Pfoten ist für alle Tierhalterinnen und Tierhalter kostenlos – und bleibt es. Wir zeigen keine fremde
        Werbung, verfolgen niemanden und handeln nicht mit Daten. Getragen wird die Plattform von Spenden und von lokalen
        Partnern, die sich mit ihrem Portal zeigen. Was nach dem Betrieb übrig bleibt, geht an Tiere und an Projekte vor Ort.
      </p>
    </Section>
  )
}

function WerZahltWas() {
  return (
    <Section id="finanz-wer" title="Wer zahlt was">
      <dl className="finanz-wer">
        {WER_ZAHLT.map((row) => (
          <div key={row.wer} className="finanz-wer-row">
            <dt>{row.wer}</dt>
            <dd>
              <span className="pill finanz-pill">{row.was}</span>
              <span className="finanz-wer-text">{row.text}</span>
            </dd>
          </div>
        ))}
      </dl>
    </Section>
  )
}

function Ziel({ ziel }) {
  if (!ziel?.titel) return null
  return (
    <p className="finanz-ziel" role="note">
      <Icon name="star" />
      <span>
        <strong>{zielText(ziel)}</strong>
        {ziel.empfaenger && <> – Empfänger: {ziel.empfaenger}</>}
      </span>
    </p>
  )
}

function WohinDasGeld({ ziel }) {
  return (
    <Section id="finanz-wohin" title="Wohin das Geld geht">
      <ol className="finanz-wohin">
        {WOHIN.map((step, index) => (
          <li key={step.title}>
            <span className="finanz-wohin-number" aria-hidden="true">
              {index + 1}
            </span>
            <div>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </div>
          </li>
        ))}
      </ol>
      <Ziel ziel={ziel} />
    </Section>
  )
}

function useFinanzierung() {
  const [state, setState] = useState({ data: undefined, error: null })
  useEffect(() => {
    let cancelled = false
    api
      .finanzierung()
      .then((data) => {
        if (!cancelled) setState({ data, error: null })
      })
      .catch(() => {
        if (!cancelled) setState({ data: null, error: 'Die Zahlen lassen sich gerade nicht laden.' })
      })
    return () => {
      cancelled = true
    }
  }, [])
  return state
}

// family: die laufende Sitzung oder null - „Zurück“ (PublicHeader) führt ohne Verlauf zur Startseite des Bereichs.
export default function FinanzierungPage({ family = null }) {
  const { data, error } = useFinanzierung()

  return (
    <div className="public-page finanz-page">
      <PublicHeader family={family} />
      <div className="legal-hero finanz-hero">
        <span className="eyebrow">Transparenz</span>
        <h1>So finanzieren wir uns</h1>
        <p className="hand finanz-hero-hand">{GRUNDSATZ}</p>
      </div>

      <Grundsatz />
      <WerZahltWas />
      <WohinDasGeld ziel={data?.ziel} />

      <Section id="finanz-zahlen" title="Zahlen je Quartal">
        <p className="muted finanz-zahlen-lede">Einnahmen, Kosten und weitergegebene Spenden – je Quartal, in einfachen Worten.</p>
        {data === undefined && !error && (
          <p className="muted" aria-busy="true">
            Lädt …
          </p>
        )}
        {error && (
          <p className="muted" role="status">
            {error}
          </p>
        )}
        {data && <FinanzierungQuartale quartale={data.quartale} />}
      </Section>

      {data && <FinanzierungMithelfen hinweis={data.spendenHinweis} />}

      <PublicFooter />
    </div>
  )
}
