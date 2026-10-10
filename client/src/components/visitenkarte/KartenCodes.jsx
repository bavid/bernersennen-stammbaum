import { Link } from 'react-router-dom'
import Icon from '../Icon.jsx'
import { t } from '../../lib/i18n/index.js'

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

function cardsText(count) {
  return count === 1 ? t('{n} Karte', { n: count }) : t('{n} Karten', { n: count })
}

export function missingCodesText(missing, printable) {
  const cards = cardsText(missing)
  return printable === 1
    ? t('Für {cards} fehlen Codes – gedruckt wird nur die eine mit Code.', { cards })
    : t('Für {cards} fehlen Codes – gedruckt werden nur die {n} mit Code.', { cards, n: printable })
}

function RequestNote({ title }) {
  return (
    <div className="vk-note" role="note">
      <p>
        <strong>{t(title)}</strong> – {t(NO_CODE)}
      </p>
      <Link to={REQUEST_ROUTE} className="btn btn-ghost">
        <Icon name="message" /> {t('Beim Admin anfragen')}
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
        {t(gutscheine.offen === 1 ? '{n} offener Einladungscode, davon {m} noch nicht gedruckt.' : '{n} offene Einladungscodes, davon {m} noch nicht gedruckt.', {
          n: gutscheine.offen,
          m: gutscheine.ungedruckt
        })}
      </p>
      <label className="check vk-toggle" htmlFor="vk-nur-ungedruckt">
        <input
          id="vk-nur-ungedruckt"
          type="checkbox"
          checked={nurUngedruckt}
          onChange={(event) => setNurUngedruckt(event.target.checked)}
          disabled={druck.busy}
        />
        <span>{t('Nur noch nicht gedruckte verwenden')}</span>
      </label>
      {!nurUngedruckt && (
        <p className="field-hint vk-warn">
          {t('Schon gedruckte Codes können auf verteilten Karten stehen – nur nehmen, wenn diese Karten nie ausgegeben wurden.')}
        </p>
      )}
    </>
  )
}

function LastPrint({ lastPrint }) {
  if (lastPrint.codes === 0) {
    return (
      <p className="vk-note" role="status">
        {t('Zuletzt: Es war kein Code mehr frei – es wurde keine Karte gedruckt.')}
      </p>
    )
  }
  const fehlten = lastPrint.karten - lastPrint.codes
  return (
    <p className="vk-note is-ok" role="status">
      <Icon name="check" /> {t('Zuletzt gedruckt: {cards} mit eigenem Code', { cards: cardsText(lastPrint.codes) })}
      {fehlten > 0 ? t(' – für {cards} fehlte ein Code, sie kamen nicht aufs Papier', { cards: cardsText(fehlten) }) : ''}
      {t('. Diese Codes zählen jetzt als gedruckt.')}
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
        {t('Einladungscodes')}
      </h2>
      <p className="field-hint">
        {t('Jede Karte bekommt beim Drucken einen eigenen Einladungscode – wer ihn einlöst, legt eine eigene Chronik an. Danach zählt er als gedruckt.')}
      </p>
      {readOnly ? (
        <p className="vk-note" role="note">
          {t(isAdminView ? ADMIN_VIEW_NOTE : DEMO_NOTE)}
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
