import { t } from '../lib/i18n/index.js'
import { BANNER_LAYOUTS } from '../lib/partnerBanner.js'

// Wahl des Banner-Layouts im Profil (PartnerBannerEditor, Feedback-Runde): vier kleine Kacheln mit einer Skizze, wie die
// Fotos im Kopf des Portals stehen - echte Radio-Knöpfe (Pfeiltasten wechseln, der Name kommt aus der Beschriftung),
// visuell nur die Kachel. value: die gewählte Layout-Id, onChange(id). busy: solange gespeichert wird - die Knöpfe bleiben
// bedienbar (sonst verlöre die Tastatur den Fokus), ein Wechsel in dieser Zeit wird nur nicht übernommen.
export default function BannerLayoutPicker({ value, onChange, busy = false }) {
  return (
    <fieldset className="banner-layout-picker" aria-busy={busy || undefined}>
      <legend className="field-label">Layout</legend>
      <div className="banner-layout-options">
        {BANNER_LAYOUTS.map((layout) => (
          <label key={layout.id} className={`banner-layout-option${value === layout.id ? ' is-checked' : ''}`}>
            <input
              type="radio"
              name="partner-banner-layout"
              value={layout.id}
              checked={value === layout.id}
              onChange={() => {
                if (!busy) onChange(layout.id)
              }}
              className="banner-layout-input"
            />
            <span className={`banner-layout-sketch is-${layout.id}`} aria-hidden="true">
              {Array.from({ length: layout.slots }, (_, index) => (
                <span key={index} />
              ))}
            </span>
            <span className="banner-layout-label">{t(layout.label)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
