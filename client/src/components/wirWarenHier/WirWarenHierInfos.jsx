import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api'
import Icon from '../Icon.jsx'
import { WWH, checkinStatusText, ortLink, wishCountText } from '../../lib/wirWarenHierText.js'
import { t } from '../../lib/i18n/index.js'

function listOf(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') : []
}

// Anmeldungen des Zuhauses und Kontaktwünsche an uns - fällt etwas aus (z. B. ältere Server), bleibt der Block leer.
function useOrte(dogId) {
  const [state, setState] = useState({ orte: undefined, wishes: [] })
  useEffect(() => {
    let cancelled = false
    Promise.all([
      Promise.resolve().then(() => api.wwhCheckins()),
      Promise.resolve()
        .then(() => api.wwhKontaktOffen())
        .catch(() => null)
    ])
      .then(([checkins, open]) => {
        if (cancelled) return
        setState({ orte: listOf(checkins).filter((checkin) => checkin.dogId === dogId), wishes: listOf(open?.an) })
      })
      .catch(() => !cancelled && setState({ orte: null, wishes: [] }))
    return () => {
      cancelled = true
    }
  }, [dogId])
  return state
}

function Ort({ ort, waiting }) {
  return (
    <li className="wwh-ort">
      {ort.partnerSlug ? (
        <Link className="wwh-ort-name" to={ortLink(ort.partnerSlug)}>
          {ort.partnerName}
        </Link>
      ) : (
        <span className="wwh-ort-name">{ort.partnerName}</span>
      )}
      <span className="wwh-ort-meta">
        {checkinStatusText(ort.status, ort.partnerName)}
        {ort.zeigeMich && ort.status === 'bestaetigt' && <span className="pill">{t(WWH.hierGezeigt)}</span>}
        {waiting > 0 && <span className="pill pill-rust">{wishCountText(waiting)}</span>}
      </span>
    </li>
  )
}

// Block „Orte, an denen wir waren“ im Reiter „Infos“ eines eigenen Tiers (DogInfos): wo es angemeldet ist, der Stand
// und ein Weg zum Reiter „Wir waren hier“ des Ortes. Wartende Kontaktwünsche nur als Zahl - beantwortet werden sie dort.
export default function WirWarenHierInfos({ dog }) {
  const { orte, wishes } = useOrte(dog.id)
  if (orte === undefined) return null
  return (
    <section className="wwh-infos" aria-labelledby="wwh-infos-title">
      <h2 id="wwh-infos-title" className="wwh-infos-title">
        <Icon name="mapPin" />
        {t(WWH.orte)}
      </h2>
      {orte === null && <p className="muted">{t(WWH.orteFehler)}</p>}
      {orte?.length === 0 && (
        <p className="wwh-note muted">
          {t(WWH.orteLeer)}{' '}
          <Link to="/partner">{t(WWH.partnerAnsehen)}</Link>
        </p>
      )}
      {orte?.length > 0 && (
        <ul className="wwh-orte" role="list">
          {orte.map((ort) => (
            <Ort
              key={ort.id}
              ort={ort}
              waiting={wishes.filter((wish) => wish.checkinId === ort.id).length}
            />
          ))}
        </ul>
      )}
    </section>
  )
}
