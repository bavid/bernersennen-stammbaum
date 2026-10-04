import '../../styles/designer.css'
import { useIsAdminView, useIsDemo } from '../../lib/demo.js'
import { ECKEN, HANDSCHRIFT, MODI, PALETTEN, SCHRIFTARTEN, SCHRIFTEN, STANDARD, normalizeDarstellung } from '../../lib/darstellung.js'
import useDarstellungSave from '../../hooks/useDarstellungSave.js'
import AccentPicker from './AccentPicker.jsx'
import DesignChoice from './DesignChoice.jsx'
import DesignPreview from './DesignPreview.jsx'

const HINT_ID = 'darstellung-hint'
export { LIVE_SAVE_DELAY_MS } from '../../hooks/useDarstellungSave.js'

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

const sameAsStandard = (darstellung) => Object.keys(STANDARD).every((key) => darstellung[key] === STANDARD[key])

// Einstellungen → Darstellung: der Mini-Designer (B+ Familienalbum) - Farbwelt, eigene Akzentfarbe, Hintergrund, Schrift,
// Handschrift-Akzente, Ecken und Schriftgröße mit einer Vorschau-Karte daneben. Jede Wahl wirkt sofort (App.jsx setzt die
// Attribute an <html>, sobald family.darstellung sich ändert) und wird für das eigene Zuhause gespeichert - auf jedem
// Gerät, auf dem man angemeldet ist. „Zurücksetzen“ führt alles auf das Familienalbum zurück.
export default function DarstellungSection({ family, onFamilyChange }) {
  const readOnly = useIsDemo()
  const adminView = useIsAdminView()
  const { change, saved } = useDarstellungSave({ family, onFamilyChange, readOnly })
  const current = normalizeDarstellung(family.darstellung)
  const unchanged = sameAsStandard(current)
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
          {/* aria-disabled statt disabled: nach dem Zurücksetzen bleibt der Fokus auf dem Knopf, statt ins Leere zu fallen. */}
          <button
            type="button"
            className="btn btn-ghost"
            aria-disabled={unchanged}
            onClick={() => {
              if (!unchanged) change({ ...STANDARD })
            }}
          >
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
