import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import PublicHeader from '../components/PublicHeader.jsx'
import LocationPicker from '../components/LocationPicker.jsx'
import PartnerCard from '../components/PartnerCard.jsx'
import PublicFooter from '../components/PublicFooter.jsx'
import Icon from '../components/Icon.jsx'
import { FallbackNote } from '../components/DiscoverChapter.jsx'
import { splitByDistance } from '../lib/discover.js'

const DEFAULT_RADIUS = 25
const PLZ_LENGTH = 5
const INCOMPLETE_PLZ_ERROR = 'Bitte eine 5-stellige Postleitzahl eingeben.'

// /partner – öffentliche Partnerliste. Ohne PLZ zeigt sie alle aktiven Partner, mit einer gültigen
// 5-stelligen PLZ die im Umkreis, nach Entfernung sortiert (der Server übernimmt Sortierung/Filter).
// Der Standort-Knopf bleibt für Gäste in dieser Phase aus (LocationPicker allowGeolocation=false,
// Standard) – er gehört erst zur In-App-Suche aus Task 6.
// Phase P2: liegen im Umkreis weniger als fünf, hängt der Server die nächsten weiteren an (ausserhalb: true) -
// sie stehen gesammelt unter "Weiter weg", mit dem Hinweis darüber (wie in "Entdecken").

function PartnerCards({ items }) {
  return (
    <ul className="partner-list">
      {items.map((partner) => (
        <li key={partner.id}>
          <PartnerCard partner={partner} />
        </li>
      ))}
    </ul>
  )
}

// family: die laufende Sitzung (App.jsx) oder null - nur für das Ziel von "Zurück" (PublicHeader).
export default function PartnersPage({ family = null }) {
  const [plz, setPlz] = useState('')
  const [radius, setRadius] = useState(DEFAULT_RADIUS)
  const [partners, setPartners] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // Phase V1: dezente Ortswahl - "Überall · Ort wählen", nach einer Suche "In der Nähe von 20095 · ändern".
  const [applied, setApplied] = useState(null)
  const { near, far } = splitByDistance(partners)

  async function search(nextPlz, nextRadius) {
    setLoading(true)
    setError(null)
    try {
      const complete = nextPlz.length === PLZ_LENGTH
      const result = await api.publicPartners(complete ? { plz: nextPlz, radius: nextRadius } : {})
      setPartners(Array.isArray(result) ? result.filter((item) => item && typeof item === 'object') : [])
      setApplied({ plz: complete ? nextPlz : null, radius: nextRadius })
    } catch (err) {
      setError(err.message)
      setPartners([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    search('', radius)
    // Nur beim ersten Laden – die Suche danach löst ausschließlich das Formular aus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleSubmit(event) {
    event.preventDefault()
    // Eine angefangene, aber unvollständige PLZ (1-4 Ziffern) soll nicht stillschweigend als "keine PLZ"
    // gelten und alle Partner zeigen - ein Hinweis statt einer überraschenden Volltreffer-Liste (Finding 10).
    if (plz.length > 0 && plz.length < PLZ_LENGTH) {
      setError(INCOMPLETE_PLZ_ERROR)
      setPartners([])
      return false
    }
    search(plz, radius)
    return true
  }

  return (
    <div className="public-page partners-page">
      <PublicHeader family={family} />
      <div className="partners-hero">
        <span className="eyebrow">Partner</span>
        <h1>Unsere Partner</h1>
        <p className="page-lede">Tierheime, Vermittlungsstellen und Hundeschulen, die mit uns zusammenarbeiten.</p>
      </div>

      <LocationPicker
        plz={plz}
        radius={radius}
        onPlzChange={setPlz}
        onRadiusChange={setRadius}
        onSubmit={handleSubmit}
        collapsible
        applied={applied}
        allowEverywhere
      />

      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <p className="muted" aria-busy="true">
          Lädt …
        </p>
      ) : partners.length === 0 ? (
        <div className="empty-state card">
          <Icon name="mapPin" />
          <h3>Keine Partner gefunden</h3>
          <p className="muted">Versucht es mit einer anderen Postleitzahl oder einem größeren Umkreis.</p>
        </div>
      ) : (
        <>
          {far.length > 0 && <FallbackNote />}
          {near.length > 0 && <PartnerCards items={near} />}
          {far.length > 0 && (
            <div className="discover-far partners-far">
              {/* h2 statt DiscoverSubheading (h3): hier gibt es keine Kapitel-Überschrift darüber. */}
              <h2 className="discover-subheading">Weiter weg</h2>
              <PartnerCards items={far} />
            </div>
          )}
        </>
      )}

      {/* Phase 5 Task 4: Weg zur Infoseite für künftige Partner (PartnerInfoPage, /partner-werden). */}
      <aside className="partners-cta card" aria-labelledby="partners-cta-title">
        <div>
          <h2 id="partners-cta-title">Ihr seid Hundeschule, Tierheim, Hundesalon oder Betreuung?</h2>
          <p className="muted">Ein eigenes Profil bei uns ist kostenlos – mit Portal, Einblicken und Kunden-Gutscheinen.</p>
        </div>
        <Link to="/partner-werden" className="btn btn-primary">
          Partner werden <Icon name="arrowRight" />
        </Link>
      </aside>

      <PublicFooter />
    </div>
  )
}
