import Icon from './Icon.jsx'
import ConfirmButton from './ConfirmButton.jsx'
import ExpandableText from './ExpandableText.jsx'
import { STATUS_LABELS, formatZeitraum } from '../lib/hinweise.js'
import { Button } from './ui/index.js'

const STUFE_LABELS = { info: 'Info', wartung: 'Wartung', wichtig: 'Wichtig' }
const TEXT_LINES = 2

// Ein Hinweis in der Liste (AdminHinweise): Status-Chip, Stufe, Titel, Zeitraum in Berliner Zeit, Text (nach zwei Zeilen
// eingeklappt) und Aktionen. editDisabled: gerade ist ein anderes Formular offen; editButtonId: Ziel für den Fokus,
// wenn das Formular wieder zugeht.
export default function AdminHinweisRow({ hinweis, editButtonId, editDisabled, onEdit, onToggle, onDelete }) {
  return (
    <li className={`admin-hinweis is-${hinweis.status}`}>
      <div className="admin-hinweis-head">
        <span className={`pill admin-hinweis-status is-${hinweis.status}`}>{STATUS_LABELS[hinweis.status] || hinweis.status}</span>
        <span className={`admin-hinweis-stufe is-${hinweis.stufe}`}>{STUFE_LABELS[hinweis.stufe] || hinweis.stufe}</span>
        {hinweis.isDemo && <span className="pill admin-hinweis-demo">Beispiel</span>}
        <strong className="admin-hinweis-titel">{hinweis.titel}</strong>
      </div>
      <p className="admin-hinweis-zeitraum muted">
        <Icon name="clock" />
        {formatZeitraum(hinweis)}
      </p>
      {hinweis.text && <ExpandableText text={hinweis.text} className="admin-hinweis-text" lines={TEXT_LINES} />}
      <div className="admin-row-actions">
        <Button type="button" id={editButtonId} variant="ghost" disabled={editDisabled} onClick={onEdit}>
          <Icon name="edit" />
          Bearbeiten
        </Button>
        <Button type="button" variant="ghost" onClick={onToggle}>
          <Icon name={hinweis.aktiv ? 'eyeOff' : 'eye'} />
          {hinweis.aktiv ? 'Ausschalten' : 'Einschalten'}
        </Button>
        <ConfirmButton onConfirm={onDelete} label="Löschen" confirmLabel="Wirklich löschen?" />
      </div>
    </li>
  )
}
