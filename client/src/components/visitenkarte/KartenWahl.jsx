import { KARTEN } from '../../lib/kartenWahl.js'

// Feedback-Runde: welche Karte (PartnerVisitenkartenPage) - drei Kacheln statt einer "Kartenart": vorne immer eure
// Kontakte, hinten euer Portal, ein Einladungscode oder beides (Kombi). Jede Kachel zeigt Vorder- und Rückseite als kleine
// Skizze. Echte Radio-Knöpfe (Pfeiltasten wechseln, der Name kommt aus der Beschriftung), zu sehen ist die Kachel.
// disabled: solange ein Druck seine Codes holt (sonst druckte der Browser danach eine andere Kombination, und die schon
// als gedruckt vermerkten Codes kämen nie aufs Papier).

function Skizze({ id }) {
  const qrCount = id === 'kombi' ? 2 : 1
  return (
    <span className="vk-wahl-skizze" aria-hidden="true">
      <span className="vk-wahl-seite is-vorne">
        <i />
        <i />
        <i />
      </span>
      <span className={`vk-wahl-seite is-hinten is-${id}`}>
        {Array.from({ length: qrCount }, (_, index) => (
          <b key={index} />
        ))}
        <i />
      </span>
    </span>
  )
}

export default function KartenWahl({ karte, onChange, disabled = false }) {
  return (
    <fieldset className="vk-wahl">
      <legend className="vk-label">Welche Karte?</legend>
      <div className="vk-wahl-options">
        {KARTEN.map((option) => (
          <label key={option.id} className={`vk-wahl-option${karte === option.id ? ' is-checked' : ''}${disabled ? ' is-disabled' : ''}`}>
            <input
              type="radio"
              name="vk-karte"
              value={option.id}
              checked={karte === option.id}
              disabled={disabled}
              onChange={() => onChange(option.id)}
              className="vk-wahl-input"
            />
            <Skizze id={option.id} />
            <span className="vk-wahl-text">
              <strong>{option.label}</strong>
              <span className="vk-wahl-hint">
                vorne {option.vorne} · hinten {option.hinten}
              </span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
