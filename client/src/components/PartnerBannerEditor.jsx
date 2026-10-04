import { useState } from 'react'
import { api } from '../api'
import { useIsDemo, useReadOnlyHint } from '../lib/demo.js'
import { downscaleImage } from '../lib/images.js'
import { BANNER_ACCEPT, BANNER_LAYOUTS, BANNER_TYPE_MESSAGE, bannerFormData, editorSlots, isBannerFileType, layoutOf, ownBannerItems } from '../lib/partnerBanner.js'
import BannerLayoutPicker from './BannerLayoutPicker.jsx'
import Icon from './Icon.jsx'
import PartnerBannerSlot from './PartnerBannerSlot.jsx'

const TITLE_ID = 'partner-banner-title'
const HINT_ID = 'partner-banner-hint'

function layoutLabel(id) {
  return BANNER_LAYOUTS.find((layout) => layout.id === id)?.label ?? ''
}

// Der freie Platz im Layout: "Foto hinzufügen" lädt sofort hoch (an die nächste freie Stelle - Fotos rücken lückenlos).
function AddSlot({ label, busy, locked, onFile }) {
  return (
    <li className="partner-banner-slot is-empty">
      <span className="partner-banner-thumb partner-banner-placeholder" aria-hidden="true">
        <Icon name="camera" />
      </span>
      <div className="partner-banner-slot-body">
        <span className="partner-banner-slot-label">{label}</span>
        <label className={`btn btn-ghost btn-compact admin-upload-btn${locked ? ' is-disabled' : ''}`}>
          <Icon name={busy ? 'clock' : 'plus'} />
          {busy ? 'Lädt …' : 'Foto hinzufügen'}
          <input
            type="file"
            accept={BANNER_ACCEPT}
            onChange={onFile}
            disabled={locked}
            className="admin-upload-input"
            aria-label={`${label} hinzufügen`}
            aria-describedby={HINT_ID}
          />
        </label>
      </div>
    </li>
  )
}

// Reiter "Angaben" auf /profil (Phase V4b, Feedback-Runde): erst das Layout (BannerLayoutPicker - ein Foto, halb/halb,
// groß links oder drei), darunter je Platz des Layouts das Foto (PartnerBannerSlot: ersetzen, beschreiben, entfernen)
// bzw. der nächste freie Platz zum Hinzufügen. Fotos, die das gewählte Layout nicht zeigt, stehen darunter - sie bleiben
// gespeichert, bis man sie entfernt. banner/layout: aus GET /partner-area/profile (banner, bannerLayout);
// onChange({ banner, layout }) nach jeder Änderung. Demo und Admin-Ansicht: das Layout lässt sich ansehen und
// umschalten (ohne Speichern), alles andere ist gesperrt.
export default function PartnerBannerEditor({ banner, layout, onChange }) {
  const isDemo = useIsDemo()
  const readOnlyHint = useReadOnlyHint()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [demoLayout, setDemoLayout] = useState(null)
  const items = ownBannerItems(banner)
  const current = layoutOf(isDemo && demoLayout ? demoLayout : layout, items.length)
  const { slots, extra } = editorSlots(current, items)
  const locked = isDemo || busy

  async function run(action) {
    setBusy(true)
    setError(null)
    try {
      onChange(await action())
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  function handleLayout(next) {
    if (isDemo) {
      setDemoLayout(next)
      return
    }
    run(() => api.partnerArea.setBannerLayout(next))
  }

  async function handleAdd(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!isBannerFileType(file)) {
      setError(BANNER_TYPE_MESSAGE)
      return
    }
    run(async () => api.partnerArea.addBanner(bannerFormData(await downscaleImage(file))))
  }

  return (
    <section className="partner-banner-editor" aria-labelledby={TITLE_ID}>
      <div className="partner-banner-head">
        <h2 id={TITLE_ID}>Bannerfotos</h2>
        <p className="field-hint" id={HINT_ID}>
          Fotos für den Kopf eures Portals – breite Querformate wirken am besten. JPG oder PNG.
        </p>
      </div>
      <BannerLayoutPicker value={current} onChange={handleLayout} disabled={busy} />
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <ul className="partner-banner-list">
        {slots.map((slot) =>
          slot.item ? (
            <PartnerBannerSlot key={`${slot.position}-${slot.item.fotoUrl}`} item={slot.item} label={slot.label} onChange={onChange} />
          ) : (
            <AddSlot key={`frei-${slot.position}`} label={slot.label} busy={busy} locked={locked} onFile={handleAdd} />
          )
        )}
      </ul>
      {extra.length > 0 && (
        <div className="partner-banner-extra">
          <p className="field-hint">Nicht im Banner – das Layout „{layoutLabel(current)}“ zeigt weniger Fotos:</p>
          <ul className="partner-banner-list">
            {extra.map((slot) => (
              <PartnerBannerSlot key={`${slot.position}-${slot.item.fotoUrl}`} item={slot.item} label={slot.label} onChange={onChange} />
            ))}
          </ul>
        </div>
      )}
      {isDemo && <p className="field-hint">{readOnlyHint}</p>}
    </section>
  )
}
