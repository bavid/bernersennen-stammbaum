import { useState } from 'react'
import Icon from '../Icon.jsx'
import ConfirmButton from '../ConfirmButton.jsx'
import { relativeTime } from '../../lib/dates.js'
import { ZEITRAEUME } from '../../lib/bilderrahmen.js'

const MAX_NAME_LENGTH = 40

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

// Ein Rahmen-Link in der Liste: Name, zuletzt aktiv, Auswahl - umbenennen und beenden (sofort ungültig, zweistufig).
export default function RahmenGeraetRow({ geraet, tiere, readOnly, onRename, onRevoke }) {
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(geraet.name)
  const [error, setError] = useState(null)

  function startRename() {
    setName(geraet.name)
    setError(null)
    setRenaming(true)
  }

  async function submit(event) {
    event.preventDefault()
    setError(null)
    try {
      await onRename(name.trim())
      setRenaming(false)
    } catch (err) {
      setError(err.message)
    }
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
      {renaming ? (
        <form className="rahmen-rename" onSubmit={submit}>
          <label className="visually-hidden" htmlFor={`rahmen-name-${geraet.id}`}>
            Neuer Name für „{geraet.name}“
          </label>
          <input
            id={`rahmen-name-${geraet.id}`}
            value={name}
            maxLength={MAX_NAME_LENGTH}
            required
            autoFocus
            onChange={(event) => setName(event.target.value)}
          />
          <button type="submit" className="btn btn-primary" disabled={!name.trim()}>
            Speichern
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setRenaming(false)}>
            Abbrechen
          </button>
        </form>
      ) : (
        <>
          <div className="settings-row-main">
            <strong>{geraet.name}</strong>
            <span className="settings-row-sub">{seen(geraet)}</span>
            <span className="settings-row-sub">{summary(geraet.auswahl, tiere)}</span>
          </div>
          {!readOnly && (
            <div className="settings-row-actions">
              <button type="button" className="btn btn-ghost" onClick={startRename} aria-label={`„${geraet.name}“ umbenennen`}>
                <Icon name="edit" />
                Umbenennen
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
