import { useId } from 'react'
import { GESUNDHEIT, GESUNDHEIT_ARTEN } from '../../lib/gesundheit.js'
import { t } from '../../lib/i18n/index.js'
import '../../styles/gesundheit.css'

// „Gesundheit leicht“ in „Erinnerung festhalten“ (nur im eigenen Zuhause): zuerst nur ein ruhiger Schalter. Eingeschaltet
// fragt er nach der Art (Impfung, Wurmkur & Floh, Tierarzt, Sonstiges) und optional „Nächstes Mal am“ - daraus wird die
// Erinnerung in „Bald“ auf Start. Der Text der Erinnerung bleibt frei. value: { aktiv, art, naechstesAm } (lib/gesundheit.js).
// onToggle(aktiv): das Formular stellt beim Einschalten „Nur wir (privat)“ ein.
export default function GesundheitWahl({ value, onChange, onToggle }) {
  const dateId = useId()
  const hintId = useId()
  return (
    <fieldset className="gesundheit-wahl">
      <legend className="visually-hidden">{t(GESUNDHEIT.titel)}</legend>
      <label className={`gesundheit-schalter${value.aktiv ? ' is-selected' : ''}`}>
        <input type="checkbox" name="gesundheit" checked={value.aktiv} onChange={(event) => onToggle(event.target.checked)} />
        <span>{t(GESUNDHEIT.wahl)}</span>
      </label>
      {value.aktiv && (
        <div className="gesundheit-details">
          <div className="gesundheit-arten" role="radiogroup" aria-label={t(GESUNDHEIT.art)}>
            {GESUNDHEIT_ARTEN.map((art) => (
              <label key={art.value} className={`gesundheit-art${value.art === art.value ? ' is-selected' : ''}`}>
                <input
                  type="radio"
                  name="gesundheitArt"
                  value={art.value}
                  checked={value.art === art.value}
                  onChange={() => onChange({ art: art.value })}
                />
                <span>{t(art.label)}</span>
              </label>
            ))}
          </div>
          <div className="field gesundheit-naechstes">
            <label className="field-label" htmlFor={dateId}>
              {t(GESUNDHEIT.naechstes)} <span className="muted">{t('(optional)')}</span>
            </label>
            <input
              id={dateId}
              type="date"
              name="naechstesAm"
              value={value.naechstesAm}
              onChange={(event) => onChange({ naechstesAm: event.target.value })}
              aria-describedby={hintId}
            />
            <p className="field-hint" id={hintId}>
              {t(GESUNDHEIT.naechstesHinweis)} {t(GESUNDHEIT.privatHinweis)}
            </p>
          </div>
        </div>
      )}
    </fieldset>
  )
}
