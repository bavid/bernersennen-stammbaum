import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { api } from '../../api'
import Polaroid from '../Polaroid.jsx'
import { dogLabel } from '../../lib/timeline.js'
import { formatDateLong, todayIso } from '../../lib/dates.js'
import { entryLink, feedDog } from '../../lib/feed.js'
import { yearsAgoLabel } from '../../lib/seasons.js'

// Lädt die Erinnerungen vom heutigen Tag früherer Jahre (GET /api/timeline/jahrestag) - [] ohne welche oder bei einem
// Fehler: die Karte ist ein schöner Zusatz, kein Grund für eine Fehlermeldung.
function useOnThisDay(today, enabled) {
  const [entries, setEntries] = useState([])
  useEffect(() => {
    if (!enabled) return undefined
    let cancelled = false
    Promise.resolve()
      .then(() => api.onThisDay(today))
      .then((list) => {
        if (!cancelled) setEntries(Array.isArray(list) ? list : [])
      })
      .catch(() => {
        if (!cancelled) setEntries([])
      })
    return () => {
      cancelled = true
    }
  }, [today, enabled])
  return enabled ? entries : []
}

// „Heute vor einem Jahr“ auf Start (B+ Familienalbum): die schönste Erinnerung vom selben Tag eines früheren Jahres (mit
// Foto zuerst, der Server sortiert) als Polaroid mit Titel in Handschrift und „Wieder ansehen“. Ohne solche Erinnerung
// steht hier nichts. enabled false (zu Besuch - die Karte gehört ins eigene Zuhause): keine Anfrage.
export default function OnThisDayCard({ today = todayIso(), enabled = true }) {
  const { pathname, search } = useLocation()
  const [entry] = useOnThisDay(today, enabled)
  const label = entry ? yearsAgoLabel(entry.datum, today) : null
  if (!entry || !label) return null
  const photo = entry.foto_urls?.[0] || entry.dog_foto_url
  return (
    <section className="card on-this-day" aria-labelledby="on-this-day-title">
      {photo && <Polaroid src={photo} index={0} width={96} height={86} className="on-this-day-photo" />}
      <div className="on-this-day-body">
        <h2 id="on-this-day-title" className="on-this-day-label">
          {label}
        </h2>
        <p className="on-this-day-title hand">{entry.titel}</p>
        <p className="on-this-day-meta">
          {dogLabel(feedDog(entry))} · {formatDateLong(entry.datum)}
        </p>
        <Link to={entryLink(entry)} state={{ from: pathname + search }} className="start-card-link">
          Wieder ansehen
        </Link>
      </div>
    </section>
  )
}
