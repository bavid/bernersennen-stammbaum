import ConfirmButton from './ConfirmButton.jsx'
import Icon from './Icon.jsx'
import TerminDate from './TerminDate.jsx'
import { formatTagKurz, formatUhrzeit, groupByMonth, serieLabel, splitSerien, vorkommenKey } from '../lib/termine.js'
import { t } from '../lib/i18n/index.js'

function HiddenBadge() {
  return (
    <span className="pill termin-badge-hidden">
      <Icon name="eyeOff" />
      {t('Vom Team ausgeblendet')}
    </span>
  )
}

function absageLabel(count) {
  return count === 1 ? t('1 Tag fällt aus') : t('{n} Tage fallen aus', { n: count })
}

// Absagen bzw. wieder stattfinden lassen - für einen Einzeltermin und für einen Tag einer Serie. aria-label nennt Titel
// und Tag, sichtbar reicht das kurze Wort.
function AbsageButton({ item, disabled, demoHintId, onToggleAbsage }) {
  const when = t('{title} am {date}', { title: item.titel, date: formatTagKurz(item.datum) })
  return (
    <button
      type="button"
      className="btn btn-ghost termin-action"
      onClick={() => onToggleAbsage(item)}
      disabled={disabled}
      aria-describedby={demoHintId}
      aria-label={item.abgesagt ? t('Wieder stattfinden lassen: {when}', { when }) : t('Diesen Termin absagen: {when}', { when })}
    >
      {item.abgesagt ? t('Wieder stattfinden lassen') : t('Absagen')}
    </button>
  )
}

// Die Tage einer Serie zum Aufklappen (nach Monat): je Tag das Datum und "Absagen" bzw. "Wieder stattfinden lassen".
function SerieTage({ serie, disabled, demoHintId, onToggleAbsage }) {
  return (
    <details className="termin-serie-tage">
      <summary>{t('Einzelne Tage absagen ({n})', { n: serie.items.length })}</summary>
      {groupByMonth(serie.items).map((group) => (
        <div key={group.key} className="termin-serie-monat">
          <p className="termin-group-label">{group.label}</p>
          <ul className="termin-tage">
            {group.items.map((item) => (
              <li key={vorkommenKey(item)} className={`termin-tag${item.abgesagt ? ' is-cancelled' : ''}`}>
                <span className="termin-tag-datum">
                  <span className="termin-tag-text">{formatTagKurz(item.datum)}</span>
                  {item.abgesagt && <span className="termin-badge-cancelled">{t('fällt aus')}</span>}
                </span>
                <AbsageButton item={item} disabled={disabled} demoHintId={demoHintId} onToggleAbsage={onToggleAbsage} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </details>
  )
}

// Eine Serie in einer Zeile (Audit V7a - vorher stand jeder Tag mit drei Knöpfen untereinander, bei Wochenserien sehr
// lang): der nächste stattfindende Tag, Uhrzeit, Titel, Ort und Regel, wie viele Tage ausfallen; Serie bearbeiten oder
// löschen; darunter die einzelnen Tage zum Absagen aufklappbar.
function SerieRow({ serie, termin, busy, demoHintId, onEdit, onDelete, onToggleAbsage }) {
  const first = serie.naechster
  const disabled = Boolean(demoHintId) || busy
  return (
    <li className={`termin-row termin-row-serie${first.ausgeblendet ? ' is-hidden' : ''}`}>
      <TerminDate datum={first.datum} />
      <div className="termin-row-body">
        <p className="termin-row-time">
          {formatUhrzeit(first.uhrzeit, first.ende)}
          {first.ausgeblendet && <HiddenBadge />}
        </p>
        <h4 className="termin-row-title">{first.titel}</h4>
        <p className="termin-row-meta">{[first.ort, serieLabel(first.serie, termin?.datum || first.datum)].filter(Boolean).join(' · ')}</p>
        <p className="termin-row-next">
          {t('Nächster Termin: {date}', { date: formatTagKurz(first.datum) })}
          {serie.abgesagt > 0 && <> · {absageLabel(serie.abgesagt)}</>}
        </p>
      </div>
      <div className="termin-row-actions">
        <button
          type="button"
          className="btn btn-ghost termin-action"
          onClick={() => termin && onEdit(termin)}
          disabled={disabled || !termin}
          aria-describedby={demoHintId}
          aria-label={t('Serie bearbeiten: {title}', { title: first.titel })}
        >
          <Icon name="edit" />
          {t('Serie bearbeiten')}
        </button>
        <ConfirmButton
          className="termin-action"
          onConfirm={() => termin && onDelete(termin)}
          label="Serie löschen"
          confirmLabel="Ganze Serie löschen?"
          ariaLabel={t('Serie löschen: {title}', { title: first.titel })}
          disabled={disabled || !termin}
          describedBy={demoHintId}
        />
      </div>
      <SerieTage serie={serie} disabled={disabled} demoHintId={demoHintId} onToggleAbsage={onToggleAbsage} />
    </li>
  )
}

// Ein Einzeltermin: Datum, Uhrzeit, Titel, Ort; abgesagte durchgestrichen mit "fällt aus", vom Team ausgeblendete markiert.
// Aktionen: absagen bzw. wieder stattfinden lassen, bearbeiten, löschen. busy: gerade läuft eine Anfrage für diesen Termin.
function TerminRow({ item, termin, busy, demoHintId, onEdit, onDelete, onToggleAbsage }) {
  const when = t('{title} am {date}', { title: item.titel, date: formatTagKurz(item.datum) })
  const disabled = Boolean(demoHintId) || busy

  return (
    <li className={`termin-row${item.abgesagt ? ' is-cancelled' : ''}${item.ausgeblendet ? ' is-hidden' : ''}`}>
      <TerminDate datum={item.datum} />
      <div className="termin-row-body">
        <p className="termin-row-time">
          {formatUhrzeit(item.uhrzeit, item.ende)}
          {item.abgesagt && <span className="termin-badge-cancelled">{t('fällt aus')}</span>}
          {item.ausgeblendet && <HiddenBadge />}
        </p>
        <h4 className="termin-row-title">{item.titel}</h4>
        {item.ort && <p className="termin-row-meta">{item.ort}</p>}
      </div>
      <div className="termin-row-actions">
        <AbsageButton item={item} disabled={disabled} demoHintId={demoHintId} onToggleAbsage={onToggleAbsage} />
        <button
          type="button"
          className="btn btn-ghost termin-action"
          onClick={() => termin && onEdit(termin)}
          disabled={disabled || !termin}
          aria-describedby={demoHintId}
          aria-label={t('Bearbeiten: {when}', { when })}
        >
          <Icon name="edit" />
          {t('Bearbeiten')}
        </button>
        <ConfirmButton
          className="termin-action"
          onConfirm={() => termin && onDelete(termin)}
          label="Löschen"
          confirmLabel="Wirklich löschen?"
          ariaLabel={t('Löschen: {when}', { when })}
          disabled={disabled || !termin}
          describedBy={demoHintId}
        />
      </div>
    </li>
  )
}

// Übersicht im Partner-Bereich (Phase V4a, seit Audit V7a mit Serien in einer Zeile): oben "Serien" - jede einmal, ihre
// Tage aufklappbar -, darunter die Einzeltermine der nächsten zwölf Monate nach Monat (vorkommen vom Server).
// termineById: Map terminId -> Termin (für Bearbeiten und Löschen).
export default function TerminOverview({ vorkommen, termineById, busyId, demoHintId, onEdit, onDelete, onToggleAbsage }) {
  if (vorkommen.length === 0) return <p className="empty-state termin-empty">{t('Noch keine Termine in den nächsten zwölf Monaten.')}</p>
  const { serien, einzeln } = splitSerien(vorkommen)
  const actions = { demoHintId, onEdit, onDelete, onToggleAbsage }
  return (
    <div className="termin-overview">
      {serien.length > 0 && (
        <section className="termin-month" aria-labelledby="termin-serien-title">
          <h3 id="termin-serien-title" className="termin-month-title">
            {t('Serien')}
          </h3>
          <ul className="termin-list">
            {serien.map((serie) => (
              <SerieRow key={serie.terminId} serie={serie} termin={termineById.get(serie.terminId)} busy={busyId === serie.terminId} {...actions} />
            ))}
          </ul>
        </section>
      )}
      {einzeln.length > 0 && (
        <section className="termin-month" aria-labelledby="termin-einzeln-title">
          <h3 id="termin-einzeln-title" className="termin-month-title">
            {t('Einzeltermine')}
          </h3>
          {groupByMonth(einzeln).map((group) => (
            <div key={group.key} className="termin-einzeln-monat">
              <p className="termin-group-label">{group.label}</p>
              <ul className="termin-list">
                {group.items.map((item) => (
                  <TerminRow key={vorkommenKey(item)} item={item} termin={termineById.get(item.terminId)} busy={busyId === item.terminId} {...actions} />
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}
