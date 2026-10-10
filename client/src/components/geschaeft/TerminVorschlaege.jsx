import { useMemo } from 'react'
import AdminField, { fieldProps } from '../AdminField.jsx'
import Icon from '../Icon.jsx'
import { Button } from '../ui/index.js'
import { KANAL_OPTIONS, MAX_TERMINE, ZEITFENSTER_OPTIONS, terminTage } from '../../lib/geschaeftAnfrage.js'
import { t, useLang } from '../../lib/i18n/index.js'

// Ein Vorschlag: Tag (morgen bis in 60 Tagen, Mo–Sa), Zeitfenster und optional Telefon oder Video.
function Vorschlag({ index, termin, tage, error, id, onChange, onRemove }) {
  const key = `termin-${index}`
  const props = (name) => fieldProps(id(`${key}-${name}`), { error })
  return (
    <fieldset className="geschaeft-termin" aria-describedby={error ? id(`${key}-error`) : undefined}>
      <legend>{t('Vorschlag {n}', { n: index + 1 })}</legend>
      <div className="geschaeft-termin-zeit">
        <AdminField id={id(`${key}-datum`)} label={t('Tag')}>
          <select {...props('datum')} value={termin.datum} onChange={(e) => onChange('datum', e.target.value)}>
            <option value="">{t('Bitte wählen')}</option>
            {tage.map((tag) => (
              <option key={tag.value} value={tag.value}>
                {tag.label}
              </option>
            ))}
          </select>
        </AdminField>
        <AdminField id={id(`${key}-zeitfenster`)} label={t('Zeitfenster')}>
          <select {...props('zeitfenster')} value={termin.zeitfenster} onChange={(e) => onChange('zeitfenster', e.target.value)}>
            <option value="">{t('Bitte wählen')}</option>
            {ZEITFENSTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.label)}
              </option>
            ))}
          </select>
        </AdminField>
      </div>
      <div className="geschaeft-kanal" role="radiogroup" aria-label={t('Telefon oder Video?')}>
        <span className="geschaeft-kanal-label">{t('Telefon oder Video?')}</span>
        {KANAL_OPTIONS.map((option) => (
          <label key={option.value || 'egal'} className="geschaeft-kanal-option">
            <input
              type="radio"
              name={id(`${key}-kanal`)}
              value={option.value}
              checked={termin.kanal === option.value}
              onChange={() => onChange('kanal', option.value)}
            />
            <span>{t(option.label)}</span>
          </label>
        ))}
      </div>
      {error && (
        <p className="field-error" id={id(`${key}-error`)} role="alert">
          {error}
        </p>
      )}
      {onRemove && (
        <Button type="button" variant="ghost" size="sm" className="geschaeft-termin-weg" onClick={onRemove}>
          <Icon name="close" />
          {t('Vorschlag entfernen')}
        </Button>
      )}
    </fieldset>
  )
}

// Schritt 3: 1–3 Terminvorschläge und die Einwilligung (Pflicht, mit Link zum Datenschutz).
export default function TerminVorschlaege({ form, update, updateTermin, addTermin, removeTermin, fieldErrors, id }) {
  const lang = useLang()
  const tage = useMemo(() => terminTage(), [lang]) // eslint-disable-line react-hooks/exhaustive-deps -- Beschriftung folgt der Sprache
  return (
    <>
      <p className="geschaeft-intro">
        {t('Wann passt euch ein kurzes Kennenlernen? Schlagt bis zu drei Termine vor – wir bestätigen einen davon per E-Mail.')}
      </p>
      {fieldErrors.termine && (
        <p className="field-error" role="alert">
          {fieldErrors.termine}
        </p>
      )}
      {form.termine.map((termin, index) => (
        <Vorschlag
          key={index}
          index={index}
          termin={termin}
          tage={tage}
          error={fieldErrors[`termin-${index}`]}
          id={id}
          onChange={(key, value) => updateTermin(index, key, value)}
          onRemove={index > 0 ? () => removeTermin(index) : null}
        />
      ))}
      {form.termine.length < MAX_TERMINE && (
        <Button type="button" variant="ghost" className="geschaeft-termin-plus" onClick={addTermin}>
          <Icon name="plus" />
          {t('Weiteren Termin vorschlagen')}
        </Button>
      )}
      <div className="geschaeft-einwilligung">
        <label className="geschaeft-check" htmlFor={id('einwilligung')}>
          <input
            id={id('einwilligung')}
            type="checkbox"
            checked={form.einwilligung}
            onChange={(e) => update('einwilligung', e.target.checked)}
            aria-invalid={fieldErrors.einwilligung ? true : undefined}
            aria-describedby={fieldErrors.einwilligung ? id('einwilligung-error') : undefined}
          />
          <span>
            {t('Ihr dürft uns für diese Anfrage per E-Mail oder Telefon kontaktieren.')}{' '}
            <a href="/datenschutz" target="_blank" rel="noopener noreferrer">
              {t('Mehr zum Datenschutz')}
            </a>
          </span>
        </label>
        {fieldErrors.einwilligung && (
          <p className="field-error" id={id('einwilligung-error')} role="alert">
            {fieldErrors.einwilligung}
          </p>
        )}
      </div>
    </>
  )
}
