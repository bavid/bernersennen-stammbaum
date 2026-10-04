// Ein Schalter (Phase W, Schritt 2) für eine Freigabe: Tier in einer Familie zeigen ja/nein. Ein echtes Kontrollkästchen
// mit role="switch" (Leertaste schaltet, Screenreader sagen "Schalter, an/aus"); hint: kurze Erklärung, warum gesperrt.
export default function ShareSwitch({ label, checked, disabled, hint, describedBy, onChange }) {
  return (
    <label className={`share-switch${disabled ? ' is-disabled' : ''}`}>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        aria-describedby={describedBy}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="share-switch-track" aria-hidden="true">
        <span className="share-switch-thumb" />
      </span>
      <span className="share-switch-label">{label}</span>
      {hint && <span className="share-switch-hint">{hint}</span>}
    </label>
  )
}
