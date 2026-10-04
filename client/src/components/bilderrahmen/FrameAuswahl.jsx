import '../../styles/bilderrahmen-optionen.css'
import { ZEITRAEUME } from '../../lib/bilderrahmen.js'

// Welche Fotos? Tiere als Chips (mehrere wählbar, keins gewählt = alle) und der Zeitraum. Auch für den Rahmen-Link in
// den Einstellungen (RahmenGeraetForm) - idPrefix trennt die Namen der Radio-Gruppen. showPrivat (Diashow im eigenen
// Zuhause): dazu der Haken „Auch private Erinnerungen zeigen“ (auswahl.privat, Vorgabe aus).
export default function FrameAuswahl({ tiere, auswahl, onChange, idPrefix = 'frame', showPrivat = false }) {
  const chosen = new Set(auswahl.tiere)

  function toggle(id) {
    const next = chosen.has(id) ? auswahl.tiere.filter((tierId) => tierId !== id) : [...auswahl.tiere, id]
    onChange({ ...auswahl, tiere: next })
  }

  return (
    <>
      {tiere.length > 1 && (
        <fieldset className="frame-settings-group">
          <legend>Welche Tiere?</legend>
          <div className="frame-chips">
            <button
              type="button"
              className={`frame-chip${chosen.size === 0 ? ' is-selected' : ''}`}
              aria-pressed={chosen.size === 0}
              onClick={() => onChange({ ...auswahl, tiere: [] })}
            >
              Alle
            </button>
            {tiere.map((tier) => (
              <button
                key={tier.id}
                type="button"
                className={`frame-chip${chosen.has(tier.id) ? ' is-selected' : ''}`}
                aria-pressed={chosen.has(tier.id)}
                onClick={() => toggle(tier.id)}
              >
                <span>
                  {tier.name}
                  {tier.inErinnerung && <span className="frame-chip-note"> · in Erinnerung</span>}
                </span>
              </button>
            ))}
          </div>
        </fieldset>
      )}
      <fieldset className="frame-settings-group">
        <legend>Zeitraum</legend>
        <div className="frame-choice-row">
          {ZEITRAEUME.map(({ key, label }) => (
            <label key={key} className={`frame-choice${auswahl.zeitraum === key ? ' is-selected' : ''}`}>
              <input
                type="radio"
                name={`${idPrefix}-zeitraum`}
                value={key}
                checked={auswahl.zeitraum === key}
                onChange={() => onChange({ ...auswahl, zeitraum: key })}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      {showPrivat && (
        <fieldset className="frame-settings-group">
          <legend>Private Erinnerungen</legend>
          <label className="check">
            <input
              type="checkbox"
              checked={Boolean(auswahl.privat)}
              onChange={(event) => onChange({ ...auswahl, privat: event.target.checked })}
            />
            Auch private Erinnerungen zeigen
          </label>
          <p className="field-hint">Nur im eigenen Zuhause – auf dem Bildschirm sieht sie jeder, der davorsteht.</p>
        </fieldset>
      )}
    </>
  )
}
