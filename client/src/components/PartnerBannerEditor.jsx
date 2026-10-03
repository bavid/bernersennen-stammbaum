import { useState } from 'react'
import { api } from '../api'
import { useIsDemo, useReadOnlyHint } from '../lib/demo.js'
import { downscaleImage } from '../lib/images.js'
import { BANNER_ACCEPT, BANNER_TYPE_MESSAGE, MAX_BANNER, bannerFormData, isBannerFileType, ownBannerItems } from '../lib/partnerBanner.js'
import Icon from './Icon.jsx'
import PartnerBannerSlot from './PartnerBannerSlot.jsx'

const TITLE_ID = 'partner-banner-title'
const HINT_ID = 'partner-banner-hint'

// Reiter "Angaben" auf /profil (Phase V4b): ein oder zwei Bannerfotos für den Kopf des Portals. Hinzufügen lädt sofort
// hoch (wie das Logo), jedes Foto lässt sich ersetzen, beschreiben und entfernen (PartnerBannerSlot). banner: die Liste
// aus GET /partner-area/profile, onChange(neueListe) nach jeder Änderung. Demo und Admin-Ansicht: sichtbar, gesperrt.
export default function PartnerBannerEditor({ banner, onChange }) {
  const isDemo = useIsDemo()
  const readOnlyHint = useReadOnlyHint()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const items = ownBannerItems(banner)
  const isFull = items.length >= MAX_BANNER
  const locked = isDemo || busy

  async function handleAdd(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!isBannerFileType(file)) {
      setError(BANNER_TYPE_MESSAGE)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = await api.partnerArea.addBanner(bannerFormData(await downscaleImage(file)))
      onChange(result.banner)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="partner-banner-editor" aria-labelledby={TITLE_ID}>
      <div className="partner-banner-head">
        <h2 id={TITLE_ID}>Bannerfotos</h2>
        <p className="field-hint" id={HINT_ID}>
          Ein oder zwei Fotos für den Kopf eures Portals – breite Querformate wirken am besten. JPG oder PNG.
        </p>
      </div>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {items.length > 0 && (
        <ul className="partner-banner-list">
          {items.map((item) => (
            <PartnerBannerSlot key={`${item.position}-${item.fotoUrl}`} item={item} onChange={onChange} />
          ))}
        </ul>
      )}
      {!isFull && (
        <label className={`btn btn-ghost admin-upload-btn${locked ? ' is-disabled' : ''}`}>
          <Icon name={busy ? 'clock' : 'plus'} />
          {busy ? 'Lädt …' : items.length ? 'Zweites Bannerfoto hinzufügen' : 'Bannerfoto hinzufügen'}
          <input
            type="file"
            accept={BANNER_ACCEPT}
            onChange={handleAdd}
            disabled={locked}
            className="admin-upload-input"
            aria-describedby={HINT_ID}
          />
        </label>
      )}
      {isDemo && <p className="field-hint">{readOnlyHint}</p>}
    </section>
  )
}
