import { t } from '../../lib/i18n/index.js'

// Eingaben für das Suchplakat (pages/VermisstPage.jsx): Foto-Wahl und vier Felder. Alles bleibt im Speicher der Seite -
// nichts geht an den Server. Liegt im .print-head und kommt deshalb nicht mit aufs Papier.

const FIELDS = [
  { key: 'seenDate', label: 'Zuletzt gesehen am', placeholder: 'z. B. 10. Oktober, gegen 18 Uhr' },
  { key: 'seenPlace', label: 'in', placeholder: 'z. B. Stadtpark, am Teich' },
  { key: 'contact', label: 'Telefon für Hinweise', placeholder: 'z. B. 0170 …', hint: 'Diese Nummer wird mit aufs Plakat gedruckt.' },
  { key: 'chip', label: 'Chipnummer (freiwillig)', placeholder: '' }
]

function PhotoChoice({ photos, selected, name, onSelect }) {
  if (photos.length < 2) return null
  return (
    <fieldset className="vermisst-photo-choice">
      <legend className="field-label">{t('Welches Foto?')}</legend>
      <div className="vermisst-photo-options">
        {photos.map((url, index) => (
          <button
            key={url}
            type="button"
            className="vermisst-photo-option"
            aria-pressed={url === selected}
            aria-label={t('Foto {n} von {name}', { n: index + 1, name })}
            onClick={() => onSelect(url)}
          >
            <img src={url} alt="" width="72" height="72" />
          </button>
        ))}
      </div>
    </fieldset>
  )
}

export default function VermisstForm({ photos, selected, name, inputs, onSelectPhoto, onChange }) {
  return (
    <div className="vermisst-form">
      <PhotoChoice photos={photos} selected={selected} name={name} onSelect={onSelectPhoto} />
      <div className="vermisst-fields">
        {FIELDS.map((field) => (
          <div className="field" key={field.key}>
            <label className="field-label" htmlFor={`vermisst-${field.key}`}>
              {t(field.label)}
            </label>
            <input
              id={`vermisst-${field.key}`}
              type={field.key === 'contact' ? 'tel' : 'text'}
              autoComplete="off"
              maxLength={120}
              value={inputs[field.key]}
              placeholder={field.placeholder ? t(field.placeholder) : undefined}
              onChange={(event) => onChange({ ...inputs, [field.key]: event.target.value })}
            />
            {field.hint && <p className="field-hint">{t(field.hint)}</p>}
          </div>
        ))}
      </div>
      <p className="field-hint">{t('Diese Angaben bleiben nur auf diesem Gerät, solange die Seite offen ist – sie werden nicht gespeichert und nicht verschickt.')}</p>
    </div>
  )
}
