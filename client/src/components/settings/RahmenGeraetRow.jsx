import { useState } from 'react'
import Icon from '../Icon.jsx'
import ConfirmButton from '../ConfirmButton.jsx'
import RahmenGeraetForm from './RahmenGeraetForm.jsx'
import { relativeTime } from '../../lib/dates.js'
import { ZEITRAEUME } from '../../lib/bilderrahmen.js'

// Gewählte Tiere mit Namen - solange die noch nicht geladen sind (oder ein Tier nicht mehr da ist) „2 Tiere“, nie
// fälschlich „Alle Tiere“.
function animalsLabel(ids, tiere) {
  if (ids.length === 0) return 'Alle Tiere'
  const names = ids.map((id) => tiere.find((tier) => tier.id === id)?.name)
  if (names.every(Boolean)) return names.join(', ')
  return ids.length === 1 ? '1 Tier' : `${ids.length} Tiere`
}

// „Alle Tiere · Letztes Jahr · alle 10 s · auch private Erinnerungen“
function summary(auswahl, tiere) {
  const parts = [animalsLabel(auswahl.tiere, tiere)]
  if (auswahl.zeitraum !== 'alle') parts.push(ZEITRAEUME.find((z) => z.key === auswahl.zeitraum)?.label || '')
  parts.push(`alle ${auswahl.intervall} s`)
  if (auswahl.privat) parts.push('auch private Erinnerungen')
  return parts.filter(Boolean).join(' · ')
}

function seen(geraet) {
  return geraet.zuletztAktiv ? `zuletzt aktiv ${relativeTime(geraet.zuletztAktiv)}` : 'noch nicht verbunden'
}

// Ein Rahmen-Link in der Liste: Name, zuletzt aktiv, Auswahl - ändern (Name, Tiere, Zeitraum, Anzeige; der Link bleibt
// derselbe, das Gerät holt die neue Auswahl beim nächsten Laden) und beenden (sofort ungültig, zweistufig).
export default function RahmenGeraetRow({ geraet, tiere, readOnly, onUpdate, onRevoke }) {
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState(null)

  async function save(payload) {
    await onUpdate(payload)
    setEditing(false)
  }

  async function revoke() {
    setError(null)
    try {
      await onRevoke()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <li className="settings-row rahmen-row">
      {editing ? (
        <RahmenGeraetForm tiere={tiere} geraet={geraet} onSubmit={save} onCancel={() => setEditing(false)} />
      ) : (
        <>
          <div className="settings-row-main">
            <strong>{geraet.name}</strong>
            <span className="settings-row-sub">{seen(geraet)}</span>
            <span className="settings-row-sub">{summary(geraet.auswahl, tiere)}</span>
          </div>
          {!readOnly && (
            <div className="settings-row-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setError(null)
                  setEditing(true)
                }}
                aria-label={`„${geraet.name}“ ändern`}
              >
                <Icon name="edit" />
                Ändern
              </button>
              <ConfirmButton
                label="Beenden"
                confirmLabel="Wirklich beenden?"
                ariaLabel={`Bilderrahmen „${geraet.name}“ beenden`}
                icon="close"
                onConfirm={revoke}
              />
            </div>
          )}
        </>
      )}
      {error && (
        <p className="settings-row-error" role="alert">
          {error}
        </p>
      )}
    </li>
  )
}
