import { useEffect, useRef, useState } from 'react'
import '../../styles/designer.css'
import { api } from '../../api'
import { useIsAdminView, useIsDemo } from '../../lib/demo.js'
import { ECKEN, HANDSCHRIFT, MODI, PALETTEN, SCHRIFTARTEN, SCHRIFTEN, STANDARD, normalizeDarstellung } from '../../lib/darstellung.js'
import { useToast } from '../Toast.jsx'
import AccentPicker from './AccentPicker.jsx'
import DesignChoice from './DesignChoice.jsx'
import DesignPreview from './DesignPreview.jsx'

const HINT_ID = 'darstellung-hint'
// Das Farbfeld meldet beim Ziehen jede Zwischenfarbe - gespeichert wird erst, wenn es so lange ruht.
export const LIVE_SAVE_DELAY_MS = 500

// Ein Farbmuster mit den echten Farben der Farbwelt: das Element trägt data-palette, palettes.css setzt darin die Tokens
// (hell oder dunkel, wie die Seite gerade).
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

const sameAsStandard = (darstellung) => Object.keys(STANDARD).every((key) => darstellung[key] === STANDARD[key])

// Speichern der Reihe nach (Pfeiltasten in einer Gruppe schicken je Taste eine Änderung - so kommt beim Server die letzte
// auch zuletzt an); scheitert eine, geht sie auf den zuletzt bestätigten Wert zurück. In Demo und Admin-Ansicht nur lokal.
// change(patch, { live: true }): das Farbfeld zieht gerade - sofort zeigen, erst nach einer Pause speichern.
function useDarstellungSave({ family, onFamilyChange, readOnly }) {
  const toast = useToast()
  const [saved, setSaved] = useState('')
  const confirmed = useRef(normalizeDarstellung(family.darstellung))
  const queue = useRef(Promise.resolve())
  const liveTimer = useRef(null)
  const livePatch = useRef(null)

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

  function enqueue(patch) {
    if (!readOnly) queue.current = queue.current.then(() => save(patch))
  }

  function flushLive() {
    clearTimeout(liveTimer.current)
    liveTimer.current = null
    if (livePatch.current) enqueue(livePatch.current)
    livePatch.current = null
  }

  function change(patch, { live = false } = {}) {
    onFamilyChange((me) => withDarstellung(me, patch))
    setSaved('')
    if (live) {
      livePatch.current = { ...livePatch.current, ...patch }
      clearTimeout(liveTimer.current)
      liveTimer.current = setTimeout(flushLive, LIVE_SAVE_DELAY_MS)
      return
    }
    flushLive()
    enqueue(patch)
  }

  // Verlässt man die Seite, während das Farbfeld noch ruht, geht die Farbe trotzdem mit (immer mit dem neuesten flushLive).
  const flushRef = useRef(flushLive)
  useEffect(() => {
    flushRef.current = flushLive
  })
  useEffect(() => () => flushRef.current(), [])

  return { change, saved }
}

// Einstellungen → Darstellung: der Mini-Designer (B+ Familienalbum) - Farbwelt, eigene Akzentfarbe, Hintergrund, Schrift,
// Handschrift-Akzente, Ecken und Schriftgröße mit einer Vorschau-Karte daneben. Jede Wahl wirkt sofort (App.jsx setzt die
// Attribute an <html>, sobald family.darstellung sich ändert) und wird für das eigene Zuhause gespeichert - auf jedem
// Gerät, auf dem man angemeldet ist. „Zurücksetzen“ führt alles auf das Familienalbum zurück.
export default function DarstellungSection({ family, onFamilyChange }) {
  const readOnly = useIsDemo()
  const adminView = useIsAdminView()
  const { change, saved } = useDarstellungSave({ family, onFamilyChange, readOnly })
  const current = normalizeDarstellung(family.darstellung)
  const pick = (key) => (value) => change({ [key]: value })
  const segments = (name, legend, options, extra) => (
    <DesignChoice name={name} legend={legend} variant="segments" options={options} value={current[name]} onChange={pick(name)} describedBy={HINT_ID} renderExtra={extra} />
  )

  const hint = readOnly
    ? `${adminView ? 'In der Admin-Ansicht' : 'In der Demo'} nur für diesen Besuch – gespeichert wird nichts.`
    : 'Gilt für euer Zuhause – auf jedem Gerät, auf dem ihr angemeldet seid.'

  return (
    <section className="settings-block designer" aria-labelledby="darstellung-title">
      <h2 id="darstellung-title" className="visually-hidden">
        Darstellung
      </h2>
      <DesignPreview />
      <div className="designer-controls">
        <DesignChoice
          name="palette"
          legend="Farbwelt"
          variant="tiles"
          options={PALETTEN}
          value={current.palette}
          onChange={pick('palette')}
          describedBy={HINT_ID}
          renderExtra={(option) => <PaletteSwatch id={option.id} />}
        />
        <AccentPicker
          value={current.akzent}
          palette={current.palette}
          modus={current.modus}
          describedBy={HINT_ID}
          onChange={(akzent, options) => change({ akzent }, options)}
        />
        {segments('modus', 'Hintergrund', MODI)}
        {segments('schriftart', 'Schrift', SCHRIFTARTEN, (option) => (
          <span className={`designer-font-sample is-${option.id}`} aria-hidden="true">
            Aa
          </span>
        ))}
        <div className="designer-pair">
          {segments('handschrift', 'Handschrift-Akzente', HANDSCHRIFT)}
          {segments('ecken', 'Ecken', ECKEN)}
        </div>
        {segments('schrift', 'Schriftgröße', SCHRIFTEN, (option) => (
          <span className={`settings-schrift-sample is-${option.id}`} aria-hidden="true">
            Aa
          </span>
        ))}
        <div className="designer-footer">
          <button type="button" className="btn btn-ghost" disabled={sameAsStandard(current)} onClick={() => change({ ...STANDARD })}>
            Zurücksetzen
          </button>
          <p id={HINT_ID} className="field-hint settings-hint">
            {hint}
          </p>
        </div>
        <p className="visually-hidden" aria-live="polite">
          {saved}
        </p>
      </div>
    </section>
  )
}
