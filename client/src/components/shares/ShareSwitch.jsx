// Ein Schalter (Phase W, Schritt 2) für eine Freigabe: Tier in einer Familie zeigen ja/nein. Ein echtes Kontrollkästchen
// mit role="switch" (Leertaste schaltet, Screenreader sagen "Schalter, an/aus"); hint: kurze Erklärung, warum gesperrt.
// busy: eine Änderung ist unterwegs - der Schalter bleibt fokussierbar (ein gesperrtes Feld verlöre den Fokus, wer mit der
// Tastatur schaltet, stünde danach am Seitenanfang), nimmt aber keine zweite Änderung an (aria-disabled, aria-busy).
export default function ShareSwitch({ label, checked, disabled, busy = false, hint, describedBy, onChange }) {
  return (
    <label className={`share-switch${disabled ? ' is-disabled' : ''}${busy ? ' is-busy' : ''}`}>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        aria-disabled={busy || undefined}
        aria-busy={busy || undefined}
        aria-describedby={describedBy}
        onChange={(event) => {
          if (!busy) onChange(event.target.checked)
        }}
      />
      <span className="share-switch-track" aria-hidden="true">
        <span className="share-switch-thumb" />
      </span>
      <span className="share-switch-label">{label}</span>
      {hint && <span className="share-switch-hint">{hint}</span>}
    </label>
  )
}
