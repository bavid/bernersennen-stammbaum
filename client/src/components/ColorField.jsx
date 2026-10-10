import { isValidHexColor } from '../lib/color.js'
import { contrastRatio, hasEnoughContrast, ON_RUST, MIN_CONTRAST } from '../lib/contrast.js'
import { fieldProps } from './AdminField.jsx'
import { t } from '../lib/i18n/index.js'

const DEFAULT_FARBE = '#2f6b3f'

// Live-Kontrastanzeige beim Tippen/Wählen der Farbe - dieselbe WCAG-Formel wie der Server
// (lib/contrast.js spiegelt server/lib/partners.js), ersetzt die Server-Prüfung beim Speichern nicht.
export function ContrastHint({ farbe }) {
  if (!farbe) return null
  if (!isValidHexColor(farbe)) return <p className="field-hint">Format: #rrggbb</p>

  const ratio = contrastRatio(farbe, ON_RUST)
  const ok = hasEnoughContrast(farbe)
  return (
    <p className={`field-hint admin-partner-contrast ${ok ? 'is-ok' : 'is-warning'}`} role={ok ? undefined : 'alert'}>
      {t('Kontrast gegen die Schrift: {ratio}:1', { ratio: ratio.toFixed(2) })} –{' '}
      {ok ? t('gut lesbar.') : t('zu niedrig (mind. {min}:1 nötig) – Schrift wäre schlecht lesbar.', { min: MIN_CONTRAST })}
    </p>
  )
}

// Akzentfarbe eines Partners: Farbwähler plus Hex-Eingabe (id) und die Kontrastanzeige - geteilt vom
// Admin (AdminPartners) und vom Partner selbst (PartnerProfileForm). error: Feldfehler vom Server.
export default function ColorField({ id, label, value, onChange, error, className = '' }) {
  return (
    <div className={`field ${error ? 'has-error' : ''} ${className}`.trim()}>
      <span className="field-label">{label}</span>
      <div className="admin-partner-color">
        <input
          type="color"
          aria-label={t('{label} wählen', { label })}
          value={isValidHexColor(value) ? value : DEFAULT_FARBE}
          onChange={(e) => onChange(e.target.value)}
        />
        <input
          {...fieldProps(id, { error })}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#rrggbb"
          maxLength={7}
          aria-label={t('{label} als Hex-Wert', { label })}
        />
      </div>
      <ContrastHint farbe={value} />
      {error && (
        <p className="field-error" id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
