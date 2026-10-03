import { ART } from '../../lib/einladungskarte.js'

// Wahl der Kartenart oben im Designer (PartnerVisitenkartenPage): Visitenkarte oder Einladungskarte - die Wahl steht in
// der Adresse (?art=einladung), damit Links aus dem Profil und den Kunden-Gutscheinen direkt die richtige Art öffnen.
// disabled: solange ein Druck seine Codes holt (code-review: sonst druckte der Browser danach die andere Kartenart, und
// die schon als gedruckt vermerkten Codes kämen nie aufs Papier).

const OPTIONS = Object.freeze([
  { value: ART.visitenkarte, label: 'Visitenkarte', hint: 'Hinten euer Portal' },
  { value: ART.einladung, label: 'Einladungskarte', hint: 'Hinten Familie auf Pfoten mit Code' }
])

export default function KartenArtSwitch({ art, onChange, disabled = false }) {
  return (
    <div className="vk-art" role="group" aria-labelledby="vk-art-label">
      <span id="vk-art-label" className="vk-label">
        Kartenart
      </span>
      <div className="vk-art-options">
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className="vk-art-option"
            aria-pressed={art === option.value}
            onClick={() => onChange(option.value)}
            disabled={disabled}
          >
            <strong>{option.label}</strong>
            <span className="vk-art-hint">{option.hint}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
