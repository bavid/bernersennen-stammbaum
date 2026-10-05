import Icon from './Icon.jsx'

export const HANDLE_TITLE = 'Verschieben: ziehen – oder mit der Leertaste aufnehmen und mit den Pfeiltasten bewegen'

// Der Griff zum Anordnen (hooks/useDragReorder.js) an einem Foto im Reiter „Fotos“: ziehen mit Maus oder Finger, per
// Tastatur aufnehmen (Leertaste), bewegen (Pfeile) und ablegen. aria-grabbed und das Label nennen die Stelle („Foto 2 von
// 4“); die Ansage läuft über die aria-live-Region der Liste. reorder: der Hook; itemKey: der Schlüssel dieses Eintrags.
export default function ReorderHandle({ reorder, itemKey, index, count, label, disabled = false, className = '' }) {
  const grabbed = reorder.isGrabbed(itemKey)
  return (
    <button
      type="button"
      className={`reorder-handle${grabbed ? ' is-grabbed' : ''}${className ? ` ${className}` : ''}`}
      aria-label={`${label} verschieben – Stelle ${index + 1} von ${count}`}
      title={HANDLE_TITLE}
      disabled={disabled}
      {...reorder.handleProps(itemKey)}
    >
      <Icon name="grip" />
    </button>
  )
}
