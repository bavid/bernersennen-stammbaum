import { useEffect, useState } from 'react'
import { api } from '../api'
import { formatDateLong } from '../lib/dates.js'
import { isUploadUrl } from '../lib/einblicke.js'

const THUMB_WIDTH = 64
const THUMB_HEIGHT = 48

// Einblicke eines Partners in der Admin-Partnerpflege (Phase P1): alle, auch ausgeblendete, mit
// Vorschaubild, Datum und Text. Der Schalter "ausblenden" nimmt einen Einblick sofort aus Portal, Teaser
// und /public-media (POST /api/admin/einblicke/:id/ausblenden) - der Partner sieht ihn weiter, markiert.
// Phase V1: "anpinnen" setzt einen Team-Pin für die Partner-Karte in "Entdecken" (steht vor den Pins des Partners,
// höchstens drei); aus löst jeden Pin, auch den des Partners. Ausgeblendete lassen sich nicht anpinnen (Ausblenden löst
// einen Pin, server/lib/einblicke.js setAusgeblendet).
export default function AdminPartnerEinblicke({ partnerId, id }) {
  const [items, setItems] = useState(undefined)
  const [error, setError] = useState(null)
  const [busyId, setBusyId] = useState(null)

  useEffect(() => {
    let cancelled = false
    api.admin
      .einblicke(partnerId)
      .then((data) => {
        if (!cancelled) setItems(Array.isArray(data) ? data : [])
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [partnerId])

  async function handleToggle(einblick, request = () => api.admin.setEinblickAusgeblendet(einblick.id, !einblick.ausgeblendet)) {
    setError(null)
    setBusyId(einblick.id)
    try {
      const updated = await request()
      setItems((current) => current.map((item) => (item.id === einblick.id ? { ...item, ...updated } : item)))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="admin-partner-einblicke" id={id}>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {items === undefined && !error && <p className="muted">Lade …</p>}
      {items && items.length === 0 && <p className="muted">Noch keine Einblicke.</p>}
      {items && items.length > 0 && (
        <ul className="admin-einblick-list">
          {items.map((einblick) => (
            <li key={einblick.id} className={`admin-einblick${einblick.ausgeblendet ? ' is-hidden' : ''}`}>
              {isUploadUrl(einblick.fotoUrl) ? (
                <img src={einblick.fotoUrl} alt="" className="admin-einblick-thumb" width={THUMB_WIDTH} height={THUMB_HEIGHT} loading="lazy" />
              ) : (
                <span className="admin-einblick-thumb" aria-hidden="true" />
              )}
              <span className="admin-einblick-body">
                <time dateTime={einblick.datum}>{formatDateLong(einblick.datum)}</time>
                {einblick.text && <span className="admin-einblick-text">{einblick.text}</span>}
              </span>
              <label className="check admin-einblick-switch">
                <input
                  type="checkbox"
                  role="switch"
                  checked={Boolean(einblick.ausgeblendet)}
                  disabled={busyId === einblick.id}
                  onChange={() => handleToggle(einblick)}
                />
                ausblenden<span className="visually-hidden">: Einblick vom {formatDateLong(einblick.datum)}</span>
              </label>
              <label className="check admin-einblick-switch admin-einblick-pin">
                <input
                  type="checkbox"
                  role="switch"
                  checked={einblick.angepinntVon === 'admin'}
                  disabled={busyId === einblick.id || einblick.ausgeblendet}
                  onChange={(event) => handleToggle(einblick, () => api.admin.setEinblickAngepinnt(einblick.id, event.target.checked))}
                />
                anpinnen<span className="visually-hidden">: Einblick vom {formatDateLong(einblick.datum)}</span>
                {einblick.angepinntVon === 'partner' && <span className="admin-einblick-pin-note">vom Partner angepinnt</span>}
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
