import Icon from '../Icon.jsx'
import { ADDRESS_PENDING_TEXT } from '../../lib/voucherPrint.js'

// Teile, die Visitenkarten- und Einladungskarten-Designer teilen (VisitenkartenDesigner, EinladungskartenDesigner): der
// Hinweis, solange die Plattform keine öffentliche Adresse hat, die Zeile "Gestaltung speichern" und die Vorschau-Bühne
// mit Vorder- und Rückseite in echten Proportionen.

// Feedback-Runde: ein freundlicher Satz statt einer technischen Adresse (lib/voucherPrint.js printAddressPending) - nur
// in Produktion ohne Domain, nie in Vorschau, Demo oder Admin-Ansicht.
export function AddressPendingNote() {
  return (
    <p className="vk-note" role="status">
      <Icon name="clock" /> {ADDRESS_PENDING_TEXT}
    </p>
  )
}

// entwurf: Rückgabe von hooks/useKartenEntwurf.js.
export function SaveRow({ entwurf, readOnly, readOnlyHint }) {
  const { dirty, saving, error, save } = entwurf
  return (
    <div className="vk-save-row">
      <button type="button" className="btn btn-primary" onClick={save} disabled={readOnly || saving || !dirty}>
        <Icon name="check" /> {saving ? 'Speichere …' : 'Gestaltung speichern'}
      </button>
      {readOnly ? (
        <span className="field-hint">{readOnlyHint}</span>
      ) : (
        <span className={`field-hint ${dirty ? 'vk-dirty' : ''}`}>{dirty ? 'Noch nicht gespeichert' : 'Gespeichert'}</span>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

// front/back: die gezeichneten Seiten; backNote: ein Satz unter der Rückseite (Einladungskarte: wer sie gestaltet).
export function Stage({ front, back, backNote = null }) {
  return (
    <section className="vk-stage" aria-labelledby="vk-vorschau-title">
      <div className="vk-stage-head">
        <h2 id="vk-vorschau-title" className="vk-panel-title">
          Vorschau
        </h2>
        <span className="muted">85 × 55 mm</span>
      </div>
      <div className="vk-stage-cards">
        <figure className="vk-stage-card">
          {front}
          <figcaption>Vorderseite</figcaption>
        </figure>
        <figure className="vk-stage-card">
          {back}
          <figcaption>
            Rückseite
            {backNote && <span className="vk-stage-note">{backNote}</span>}
          </figcaption>
        </figure>
      </div>
    </section>
  )
}
