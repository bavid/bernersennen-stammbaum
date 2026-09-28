import { useEffect, useState } from 'react'
import { api } from '../api'
import ThemeMark from '../components/ThemeMark.jsx'
import LocationPicker from '../components/LocationPicker.jsx'
import PartnerCard from '../components/PartnerCard.jsx'
import PublicFooter from '../components/PublicFooter.jsx'
import Icon from '../components/Icon.jsx'

const DEFAULT_RADIUS = 25
const PLZ_LENGTH = 5

// /partner – öffentliche Partnerliste. Ohne PLZ zeigt sie alle aktiven Partner, mit einer gültigen
// 5-stelligen PLZ die im Umkreis, nach Entfernung sortiert (der Server übernimmt Sortierung/Filter).
// Der Standort-Knopf bleibt für Gäste in dieser Phase aus (LocationPicker allowGeolocation=false,
// Standard) – er gehört erst zur In-App-Suche aus Task 6.
export default function PartnersPage() {
  const [plz, setPlz] = useState('')
  const [radius, setRadius] = useState(DEFAULT_RADIUS)
  const [partners, setPartners] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  async function search(nextPlz, nextRadius) {
    setLoading(true)
    setError(null)
    try {
      const complete = nextPlz.length === PLZ_LENGTH
      const result = await api.publicPartners(complete ? { plz: nextPlz, radius: nextRadius } : {})
      setPartners(result)
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
    search(plz, radius)
  }

  return (
    <div className="public-page partners-page">
      <header className="partners-hero">
        <ThemeMark size={56} />
        <span className="eyebrow">Partner</span>
        <h1>Unsere Partner</h1>
        <p className="page-lede">Tierheime, Vermittlungsstellen und Hundeschulen, die mit uns zusammenarbeiten.</p>
      </header>

      <LocationPicker plz={plz} radius={radius} onPlzChange={setPlz} onRadiusChange={setRadius} onSubmit={handleSubmit} />

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
        <ul className="partner-list">
          {partners.map((partner) => (
            <li key={partner.id}>
              <PartnerCard partner={partner} />
            </li>
          ))}
        </ul>
      )}

      <PublicFooter />
    </div>
  )
}
