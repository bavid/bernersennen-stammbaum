import { Link } from 'react-router-dom'
import Icon from '../Icon.jsx'

// Einladungscodes der Karten (Feedback-Runde: für jede Rückseite mit Code - Einladungskarte und Kombi): jede Karte trägt
// einen eigenen offenen Code aus dem eigenen Kunden-Stapel. Erst "Drucken" holt sie (hooks/useVisitenkartenDruck.js,
// druck), in genau der Zahl der Karten, danach zählen sie als gedruckt. Ohne Code gibt es keine solche Karte: reichen die
// Codes nicht, druckt "Drucken" nur so viele Karten, wie Codes da sind (missingCodesText sagt das in einem Satz). Demo
// und Admin-Ansicht holen nie Codes - ihre Karten zeigen Muster-Codes ("DEMO-…"). Ohne offene Codes: Weg zum Admin.

export const EMPTY_STACK_HINT = 'Keine offenen Einladungscodes – beim Admin neue anfragen'
export const ALL_PRINTED_HINT = 'Alle offenen Einladungscodes stehen schon auf gedruckten Karten – beim Admin neue anfragen'
export const REQUEST_ROUTE = '/admin-schreiben'
export const DEMO_NOTE = 'Muster: In der Demo stehen auf den Karten Beispiel-Codes („DEMO-…“) – sie lassen sich nicht einlösen.'
export const ADMIN_VIEW_NOTE = 'In der Admin-Ansicht stehen auf den Karten Beispiel-Codes („DEMO-…“) – echte Codes holt nur der Partner selbst.'
const NO_CODE = 'ohne Code gibt es keine Karte mit dieser Rückseite.'

export function plural(count, singular, pluralForm) {
  return `${count} ${count === 1 ? singular : pluralForm}`
}

export function missingCodesText(missing, printable) {
  return `Für ${plural(missing, 'Karte', 'Karten')} fehlen Codes – gedruckt ${printable === 1 ? 'wird nur die eine' : `werden nur die ${printable}`} mit Code.`
}

function RequestNote({ title }) {
  return (
    <div className="vk-note" role="note">
      <p>
        <strong>{title}</strong> – {NO_CODE}
      </p>
      <Link to={REQUEST_ROUTE} className="btn btn-ghost">
        <Icon name="message" /> Beim Admin anfragen
      </Link>
    </div>
  )
}

// Zahlen des eigenen Stapels und "nur ungedruckte".
function StapelStand({ druck }) {
  const { gutscheine, nurUngedruckt, setNurUngedruckt } = druck
  return (
    <>
      <p className="vk-counts">
        {plural(gutscheine.offen, 'offener Einladungscode', 'offene Einladungscodes')}, davon {gutscheine.ungedruckt} noch nicht gedruckt.
      </p>
      <label className="check vk-toggle" htmlFor="vk-nur-ungedruckt">
        <input
          id="vk-nur-ungedruckt"
          type="checkbox"
          checked={nurUngedruckt}
          onChange={(event) => setNurUngedruckt(event.target.checked)}
          disabled={druck.busy}
        />
        <span>Nur noch nicht gedruckte verwenden</span>
      </label>
      {!nurUngedruckt && (
        <p className="field-hint vk-warn">
          Schon gedruckte Codes können auf verteilten Karten stehen – nur nehmen, wenn diese Karten nie ausgegeben wurden.
        </p>
      )}
    </>
  )
}

function LastPrint({ lastPrint }) {
  if (lastPrint.codes === 0) {
    return (
      <p className="vk-note" role="status">
        Zuletzt: Es war kein Code mehr frei – es wurde keine Karte gedruckt.
      </p>
    )
  }
  const fehlten = lastPrint.karten - lastPrint.codes
  return (
    <p className="vk-note is-ok" role="status">
      <Icon name="check" /> Zuletzt gedruckt: {plural(lastPrint.codes, 'Karte', 'Karten')} mit eigenem Code
      {fehlten > 0 ? ` – für ${plural(fehlten, 'Karte', 'Karten')} fehlte ein Code, sie kamen nicht aufs Papier` : ''}. Diese Codes zählen jetzt als
      gedruckt.
    </p>
  )
}

function RealCodes({ druck, count }) {
  const { gutscheine, available, lastPrint } = druck
  if (gutscheine.offen === 0 && !lastPrint) return <RequestNote title={EMPTY_STACK_HINT} />
  const missing = Math.max(0, count - available)
  return (
    <div className="vk-gutschein-body">
      <StapelStand druck={druck} />
      {available === 0 && <RequestNote title={gutscheine.offen === 0 ? EMPTY_STACK_HINT : ALL_PRINTED_HINT} />}
      {available > 0 && missing > 0 && (
        <p className="field-hint vk-warn" role="status">
          {missingCodesText(missing, available)}
        </p>
      )}
      {lastPrint && <LastPrint lastPrint={lastPrint} />}
    </div>
  )
}

// druck: Rückgabe von hooks/useVisitenkartenDruck.js; count: gewählte Zahl der Karten.
export default function KartenCodes({ readOnly, isAdminView, druck, count }) {
  return (
    <section className="vk-panel" aria-labelledby="vk-codes-title">
      <h2 id="vk-codes-title" className="vk-panel-title">
        Einladungscodes
      </h2>
      <p className="field-hint">
        Jede Karte bekommt beim Drucken einen eigenen Einladungscode – wer ihn einlöst, legt eine eigene Chronik an. Danach zählt er
        als gedruckt.
      </p>
      {readOnly ? (
        <p className="vk-note" role="note">
          {isAdminView ? ADMIN_VIEW_NOTE : DEMO_NOTE}
        </p>
      ) : (
        <RealCodes druck={druck} count={count} />
      )}
      {druck.error && (
        <p className="field-error" role="alert">
          {druck.error}
        </p>
      )}
    </section>
  )
}
