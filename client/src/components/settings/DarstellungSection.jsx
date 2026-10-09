import '../../styles/designer.css'
import { useIsAdminView, useIsDemo } from '../../lib/demo.js'
import { ECKEN, HANDSCHRIFT, MODI, PALETTEN, SCHRIFTARTEN, SCHRIFTEN, STANDARD, normalizeDarstellung } from '../../lib/darstellung.js'
import useDarstellungSave from '../../hooks/useDarstellungSave.js'
import AccentPicker from './AccentPicker.jsx'
import DesignChoice from './DesignChoice.jsx'
import DesignPreview from './DesignPreview.jsx'
import LanguageSwitch from '../LanguageSwitch.jsx'
import { useT } from '../../lib/i18n/index.js'

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
  const t = useT()
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
    ? t(adminView ? 'settings.design.hintAdmin' : 'settings.design.hintDemo')
    : t('settings.design.hintSaved')

  return (
    <section className="settings-block designer" aria-labelledby="darstellung-title">
      <h2 id="darstellung-title" className="visually-hidden">
        {t('settings.tab.darstellung')}
      </h2>
      <DesignPreview />
      <div className="designer-controls">
        <DesignChoice
          name="palette"
          legend={t('settings.design.palette')}
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
        {segments('modus', t('settings.design.modus'), MODI)}
        {segments('schriftart', t('settings.design.schriftart'), SCHRIFTARTEN, (option) => (
          <span className={`designer-font-sample is-${option.id}`} aria-hidden="true">
            Aa
          </span>
        ))}
        <div className="designer-pair">
          {segments('handschrift', t('settings.design.handschrift'), HANDSCHRIFT)}
          {segments('ecken', t('settings.design.ecken'), ECKEN)}
        </div>
        {segments('schrift', t('settings.design.schrift'), SCHRIFTEN, (option) => (
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
            {t('settings.design.reset')}
          </button>
          <p id={HINT_ID} className="field-hint settings-hint">
            {hint}
          </p>
        </div>
        <p className="visually-hidden" aria-live="polite">
          {saved}
        </p>
        <div className="designer-language">
          <span className="field-label" id="language-label">
            Sprache / Language
          </span>
          <LanguageSwitch labelledBy="language-label" />
          <p className="field-hint">{t('settings.language.hint')}</p>
        </div>
      </div>
    </section>
  )
}
