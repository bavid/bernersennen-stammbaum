import { useEffect, useState } from 'react'
import { api } from '../../api'
import Icon from '../Icon.jsx'
import { GESUNDHEIT, artLabel, infoZeile } from '../../lib/gesundheit.js'
import { t } from '../../lib/i18n/index.js'
import '../../styles/gesundheit.css'

// { letzte } von GET /api/gesundheit - undefined: lädt noch, null: Fehler.
function useGesundheit(dogId) {
  const [letzte, setLetzte] = useState(undefined)
  useEffect(() => {
    let cancelled = false
    setLetzte(undefined)
    Promise.resolve()
      .then(() => api.gesundheit(dogId))
      .then((data) => !cancelled && setLetzte(Array.isArray(data?.letzte) ? data.letzte : []))
      .catch(() => !cancelled && setLetzte(null))
    return () => {
      cancelled = true
    }
  }, [dogId])
  return letzte
}

// Block „Gesundheit“ im Reiter „Infos“ eines eigenen Tiers (DogInfos): je Art die letzte Erinnerung und - falls angegeben
// - „nächstes Mal am“. Keine Diagramme, keine Akte; ohne Einträge ein Satz, wie man es festhält.
export default function GesundheitInfos({ dog }) {
  const letzte = useGesundheit(dog.id)
  if (letzte === undefined) return null
  return (
    <section className="gesundheit-infos" aria-labelledby="gesundheit-infos-title">
      <h2 id="gesundheit-infos-title" className="gesundheit-infos-title">
        <Icon name="heart" />
        {t(GESUNDHEIT.titel)}
      </h2>
      {letzte === null && <p className="muted">{t(GESUNDHEIT.fehler)}</p>}
      {letzte?.length === 0 && <p className="muted">{t(GESUNDHEIT.leer)}</p>}
      {letzte?.length > 0 && (
        <ul className="gesundheit-liste" role="list">
          {letzte.map((item) => (
            <li key={item.art}>
              <span className="gesundheit-art-name">{artLabel(item.art)}</span>
              <span className="gesundheit-zeile">{infoZeile(item)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
