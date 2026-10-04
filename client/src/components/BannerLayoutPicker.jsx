import { BANNER_LAYOUTS } from '../lib/partnerBanner.js'

// Wahl des Banner-Layouts im Profil (PartnerBannerEditor, Feedback-Runde): vier kleine Kacheln mit einer Skizze, wie die
// Fotos im Kopf des Portals stehen - echte Radio-Knöpfe (Pfeiltasten wechseln, der Name kommt aus der Beschriftung),
// visuell nur die Kachel. value: die gewählte Layout-Id, onChange(id). disabled: solange gespeichert wird.
export default function BannerLayoutPicker({ value, onChange, disabled = false }) {
  return (
    <fieldset className="banner-layout-picker">
      <legend className="field-label">Layout</legend>
      <div className="banner-layout-options">
        {BANNER_LAYOUTS.map((layout) => (
          <label key={layout.id} className={`banner-layout-option${value === layout.id ? ' is-checked' : ''}${disabled ? ' is-disabled' : ''}`}>
            <input
              type="radio"
              name="partner-banner-layout"
              value={layout.id}
              checked={value === layout.id}
              disabled={disabled}
              onChange={() => onChange(layout.id)}
              className="banner-layout-input"
            />
            <span className={`banner-layout-sketch is-${layout.id}`} aria-hidden="true">
              {Array.from({ length: layout.slots }, (_, index) => (
                <span key={index} />
              ))}
            </span>
            <span className="banner-layout-label">{layout.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
