import { useState } from 'react'
import AdminFamilyDetails from './AdminFamilyDetails.jsx'
import { relativeTime } from '../lib/dates.js'
import { parseHerkunft } from '../lib/herkunft.js'

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

// „Alle Rudel“ am Ende des Admins: jeder Bereich mit Herkunft und Zählern, aufklappbar zu den Details.
export default function AdminFamilyList({ families }) {
  const [openId, setOpenId] = useState(null)

  return (
    <section className="admin-families" aria-labelledby="admin-families-title">
      <h2 id="admin-families-title">Alle Rudel</h2>
      {families.map((family) => {
        const open = openId === family.id
        return (
          <article key={family.id} className={`admin-family card ${open ? 'is-open' : ''}`}>
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
                <span className="pill">{family.dogs} Hunde</span>
                <span className="pill">{family.entries} Einträge</span>
                <span className="pill">{family.notes} Zettel</span>
                <span className="pill">{family.replies} Antworten</span>
              </span>
            </button>
            {open && <AdminFamilyDetails familyId={family.id} />}
          </article>
        )
      })}
    </section>
  )
}
