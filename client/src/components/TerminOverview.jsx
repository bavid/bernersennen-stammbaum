import ConfirmButton from './ConfirmButton.jsx'
import Icon from './Icon.jsx'
import TerminDate from './TerminDate.jsx'
import { SERIE, formatTagKurz, formatUhrzeit, groupByMonth, serieLabel, vorkommenKey } from '../lib/termine.js'

// Eine Zeile der Übersicht: Datum, Uhrzeit, Titel, Ort und Regel der Serie; abgesagte durchgestrichen mit "fällt aus",
// vom Team ausgeblendete markiert. Aktionen: die ganze Serie bearbeiten oder löschen, diesen einen Tag absagen bzw.
// wieder stattfinden lassen. busy: gerade läuft eine Anfrage für diesen Termin.
function TerminRow({ item, termin, busy, demoHintId, onEdit, onDelete, onToggleAbsage }) {
  const isSerie = item.serie !== SERIE.keine
  const when = `${item.titel} am ${formatTagKurz(item.datum)}`
  const disabled = Boolean(demoHintId) || busy

  return (
    <li className={`termin-row${item.abgesagt ? ' is-cancelled' : ''}${item.ausgeblendet ? ' is-hidden' : ''}`}>
      <TerminDate datum={item.datum} />
      <div className="termin-row-body">
        <p className="termin-row-time">
          {formatUhrzeit(item.uhrzeit, item.ende)}
          {item.abgesagt && <span className="termin-badge-cancelled">fällt aus</span>}
          {item.ausgeblendet && (
            <span className="pill termin-badge-hidden">
              <Icon name="eyeOff" />
              Vom Team ausgeblendet
            </span>
          )}
        </p>
        <h4 className="termin-row-title">{item.titel}</h4>
        <p className="termin-row-meta">
          {[item.ort, isSerie ? serieLabel(item.serie, termin?.datum || item.datum) : null].filter(Boolean).join(' · ')}
        </p>
      </div>
      <div className="termin-row-actions">
        <button
          type="button"
          className="btn btn-ghost termin-action"
          onClick={() => onToggleAbsage(item)}
          disabled={disabled}
          aria-describedby={demoHintId}
          aria-label={item.abgesagt ? `Wieder stattfinden lassen: ${when}` : `Diesen Termin absagen: ${when}`}
        >
          {item.abgesagt ? 'Wieder stattfinden lassen' : 'Diesen Termin absagen'}
        </button>
        <button
          type="button"
          className="btn btn-ghost termin-action"
          onClick={() => termin && onEdit(termin)}
          disabled={disabled || !termin}
          aria-describedby={demoHintId}
          aria-label={isSerie ? `Serie bearbeiten: ${item.titel}` : `Bearbeiten: ${when}`}
        >
          <Icon name="edit" />
          {isSerie ? 'Serie bearbeiten' : 'Bearbeiten'}
        </button>
        <ConfirmButton
          className="termin-action"
          onConfirm={() => termin && onDelete(termin)}
          label={isSerie ? 'Serie löschen' : 'Löschen'}
          confirmLabel={isSerie ? 'Ganze Serie löschen?' : 'Wirklich löschen?'}
          ariaLabel={isSerie ? `Serie löschen: ${item.titel}` : `Löschen: ${when}`}
          disabled={disabled || !termin}
          describedBy={demoHintId}
        />
      </div>
    </li>
  )
}

// Übersicht im Partner-Bereich (Phase V4a): alle Termine der nächsten zwölf Monate nach Monat, Serien aufgeklappt
// (vorkommen vom Server). termineById: Map terminId -> Termin (für Bearbeiten und Löschen der ganzen Serie).
export default function TerminOverview({ vorkommen, termineById, busyId, demoHintId, onEdit, onDelete, onToggleAbsage }) {
  if (vorkommen.length === 0) return <p className="empty-state termin-empty">Noch keine Termine in den nächsten zwölf Monaten.</p>
  return (
    <div className="termin-overview">
      {groupByMonth(vorkommen).map((group) => (
        <section key={group.key} className="termin-month" aria-labelledby={`termin-month-${group.key}`}>
          <h3 id={`termin-month-${group.key}`} className="termin-month-title">
            {group.label}
          </h3>
          <ul className="termin-list">
            {group.items.map((item) => (
              <TerminRow
                key={vorkommenKey(item)}
                item={item}
                termin={termineById.get(item.terminId)}
                busy={busyId === item.terminId}
                demoHintId={demoHintId}
                onEdit={onEdit}
                onDelete={onDelete}
                onToggleAbsage={onToggleAbsage}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
