import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { api } from '../api'
import Icon from '../components/Icon.jsx'
import ThemeMark from '../components/ThemeMark.jsx'
import { STATUS_LABELS } from '../lib/adminPartnerForm.js'
import { PRESENT_PORTAL_TILES, PRESENT_TILES, demoStartUrl, portalPreviewUrl, portalTileUrl } from '../lib/present.js'
import { Button } from '../components/ui/index.js'

// Präsentationsmodus (Phase 5 Task 5): /admin/praesentation, als eigener Chunk aus App.jsx - eine ruhige Seite
// in großer Schrift ohne die Admin-Karten, für Vorführungen am Laptop oder Tablet. Nur mit Admin-Sitzung, sonst
// zurück zu /admin (dort steht der Login). Jede Kachel ist ein echter Link (Tastatur, Fokus) und öffnet in einem
// NEUEN Tab: die Demo-Kacheln /demo-start?… (DemoStartPage) - die Demo ersetzt dort das Sitzungs-Cookie des
// Browsers, dieser Tab bleibt beim Admin (das Admin-Cookie ist ein anderes) -, die Kacheln "Öffentliche Portale"
// direkt /p/<slug>?demo=1 eines Demo-Partners, ohne Anmeldung. Die Portal-Vorschau öffnet /p/<slug> ebenso in
// einem neuen Tab - mit dem Admin-Cookie zeigt der Server auch Entwürfe (lib/present.js portalPreviewUrl).

const NEW_TAB = { target: '_blank', rel: 'noopener noreferrer' }

function PresentTile({ tile, href }) {
  return (
    <li>
      <a className="present-tile" href={href} {...NEW_TAB} data-key={tile.key}>
        <Icon name={tile.icon} />
        <span className="present-tile-title">{tile.label}</span>
        <span className="present-tile-sub">{tile.description}</span>
        <span className="present-tile-hint muted">
          Öffnet in neuem Tab <Icon name="external" />
        </span>
      </a>
    </li>
  )
}

function TileSection({ id, title, tiles, hrefOf }) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="present-section-title">
        {title}
      </h2>
      <ul className="present-tiles">
        {tiles.map((tile) => (
          <PresentTile key={tile.key} tile={tile} href={hrefOf(tile)} />
        ))}
      </ul>
    </section>
  )
}

function partnerOptionLabel(partner) {
  const status = partner.gesperrt ? 'Gesperrt' : STATUS_LABELS[partner.status] || partner.status
  return `${partner.name} · ${status}${partner.is_demo ? ' · Demo' : ''}`
}

function PortalPreview({ partners, error }) {
  const [slug, setSlug] = useState('')
  const selected = partners.find((partner) => partner.slug === slug) || partners[0] || null
  const href = portalPreviewUrl(selected)

  return (
    <section className="present-portal card" aria-labelledby="present-portal-title">
      <div>
        <h2 id="present-portal-title">Portal-Vorschau</h2>
        <p className="muted">
          Jedes Partnerportal, auch als Entwurf oder pausiert – die Vorschau läuft über eure Admin-Sitzung und öffnet in einem neuen Tab.
        </p>
      </div>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {!error && partners.length === 0 && <p className="muted">Noch keine Partner angelegt.</p>}
      {partners.length > 0 && (
        <div className="present-portal-row">
          <div className="field">
            <label className="field-label" htmlFor="present-partner">
              Partner
            </label>
            <select id="present-partner" value={selected?.slug || ''} onChange={(event) => setSlug(event.target.value)}>
              {partners.map((partner) => (
                <option key={partner.id} value={partner.slug}>
                  {partnerOptionLabel(partner)}
                </option>
              ))}
            </select>
          </div>
          <a className="btn btn-primary btn-lg present-portal-open" href={href} {...NEW_TAB}>
            Portal öffnen <Icon name="external" />
          </a>
        </div>
      )}
    </section>
  )
}

export default function AdminPresentPage() {
  const [admin, setAdmin] = useState(undefined)
  const [partners, setPartners] = useState([])
  const [partnersError, setPartnersError] = useState(null)

  useEffect(() => {
    api.admin
      .me()
      .then(setAdmin)
      .catch(() => setAdmin(null))
  }, [])

  useEffect(() => {
    if (!admin) return undefined
    let cancelled = false
    api.admin
      .partners()
      .then((rows) => {
        if (!cancelled) setPartners(Array.isArray(rows) ? rows : [])
      })
      .catch((err) => {
        if (!cancelled) setPartnersError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [admin])

  if (admin === undefined) return <div className="splash" aria-busy="true" />
  if (!admin) return <Navigate to="/admin" replace />

  return (
    <div className="present-page">
      <header className="present-head">
        <ThemeMark size={56} />
        <span className="eyebrow">Präsentationsmodus</span>
        <h1>Familie auf Pfoten zeigen</h1>
        <p className="present-lede">
          Jede Kachel öffnet eine schreibgeschützte Demo in einem neuen Tab – dieser Tab bleibt stehen, ihr kommt jederzeit
          zurück.
        </p>
        <Button to="/vorstellung" as={Link} className="present-tour">
          <Icon name="play" /> Präsentation zum Durchklicken
        </Button>
        <Button to="/netzwerk" as={Link} variant="ghost" className="present-tour">
          <Icon name="users" /> Netzwerk der Partner (Entwurf)
        </Button>
        <Button to="/admin" as={Link} variant="ghost" className="present-back">
          <Icon name="arrowLeft" /> Zurück zum Admin
        </Button>
      </header>

      <TileSection id="present-tiles-title" title="Demo ansehen" tiles={PRESENT_TILES} hrefOf={demoStartUrl} />
      <TileSection id="present-portals-title" title="Öffentliche Portale" tiles={PRESENT_PORTAL_TILES} hrefOf={portalTileUrl} />

      <PortalPreview partners={partners} error={partnersError} />
    </div>
  )
}
