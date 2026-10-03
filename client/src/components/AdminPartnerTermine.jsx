import { useEffect, useState } from 'react'
import { api } from '../api'
import ConfirmButton from './ConfirmButton.jsx'
import { formatDateLong } from '../lib/dates.js'
import { SERIE, formatUhrzeit, serieLabel } from '../lib/termine.js'

function describe(termin) {
  const first = formatDateLong(termin.datum)
  if (termin.serie === SERIE.keine) return `${first}, ${formatUhrzeit(termin.uhrzeit, termin.ende)}`
  return `${serieLabel(termin.serie, termin.datum)}, ${formatUhrzeit(termin.uhrzeit, termin.ende)} – ab ${first} bis ${formatDateLong(termin.serieBis)}`
}

// Termine eines Partners in der Admin-Partnerpflege (Phase V4a): alle, auch ausgeblendete und vergangene, mit Regel,
// Uhrzeit, Titel und Ort. Termine gehen ohne Freigabe online - "ausblenden" nimmt einen Termin sofort aus Portal und Karte
// (der Partner sieht ihn markiert), "Löschen" entfernt ihn samt Absagen. Beides steht im Admin-Protokoll.
export default function AdminPartnerTermine({ partnerId, id }) {
  const [items, setItems] = useState(undefined)
  const [error, setError] = useState(null)
  const [busyId, setBusyId] = useState(null)

  useEffect(() => {
    let cancelled = false
    api.admin
      .termine(partnerId)
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

  async function run(termin, request, apply) {
    setError(null)
    setBusyId(termin.id)
    try {
      const result = await request()
      setItems((current) => apply(current, result))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  const toggleHidden = (termin) =>
    run(
      termin,
      () => api.admin.setTerminAusgeblendet(termin.id, !termin.ausgeblendet),
      (current, updated) => current.map((item) => (item.id === termin.id ? { ...item, ...updated } : item))
    )
  const remove = (termin) =>
    run(
      termin,
      () => api.admin.deleteTermin(termin.id),
      (current) => current.filter((item) => item.id !== termin.id)
    )

  return (
    <div className="admin-partner-termine" id={id}>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {items === undefined && !error && <p className="muted">Lade …</p>}
      {items && items.length === 0 && <p className="muted">Noch keine Termine.</p>}
      {items && items.length > 0 && (
        <ul className="admin-termin-list">
          {items.map((termin) => (
            <li key={termin.id} className={`admin-termin${termin.ausgeblendet ? ' is-hidden' : ''}`}>
              <span className="admin-termin-body">
                <strong>{termin.titel}</strong>
                <span className="muted">{describe(termin)}</span>
                {termin.ort && <span className="muted">{termin.ort}</span>}
                {termin.abgelaufen && <span className="muted">vorbei</span>}
              </span>
              <label className="check admin-einblick-switch">
                <input
                  type="checkbox"
                  role="switch"
                  checked={Boolean(termin.ausgeblendet)}
                  disabled={busyId === termin.id}
                  onChange={() => toggleHidden(termin)}
                />
                ausblenden<span className="visually-hidden">: {termin.titel}</span>
              </label>
              <ConfirmButton onConfirm={() => remove(termin)} ariaLabel={`Termin „${termin.titel}“ löschen`} disabled={busyId === termin.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
