import { useEffect, useState } from 'react'
import { api } from '../api'
import Icon from './Icon.jsx'
import { relativeTime } from '../lib/dates.js'

// V-Fehler 3: auch der Schalter "Vertrauenswürdig" eines Partners (server/lib/adminLog.js, ziel 'partner:<id>').
const AKTION_LABELS = {
  view: 'Bereich angesehen',
  'partner-vertrauenswuerdig': 'Partner vertrauenswürdig gesetzt',
  'partner-nicht-vertrauenswuerdig': 'Partner nicht mehr vertrauenswürdig',
  // Phase V4a: Termine eines Partners (server/routes/adminTermine.js, ziel 'termin:<id>').
  'termin-ausgeblendet': 'Termin ausgeblendet',
  'termin-eingeblendet': 'Termin wieder eingeblendet',
  'termin-geloescht': 'Termin gelöscht',
  // Audit V7a: ein Bannerfoto eines Partners entfernt (server/routes/adminBanner.js, ziel 'partner:<id>').
  'bannerfoto-entfernt': 'Bannerfoto entfernt',
  // Phase N Task 5: globale Hinweise (server/routes/adminHinweise.js, ziel 'hinweis:<id>').
  'hinweis-angelegt': 'Hinweis angelegt',
  'hinweis-geaendert': 'Hinweis geändert',
  'hinweis-eingeschaltet': 'Hinweis eingeschaltet',
  'hinweis-ausgeschaltet': 'Hinweis ausgeschaltet',
  'hinweis-geloescht': 'Hinweis gelöscht'
}

// ziel aus dem Protokoll ('family:<id>', server/lib/adminLog.js) lesbar machen. Das Protokoll selbst speichert
// keine Namen - der Name kommt, falls bekannt, aus der Übersicht (families), sonst bleibt es bei der Nummer.
export function describeZiel(ziel, families = []) {
  const partner = /^partner:(\d+)$/.exec(ziel || '')
  if (partner) return `Partner #${partner[1]}`
  const termin = /^termin:(\d+)$/.exec(ziel || '')
  if (termin) return `Termin #${termin[1]}`
  const hinweis = /^hinweis:(\d+)$/.exec(ziel || '')
  if (hinweis) return `Hinweis #${hinweis[1]}`
  const match = /^family:(\d+)$/.exec(ziel || '')
  if (!match) return ziel || ''
  const id = Number(match[1])
  const family = families.find((entry) => entry.id === id)
  return family ? `${family.name} (#${id})` : `Bereich #${id}`
}

export function describeAktion(aktion) {
  return AKTION_LABELS[aktion] || aktion
}

// Protokoll der Admin-Ansicht (Phase 5 Task 5b, GET /api/admin/log): die letzten Aufrufe, neueste zuerst -
// welcher Bereich wann geöffnet wurde. families: die Zeilen der Übersicht, um Bereichsnamen anzuzeigen.
export default function AdminLog({ families = [] }) {
  const [entries, setEntries] = useState(undefined)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.admin
      .log()
      .then(setEntries)
      .catch((err) => setError(err.message))
  }, [])

  return (
    <section className="admin-log card" aria-labelledby="admin-log-title">
      <div className="admin-section-head">
        <h2 id="admin-log-title">Protokoll der Admin-Ansicht</h2>
        <span className="muted">Wann welcher Bereich geöffnet wurde – ohne Inhalte.</span>
      </div>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {entries === undefined && !error && <p className="muted">Lade …</p>}
      {entries?.length === 0 && <p className="empty-state">Noch kein Bereich in der Admin-Ansicht geöffnet.</p>}
      {entries?.length > 0 && (
        <ul className="admin-log-list">
          {entries.map((entry) => (
            <li key={entry.id} className="admin-log-entry">
              <Icon name="eye" />
              <span className="admin-log-aktion">{describeAktion(entry.aktion)}</span>
              <span className="admin-log-ziel">{describeZiel(entry.ziel, families)}</span>
              <time className="muted" dateTime={entry.created_at.replace(' ', 'T') + 'Z'} title={entry.created_at}>
                {relativeTime(entry.created_at)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
