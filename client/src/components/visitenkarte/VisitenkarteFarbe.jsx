import { useEffect, useState } from 'react'
import { LIGHT_TEXT, PALETTE, normalizeHex, textColorOn } from '../../lib/visitenkarte.js'
import { locale, t } from '../../lib/i18n/index.js'

// Farbe der Karte (Phase V5): die Farben der Auftritte, dazu die eigene Partnerfarbe aus dem Profil und ein freies Feld
// für #rrggbb (plus Farbwähler). Die Schrift auf der Farbfläche wählt lib/visitenkarte.js textColorOn selbst - reicht
// weder helle noch dunkle Schrift für 4,5 : 1, rät der Hinweis zu einer anderen Farbe.

function formatRatio(ratio) {
  return ratio.toLocaleString(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

function swatches(eigeneFarbe) {
  const eigene = normalizeHex(eigeneFarbe)
  const palette = PALETTE.filter((entry) => entry.farbe !== eigene)
  return eigene ? [{ farbe: eigene, label: t('Eure Farbe') }, ...palette] : palette
}

export default function VisitenkarteFarbe({ value, eigeneFarbe, onChange }) {
  const [text, setText] = useState(value)
  const contrast = textColorOn(value)
  const invalid = normalizeHex(text) === null

  // Wechselt die Farbe von außen (Farbfeld, Farbwähler, Laden), zieht das Textfeld nach - ebenso beim Verlassen des
  // Feldes, damit kein ungültiger Rest stehen bleibt, der nicht gilt.
  useEffect(() => setText(value), [value])

  function handleText(event) {
    const next = event.target.value
    setText(next)
    const hex = normalizeHex(next)
    if (hex) onChange(hex)
  }

  return (
    <fieldset className="vk-fieldset">
      <legend className="field-label">{t('Farbe')}</legend>
      <div className="vk-swatches">
        {swatches(eigeneFarbe).map((entry) => (
          <label key={entry.farbe} className={`vk-swatch ${value === entry.farbe ? 'is-selected' : ''}`} title={t(entry.label)}>
            <input type="radio" name="vk-farbe" value={entry.farbe} checked={value === entry.farbe} onChange={() => onChange(entry.farbe)} />
            <span className="vk-swatch-dot" style={{ background: entry.farbe }} aria-hidden="true" />
            <span className="vk-swatch-label">{t(entry.label)}</span>
          </label>
        ))}
      </div>
      <div className="vk-hex">
        <label className="vk-hex-field" htmlFor="vk-farbe-hex">
          <span className="visually-hidden">{t('Eigene Farbe als Hex-Wert')}</span>
          <input
            id="vk-farbe-hex"
            type="text"
            value={text}
            onChange={handleText}
            onBlur={() => setText(value)}
            maxLength={7}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={invalid || undefined}
            aria-describedby="vk-farbe-kontrast"
          />
        </label>
        <label className="vk-picker">
          <span className="visually-hidden">{t('Farbe wählen')}</span>
          <input type="color" value={value} onChange={(event) => onChange(event.target.value.toLowerCase())} />
        </label>
      </div>
      <p id="vk-farbe-kontrast" className={`field-hint vk-kontrast ${contrast.ok ? '' : 'is-knapp'}`}>
        {invalid
          ? t('Bitte als #rrggbb angeben, z. B. #a4431d.')
          : `${t(contrast.color === LIGHT_TEXT ? 'Schrift auf der Farbfläche: helle (Kontrast {ratio} : 1)' : 'Schrift auf der Farbfläche: dunkle (Kontrast {ratio} : 1)', {
              ratio: formatRatio(contrast.ratio)
            })}${contrast.ok ? '' : t(' – etwas knapp, eine hellere oder dunklere Farbe liest sich besser.')}`}
      </p>
    </fieldset>
  )
}
