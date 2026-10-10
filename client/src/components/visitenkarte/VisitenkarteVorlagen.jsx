import { VORLAGEN } from '../../lib/visitenkarte.js'
import { t } from '../../lib/i18n/index.js'

// Auswahl der Vorlage (Phase V5): drei echte Radio-Knöpfe als Karten mit kleiner Skizze. Ohne Bannerfoto bleibt "Foto"
// wählbar, die Karte zeigt dann aber "Klassisch" - der Hinweis darunter sagt, wo das Foto herkommt. Die Skizzen zeigen
// die gewählte Farbe (farbe).
export default function VisitenkarteVorlagen({ value, farbe, hasFoto, onChange }) {
  return (
    <fieldset className="vk-fieldset" style={{ '--vk-farbe': farbe }}>
      <legend className="field-label">{t('Vorlage')}</legend>
      <div className="vk-vorlagen">
        {VORLAGEN.map((vorlage) => (
          <label key={vorlage.id} className={`vk-vorlage ${value === vorlage.id ? 'is-selected' : ''}`}>
            <input
              type="radio"
              name="vk-vorlage"
              value={vorlage.id}
              checked={value === vorlage.id}
              onChange={() => onChange(vorlage.id)}
            />
            <span className={`vk-vorlage-skizze vk-skizze-${vorlage.id}`} aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            <span className="vk-vorlage-text">
              <strong>{t(vorlage.label)}</strong>
              <span className="field-hint">{t(vorlage.hint)}</span>
            </span>
          </label>
        ))}
      </div>
      {value === 'foto' && !hasFoto && (
        <p className="field-hint vk-note" role="note">
          {t('Noch kein Bannerfoto – bis dahin zeigt die Karte „Klassisch“. Bannerfotos ladet ihr im Profil unter „Angaben“ hoch.')}
        </p>
      )}
    </fieldset>
  )
}
