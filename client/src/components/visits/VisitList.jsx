import ConfirmButton from '../ConfirmButton.jsx'
import { formatDateShort } from '../../lib/dates.js'

// Eine Liste verbundener Zuhause (Phase V2) mit "beenden" je Zeile: "Zu Besuch bei" (wo ich Gast bin) oder
// "Meine Gäste" (wer bei mir zu Gast ist). items: [{ id, name, seit }]. onEnd(item) beendet die Verbindung.
export default function VisitList({ id, title, emptyText, items, onEnd, confirmLabel, disabled }) {
  return (
    <section className="visit-list" aria-labelledby={id}>
      <h4 id={id}>{title}</h4>
      {items.length === 0 ? (
        <p className="muted">{emptyText}</p>
      ) : (
        <ul className="visit-rows">
          {items.map((item) => (
            <li key={item.id} className="visit-row">
              <span className="visit-row-name">{item.name}</span>
              {item.seit && <span className="visit-row-since muted">seit {formatDateShort(item.seit)}</span>}
              <ConfirmButton
                label="Beenden"
                confirmLabel={confirmLabel}
                ariaLabel={`Verbindung mit ${item.name} beenden`}
                disabled={disabled}
                onConfirm={() => onEnd(item)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
