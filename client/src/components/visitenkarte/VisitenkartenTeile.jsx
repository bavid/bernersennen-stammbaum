import Icon from '../Icon.jsx'
import { ADDRESS_PENDING_TEXT } from '../../lib/voucherPrint.js'
import { t } from '../../lib/i18n/index.js'
import { Button } from '../ui/index.js'

// Teile des Karten-Designers (KartenDesigner): der Hinweis, solange die Plattform keine öffentliche Adresse hat, die
// Zeile "Gestaltung speichern", die Vorschau-Bühne mit Vorder- und Rückseite in echten Proportionen und die aufklappbare
// Vorschau des Druckbogens.

// Feedback-Runde: ein freundlicher Satz statt einer technischen Adresse (lib/voucherPrint.js printAddressPending) - nur
// in Produktion ohne Domain, nie in Vorschau, Demo oder Admin-Ansicht.
export function AddressPendingNote() {
  return (
    <p className="vk-note" role="status">
      <Icon name="clock" /> {t(ADDRESS_PENDING_TEXT)}
    </p>
  )
}

// entwurf: Rückgabe von hooks/useKartenEntwurf.js.
export function SaveRow({ entwurf, readOnly, readOnlyHint }) {
  const { dirty, saving, error, save } = entwurf
  return (
    <div className="vk-save-row">
      <Button type="button" onClick={save} disabled={readOnly || saving || !dirty}>
        <Icon name="check" /> {saving ? t('Speichere …') : t('Gestaltung speichern')}
      </Button>
      {readOnly ? (
        <span className="field-hint">{readOnlyHint}</span>
      ) : (
        <span className={`field-hint ${dirty ? 'vk-dirty' : ''}`}>{dirty ? t('Noch nicht gespeichert') : t('Gespeichert')}</span>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

// front/back: die gezeichneten Seiten; backNote: ein Satz unter der Rückseite (Rückseiten mit Code: wer sie gestaltet).
export function Stage({ front, back, backNote = null }) {
  return (
    <section className="vk-stage" aria-labelledby="vk-vorschau-title">
      <div className="vk-stage-head">
        <h2 id="vk-vorschau-title" className="vk-panel-title">
          {t('Vorschau')}
        </h2>
        <span className="muted">85 × 55 mm</span>
      </div>
      <div className="vk-stage-cards">
        <figure className="vk-stage-card">
          {front}
          <figcaption>{t('Vorderseite')}</figcaption>
        </figure>
        <figure className="vk-stage-card">
          {back}
          <figcaption>
            {t('Rückseite')}
            {backNote && <span className="vk-stage-note">{backNote}</span>}
          </figcaption>
        </figure>
      </div>
    </section>
  )
}

// Feedback-Runde: der erste A4-Bogen zum Aufklappen - zu sehen, wenn man ihn sehen will, statt die Seite lang zu machen.
// note: ein Satz dazu (z. B. dass die echten Codes erst beim Drucken kommen); children: der Bogen (VisitenkartenBoegen).
export function BogenVorschau({ note, children }) {
  return (
    <details className="vk-bogen-vorschau">
      <summary>
        <span className="vk-bogen-summary">{t('Druckbogen ansehen')}</span>
      </summary>
      <div className="vk-bogen-body">
        <p className="muted">
          {t('So kommt Bogen 1 aufs Papier – vorne eure Seite, hinten die Rückseite, gespiegelt.')}
          {note && ` ${note}`}
        </p>
        {children}
      </div>
    </details>
  )
}
