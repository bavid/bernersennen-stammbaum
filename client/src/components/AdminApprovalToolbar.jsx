import Icon from './Icon.jsx'
import { MAX_SAMMEL_FREIGABE } from '../lib/adminApproval.js'

export const APPROVAL_FILTERS = Object.freeze([
  Object.freeze({ key: 'eingereicht', label: 'Eingereicht' }),
  Object.freeze({ key: 'entschieden', label: 'Zuletzt entschieden' })
])

// Kopfleiste von "Zur Freigabe" (V-Fehler 3): Filter "Eingereicht" / "Zuletzt entschieden" und - nur bei den
// eingereichten - "Alle auswählen" und "Ausgewählte freigeben (n)". Reine Anzeige; der Zustand liegt in
// AdminPostApproval.
// overLimit: mehr eingereicht als auf einmal freigegeben werden können (MAX_SAMMEL_FREIGABE) - dann ein kurzer Hinweis.
export default function AdminApprovalToolbar({
  filter,
  onFilter,
  selectable,
  total,
  selectedCount,
  overLimit = false,
  bulkBusy,
  onSelectAll,
  onApproveSelected
}) {
  const allSelected = total > 0 && selectedCount === total

  return (
    <div className="admin-approval-toolbar">
      <div className="segmented segmented-sm admin-approval-filter" role="group" aria-label="Beiträge anzeigen">
        {APPROVAL_FILTERS.map(({ key, label }) => (
          <button key={key} type="button" aria-pressed={filter === key} onClick={() => onFilter(key)}>
            {label}
          </button>
        ))}
      </div>
      {selectable && (
        <div className="admin-approval-bulk">
          <label className="check admin-approval-select-all">
            <input type="checkbox" checked={allSelected} disabled={total === 0 || bulkBusy} onChange={(e) => onSelectAll(e.target.checked)} />
            Alle auswählen
          </label>
          <button type="button" className="btn btn-primary" disabled={selectedCount === 0 || bulkBusy} onClick={onApproveSelected}>
            <Icon name="check" />
            {bulkBusy ? 'Gebe frei …' : `Ausgewählte freigeben${selectedCount > 0 ? ` (${selectedCount})` : ''}`}
          </button>
          {overLimit && <span className="field-hint admin-approval-limit">Höchstens {MAX_SAMMEL_FREIGABE} auf einmal.</span>}
        </div>
      )}
    </div>
  )
}
