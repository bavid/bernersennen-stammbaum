import { useRef, useState } from 'react'
import { api } from '../../api'
import { useIsAdminView, useIsDemo } from '../../lib/demo.js'
import { MODI, PALETTEN, SCHRIFTEN, normalizeDarstellung } from '../../lib/darstellung.js'
import { useToast } from '../Toast.jsx'

const HINT_ID = 'darstellung-hint'

// Ein Farbmuster mit den echten Farben der Palette: das Element trägt data-palette, palettes.css setzt darin die Tokens
// der Palette (hell oder dunkel, wie die Seite gerade).
function PaletteSwatch({ id }) {
  return (
    <span className="palette-swatch" data-palette={id} aria-hidden="true">
      <span className="palette-swatch-bar" />
      <span className="palette-swatch-dots">
        <span className="palette-swatch-dot is-accent" />
        <span className="palette-swatch-dot is-second" />
        <span className="palette-swatch-dot is-ink" />
      </span>
    </span>
  )
}

// Eine Gruppe Optionsfelder (Auswahl wirkt sofort) - als Kacheln (Paletten) oder als Segmente (Hell/Dunkel, Schrift).
function ChoiceGroup({ name, legend, options, value, onChange, variant, renderExtra }) {
  return (
    <fieldset className={`settings-choice settings-choice-${variant}`} aria-describedby={HINT_ID}>
      <legend>{legend}</legend>
      <div className="settings-choice-options">
        {options.map((option) => (
          <label key={option.id} className={`settings-option${value === option.id ? ' is-checked' : ''}`}>
            <input type="radio" name={name} value={option.id} checked={value === option.id} onChange={() => onChange(option.id)} />
            {renderExtra?.(option)}
            <span className="settings-option-label">{option.label}</span>
            {option.hint && <span className="settings-option-hint">{option.hint}</span>}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

// Legt patch über die Darstellung von me. Ohne Sitzung (me null - z. B. ein 401 während des Speicherns hat schon
// abgemeldet) bleibt es dabei, statt ein halbes "me" zu erfinden.
function withDarstellung(me, patch) {
  return me ? { ...me, darstellung: { ...normalizeDarstellung(me.darstellung), ...patch } } : me
}

// Nach einem Fehler: die Felder aus patch zurück auf den zuletzt bestätigten Wert - nur die, die noch auf dem gescheiterten
// Wert stehen (eine neuere Wahl bleibt).
function revertDarstellung(me, patch, confirmed) {
  if (!me) return me
  const now = normalizeDarstellung(me.darstellung)
  const keys = Object.keys(patch).filter((key) => now[key] === patch[key])
  return { ...me, darstellung: { ...now, ...Object.fromEntries(keys.map((key) => [key, confirmed[key]])) } }
}

// Einstellungen → Darstellung: Farbpalette, Hell/Dunkel/Automatisch, Schriftgröße. Jede Wahl wirkt sofort (App.jsx setzt
// die Attribute an <html>, sobald family.darstellung sich ändert) und wird für das eigene Zuhause gespeichert - auf jedem
// Gerät, auf dem man angemeldet ist. In der Demo und der Admin-Ansicht nur für diesen Besuch: nichts geht an den Server,
// es gibt auch keinen Fehler. Gespeichert wird der Reihe nach (Pfeiltasten in einer Gruppe schicken je Taste eine
// Änderung - so kommt beim Server die letzte auch zuletzt an); scheitert eine, geht sie auf den zuletzt bestätigten Wert
// zurück.
export default function DarstellungSection({ family, onFamilyChange }) {
  const readOnly = useIsDemo()
  const adminView = useIsAdminView()
  const toast = useToast()
  const [saved, setSaved] = useState('')
  const confirmed = useRef(normalizeDarstellung(family.darstellung))
  const queue = useRef(Promise.resolve())
  const current = normalizeDarstellung(family.darstellung)

  async function save(patch) {
    try {
      await api.setDarstellung(patch)
      confirmed.current = { ...confirmed.current, ...patch }
      setSaved('Gespeichert.')
    } catch (err) {
      onFamilyChange((me) => revertDarstellung(me, patch, confirmed.current))
      toast(err.message)
    }
  }

  function change(patch) {
    onFamilyChange((me) => withDarstellung(me, patch))
    setSaved('')
    if (!readOnly) queue.current = queue.current.then(() => save(patch))
  }

  const hint = readOnly
    ? `${adminView ? 'In der Admin-Ansicht' : 'In der Demo'} nur für diesen Besuch – gespeichert wird nichts.`
    : 'Gilt für euer Zuhause – auf jedem Gerät, auf dem ihr angemeldet seid.'

  return (
    <section className="settings-block" aria-labelledby="darstellung-title">
      <h2 id="darstellung-title" className="visually-hidden">
        Darstellung
      </h2>
      <ChoiceGroup
        name="palette"
        legend="Farbpalette"
        variant="tiles"
        options={PALETTEN}
        value={current.palette}
        onChange={(palette) => change({ palette })}
        renderExtra={(option) => <PaletteSwatch id={option.id} />}
      />
      <ChoiceGroup
        name="modus"
        legend="Hell oder dunkel"
        variant="segments"
        options={MODI}
        value={current.modus}
        onChange={(modus) => change({ modus })}
      />
      <ChoiceGroup
        name="schrift"
        legend="Schriftgröße"
        variant="segments"
        options={SCHRIFTEN}
        value={current.schrift}
        onChange={(schrift) => change({ schrift })}
        renderExtra={(option) => (
          <span className={`settings-schrift-sample is-${option.id}`} aria-hidden="true">
            Aa
          </span>
        )}
      />
      <p id={HINT_ID} className="field-hint settings-hint">
        {hint}
      </p>
      <p className="visually-hidden" aria-live="polite">
        {saved}
      </p>
    </section>
  )
}
