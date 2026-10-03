import { useState } from 'react'
import AdminFamilyDetails from './AdminFamilyDetails.jsx'
import Icon from './Icon.jsx'
import { relativeTime } from '../lib/dates.js'
import { parseHerkunft } from '../lib/herkunft.js'
import { plural } from '../lib/adminStats.js'

// Herkunft eines Bereichs als Chip (Phase 5 Task 3, lib/herkunft.js): „über Partner …“, „weitergegeben von …“,
// „Stapel …“, „Altbestand“ - ohne herkunft der Freitext quelle, ohne beides nichts.
export function HerkunftChip({ family }) {
  const herkunft = parseHerkunft(family.herkunft, family.quelle)
  if (!herkunft) return null
  return (
    <span className={`pill admin-herkunft admin-herkunft-${herkunft.variant}`}>
      {herkunft.label}
      {herkunft.hint && <span className="admin-herkunft-hint"> · {herkunft.hint}</span>}
    </span>
  )
}

// „Als Admin ansehen“ (Phase 5 Task 5b): öffnet den Bereich in einem neuen Tab als Nur-Lesen-Sitzung
// (/admin-ansicht/:id -> AdminViewStartPage). Neuer Tab, weil die Ansicht das Sitzungs-Cookie des Browsers
// ersetzt - der Admin-Tab selbst bleibt so stehen (das Admin-Cookie ist ein anderes).
export function AdminViewLink({ familyId, className = '' }) {
  return (
    <a
      className={`btn btn-ghost admin-view-link ${className}`.trim()}
      href={`/admin-ansicht/${familyId}`}
      target="_blank"
      rel="noopener noreferrer"
      title="Öffnet den Bereich nur lesend in einem neuen Tab"
    >
      <Icon name="eye" />
      Als Admin ansehen
    </a>
  )
}

// „Alle Bereiche“ (vorher „Alle Rudel“) im Reiter Familien des Admins: jeder Bereich mit Herkunft und Zählern,
// aufklappbar zu den Details, daneben „Als Admin ansehen“.
export default function AdminFamilyList({ families }) {
  const [openId, setOpenId] = useState(null)

  return (
    <section className="admin-families" aria-labelledby="admin-families-title">
      {/* Audit V7a: die Liste zeigt alle Bereiche (Zuhause, Familien, Tierheime, Partner), nicht nur Rudel */}
      <h2 id="admin-families-title">Alle Bereiche</h2>
      {families.map((family) => {
        const open = openId === family.id
        return (
          <article key={family.id} className={`admin-family card ${open ? 'is-open' : ''}`}>
            <div className="admin-family-row">
              <button type="button" className="admin-family-head" aria-expanded={open} onClick={() => setOpenId(open ? null : family.id)}>
                <span>
                  <strong className="admin-family-name">{family.name}</strong>
                  <span className="muted">
                    angelegt {relativeTime(family.created_at)}
                    {family.last_activity ? ` · zuletzt aktiv ${relativeTime(family.last_activity)}` : ''}
                  </span>
                  <HerkunftChip family={family} />
                </span>
                <span className="admin-family-counts">
                  <span className="pill">{plural(family.dogs, 'Tier', 'Tiere')}</span>
                  <span className="pill">{plural(family.entries, 'Eintrag', 'Einträge')}</span>
                  <span className="pill">{plural(family.notes, 'Zettel', 'Zettel')}</span>
                  <span className="pill">{plural(family.replies, 'Antwort', 'Antworten')}</span>
                </span>
              </button>
              <AdminViewLink familyId={family.id} className="admin-family-view" />
            </div>
            {open && <AdminFamilyDetails familyId={family.id} />}
          </article>
        )
      })}
    </section>
  )
}
