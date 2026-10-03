import Icon from '../Icon.jsx'
import { ART } from '../../lib/einladungskarte.js'
import { ADMIN_VIEW_NOTE, ALL_PRINTED_HINT, DEMO_NOTE, EMPTY_STACK_HINT, RequestNote, StapelStand, plural } from './VisitenkarteGutschein.jsx'

// Codes der Einladungskarten: jede Karte trägt einen eigenen offenen Code aus dem eigenen Kunden-Stapel - derselbe Abruf
// wie bei den Visitenkarten (hooks/useVisitenkartenDruck.js, druck): erst "Drucken" holt sie, in genau der Zahl der
// Karten, danach zählen sie als gedruckt. Ohne Code gibt es keine Einladungskarte: reichen die Codes nicht, druckt
// "Drucken" nur so viele Karten, wie Codes da sind (missingCodesText sagt das in einem Satz). Demo und Admin-Ansicht holen
// nie Codes - ihre Karten zeigen Muster-Codes ("DEMO-…").

const NO_CODE = 'ohne Code gibt es keine Einladungskarte.'

export function missingCodesText(missing, printable) {
  return `Für ${plural(missing, 'Karte', 'Karten')} fehlen Codes – gedruckt ${printable === 1 ? 'wird nur die eine' : `werden nur die ${printable}`} mit Code.`
}

function LastPrint({ lastPrint }) {
  if (lastPrint.gutscheine === 0) {
    return (
      <p className="vk-note" role="status">
        Zuletzt: Es war kein Code mehr frei – es wurde keine Karte gedruckt.
      </p>
    )
  }
  const fehlten = lastPrint.karten - lastPrint.gutscheine
  return (
    <p className="vk-note is-ok" role="status">
      <Icon name="check" /> Zuletzt gedruckt: {plural(lastPrint.gutscheine, 'Einladungskarte', 'Einladungskarten')} mit eigenem Code
      {fehlten > 0 ? ` – für ${plural(fehlten, 'Karte', 'Karten')} fehlte ein Code, sie kamen nicht aufs Papier` : ''}. Diese Codes zählen jetzt als
      gedruckt.
    </p>
  )
}

function RealCodes({ druck, count }) {
  const { gutscheine, available } = druck
  const lastPrint = druck.lastPrint?.art === ART.einladung ? druck.lastPrint : null
  if (gutscheine.offen === 0 && !lastPrint) return <RequestNote title={EMPTY_STACK_HINT} folge={NO_CODE} />
  const missing = Math.max(0, count - available)
  return (
    <div className="vk-gutschein-body">
      <StapelStand druck={druck} />
      {available === 0 && <RequestNote title={gutscheine.offen === 0 ? EMPTY_STACK_HINT : ALL_PRINTED_HINT} folge={NO_CODE} />}
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
export default function EinladungCodes({ readOnly, isAdminView, druck, count }) {
  return (
    <section className="vk-panel" aria-labelledby="vk-codes-title">
      <h2 id="vk-codes-title" className="vk-panel-title">
        Codes
      </h2>
      <p className="field-hint">
        Jede Karte bekommt beim Drucken einen eigenen Code aus euren Kunden-Gutscheinen – wer ihn einlöst, legt eine eigene Chronik
        an. Danach zählen sie als gedruckt.
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
