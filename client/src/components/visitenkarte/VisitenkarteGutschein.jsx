import { Link } from 'react-router-dom'
import Icon from '../Icon.jsx'

// "Mit Kunden-Gutschein" (Phase V5): jede gedruckte Karte bekommt auf der Rückseite einen eigenen offenen Code aus dem
// eigenen Kunden-Stapel. Die Codes holt erst ein Klick (api.partnerArea.visitenkarteGutscheine) - der Server vermerkt
// sie dabei als gedruckt, damit sie nicht ein zweites Mal auf Karten landen. Demo und Admin-Ansicht holen nie Codes:
// ihre Karten zeigen Muster-Codes ("DEMO-…"). Ohne offene Gutscheine: Hinweis mit Weg zum Admin.

export const EMPTY_STACK_HINT = 'Keine offenen Gutscheine – beim Admin neue anfragen'
export const REQUEST_ROUTE = '/admin-schreiben'
const DEMO_NOTE = 'Muster: In der Demo stehen auf den Karten Beispiel-Codes („DEMO-…“) – sie lassen sich nicht einlösen.'
const ADMIN_VIEW_NOTE = 'In der Admin-Ansicht stehen auf den Karten Beispiel-Codes („DEMO-…“) – echte Codes holt nur der Partner selbst.'

function plural(count, singular, pluralForm) {
  return `${count} ${count === 1 ? singular : pluralForm}`
}

function RequestLink() {
  return (
    <Link to={REQUEST_ROUTE} className="btn btn-ghost">
      <Icon name="message" /> Beim Admin anfragen
    </Link>
  )
}

function CodeStatus({ cards, codes, gutscheine, nurUngedruckt, busy, onHolen }) {
  const missing = Math.max(0, cards - codes.length)
  const available = nurUngedruckt ? gutscheine.ungedruckt : Math.max(0, gutscheine.offen - codes.length)
  const extra = Math.max(0, codes.length - cards)

  return (
    <>
      {codes.length > 0 && (
        <p className="vk-note is-ok" role="status">
          <Icon name="check" /> {plural(codes.length, 'Gutschein', 'Gutscheine')} für diesen Druck geholt – sie zählen ab jetzt als gedruckt.
        </p>
      )}
      {missing > 0 && available > 0 && (
        <button type="button" className="btn btn-ink" onClick={onHolen} disabled={busy}>
          <Icon name="download" />
          {busy ? 'Hole Gutscheine …' : `${codes.length > 0 ? 'Weitere ' : ''}Gutscheine für ${plural(missing, 'Karte', 'Karten')} holen`}
        </button>
      )}
      {missing > 0 && available === 0 && (
        <div className="vk-note" role="note">
          <p>
            Für {plural(missing, 'Karte', 'Karten')} reichen die {nurUngedruckt ? 'ungedruckten ' : ''}Gutscheine nicht – sie bekommen die
            Rückseite mit eurem Portal.
          </p>
          <RequestLink />
        </div>
      )}
      {extra > 0 && (
        <p className="field-hint">
          {plural(extra, 'geholter Gutschein kommt', 'geholte Gutscheine kommen')} in diesem Druck nicht vor – sie bleiben offen.
        </p>
      )}
    </>
  )
}

export default function VisitenkarteGutschein({
  checked,
  onToggle,
  readOnly,
  isAdminView,
  gutscheine,
  cards,
  codes,
  nurUngedruckt,
  onNurUngedruckt,
  busy,
  error,
  onHolen
}) {
  const empty = gutscheine.offen === 0 && codes.length === 0

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
      {checked && !readOnly && empty && (
        <div className="vk-note" role="note">
          <p>
            <strong>{EMPTY_STACK_HINT}</strong> – bis dahin bekommen die Karten die Rückseite mit eurem Portal.
          </p>
          <RequestLink />
        </div>
      )}
      {checked && !readOnly && !empty && (
        <div className="vk-gutschein-body">
          <p className="vk-counts">
            {plural(gutscheine.offen, 'offener Gutschein', 'offene Gutscheine')}, davon {gutscheine.ungedruckt} noch nicht gedruckt.
          </p>
          <label className="check vk-toggle" htmlFor="vk-nur-ungedruckt">
            <input
              id="vk-nur-ungedruckt"
              type="checkbox"
              checked={nurUngedruckt}
              onChange={(event) => onNurUngedruckt(event.target.checked)}
            />
            <span>Nur noch nicht gedruckte verwenden</span>
          </label>
          <CodeStatus cards={cards} codes={codes} gutscheine={gutscheine} nurUngedruckt={nurUngedruckt} busy={busy} onHolen={onHolen} />
        </div>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
