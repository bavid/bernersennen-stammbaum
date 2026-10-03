import { Link } from 'react-router-dom'
import Icon from '../Icon.jsx'

// "Mit Kunden-Gutschein" (Phase V5): jede gedruckte Karte bekommt auf der Rückseite einen eigenen offenen Code aus dem
// eigenen Kunden-Stapel. Die Codes holt erst "Drucken" (hooks/useVisitenkartenDruck.js) - in genau der Zahl der Karten,
// der Server vermerkt sie dabei als gedruckt. Hier: Schalter, Zahlen, "nur ungedruckte", was der nächste Druck bekommt
// und was der letzte bekam. Demo und Admin-Ansicht holen nie Codes: ihre Karten zeigen Muster-Codes ("DEMO-…"). Ohne
// verfügbare Gutscheine: Hinweis mit Weg zum Admin.

export const EMPTY_STACK_HINT = 'Keine offenen Gutscheine – beim Admin neue anfragen'
export const ALL_PRINTED_HINT = 'Alle offenen Gutscheine stehen schon auf gedruckten Karten – beim Admin neue anfragen'
export const REQUEST_ROUTE = '/admin-schreiben'
const DEMO_NOTE = 'Muster: In der Demo stehen auf den Karten Beispiel-Codes („DEMO-…“) – sie lassen sich nicht einlösen.'
const ADMIN_VIEW_NOTE = 'In der Admin-Ansicht stehen auf den Karten Beispiel-Codes („DEMO-…“) – echte Codes holt nur der Partner selbst.'
const PORTAL_FALLBACK = 'bis dahin bekommen die Karten die Rückseite mit eurem Portal.'

function plural(count, singular, pluralForm) {
  return `${count} ${count === 1 ? singular : pluralForm}`
}

function RequestNote({ title }) {
  return (
    <div className="vk-note" role="note">
      <p>
        <strong>{title}</strong> – {PORTAL_FALLBACK}
      </p>
      <Link to={REQUEST_ROUTE} className="btn btn-ghost">
        <Icon name="message" /> Beim Admin anfragen
      </Link>
    </div>
  )
}

function NextPrint({ cards, available }) {
  const missing = Math.max(0, cards - available)
  return (
    <p className="field-hint">
      Beim Drucken bekommt jede Karte einen eigenen Code; danach zählen die Codes als gedruckt – ein neuer Druck bekommt neue.
      {missing > 0 && ` Für ${plural(missing, 'Karte', 'Karten')} reichen sie nicht – die bekommen die Rückseite mit eurem Portal.`}
    </p>
  )
}

function LastPrint({ lastPrint }) {
  const ohne = lastPrint.karten - lastPrint.gutscheine
  return (
    <p className="vk-note is-ok" role="status">
      <Icon name="check" /> Zuletzt gedruckt: {plural(lastPrint.gutscheine, 'Karte', 'Karten')} mit eigenem Gutschein
      {ohne > 0 ? `, ${ohne} mit Portal-Rückseite` : ''}. Diese Codes zählen jetzt als gedruckt.
    </p>
  )
}

function RealCodes({ druck, cards }) {
  const { gutscheine, available, nurUngedruckt, setNurUngedruckt, lastPrint } = druck
  if (gutscheine.offen === 0 && !lastPrint) return <RequestNote title={EMPTY_STACK_HINT} />
  return (
    <div className="vk-gutschein-body">
      <p className="vk-counts">
        {plural(gutscheine.offen, 'offener Gutschein', 'offene Gutscheine')}, davon {gutscheine.ungedruckt} noch nicht gedruckt.
      </p>
      <label className="check vk-toggle" htmlFor="vk-nur-ungedruckt">
        <input id="vk-nur-ungedruckt" type="checkbox" checked={nurUngedruckt} onChange={(event) => setNurUngedruckt(event.target.checked)} />
        <span>Nur noch nicht gedruckte verwenden</span>
      </label>
      {!nurUngedruckt && (
        <p className="field-hint vk-warn">
          Schon gedruckte Codes können auf verteilten Karten stehen – nur nehmen, wenn diese Karten nie ausgegeben wurden.
        </p>
      )}
      {available === 0 ? (
        <RequestNote title={gutscheine.offen === 0 ? EMPTY_STACK_HINT : ALL_PRINTED_HINT} />
      ) : (
        <NextPrint cards={cards} available={available} />
      )}
      {lastPrint && <LastPrint lastPrint={lastPrint} />}
    </div>
  )
}

// druck: Rückgabe von hooks/useVisitenkartenDruck.js; cards: Karten des nächsten Drucks.
export default function VisitenkarteGutschein({ checked, onToggle, readOnly, isAdminView, druck, cards }) {
  return (
    <section className="vk-panel" aria-labelledby="vk-gutschein-title">
      <h2 id="vk-gutschein-title" className="vk-panel-title">
        Kunden-Gutschein
      </h2>
      <label className="check vk-toggle" htmlFor="vk-mit-gutschein">
        <input id="vk-mit-gutschein" type="checkbox" checked={checked} onChange={(event) => onToggle(event.target.checked)} />
        <span>Mit Kunden-Gutschein auf der Rückseite</span>
      </label>
      <p className="field-hint">
        Jede Karte bekommt einen eigenen Code aus euren Kunden-Gutscheinen – wer ihn einlöst, legt eine eigene Chronik an.
      </p>

      {checked && readOnly && (
        <p className="vk-note" role="note">
          {isAdminView ? ADMIN_VIEW_NOTE : DEMO_NOTE}
        </p>
      )}
      {checked && !readOnly && <RealCodes druck={druck} cards={cards} />}
      {druck.error && (
        <p className="field-error" role="alert">
          {druck.error}
        </p>
      )}
    </section>
  )
}
