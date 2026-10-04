import { useEffect, useState } from 'react'
import { api } from '../api'
import ConfirmButton from './ConfirmButton.jsx'
import { isUploadUrl } from '../lib/einblicke.js'

const THUMB_WIDTH = 64
const THUMB_HEIGHT = 48

// Bannerfotos eines Partners in der Admin-Partnerpflege (Audit V7a, Panel "Fotos" über den Einblicken): Vorschaubild,
// Position und Alternativtext. "Entfernen" (mit Rückfrage) löscht ein einzelnes Foto sofort von Portal und Visitenkarte -
// bisher ging das nur, indem der Admin den ganzen Partner pausierte. Steht im Admin-Protokoll.
export default function AdminPartnerBanner({ partnerId }) {
  const [banner, setBanner] = useState(undefined)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    api.admin
      .partnerBanner(partnerId)
      .then((data) => {
        if (!cancelled) setBanner(Array.isArray(data?.banner) ? data.banner : [])
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [partnerId])

  // Mit dem gesehenen Foto: hat der Partner es inzwischen ersetzt (409), kommt die aktuelle Liste und die Meldung.
  async function remove(foto) {
    setError(null)
    setBusy(true)
    try {
      const data = await api.admin.deletePartnerBanner(partnerId, foto.position, foto.fotoUrl)
      setBanner(Array.isArray(data?.banner) ? data.banner : [])
    } catch (err) {
      setError(err.message)
      if (err.status === 409) {
        const data = await api.admin.partnerBanner(partnerId).catch(() => null)
        if (Array.isArray(data?.banner)) setBanner(data.banner)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="admin-partner-banner" aria-label="Bannerfotos">
      <h4 className="admin-partner-photos-title">Bannerfotos</h4>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {banner === undefined && !error && <p className="muted">Lade …</p>}
      {banner && banner.length === 0 && <p className="muted">Keine Bannerfotos.</p>}
      {banner && banner.length > 0 && (
        <ul className="admin-einblick-list">
          {banner.map((foto) => (
            <li key={foto.position} className="admin-banner-foto">
              {isUploadUrl(foto.fotoUrl) ? (
                <img src={foto.fotoUrl} alt="" className="admin-einblick-thumb" width={THUMB_WIDTH} height={THUMB_HEIGHT} loading="lazy" />
              ) : (
                <span className="admin-einblick-thumb" aria-hidden="true" />
              )}
              <span className="admin-einblick-body">
                <span className="admin-partner-banner-position">Foto {foto.position}</span>
                <span className="admin-einblick-text">{foto.alt || <span className="muted">ohne Beschreibung</span>}</span>
              </span>
              <ConfirmButton
                onConfirm={() => remove(foto)}
                label="Entfernen"
                confirmLabel="Wirklich entfernen?"
                ariaLabel={`Bannerfoto ${foto.position} entfernen`}
                disabled={busy}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
