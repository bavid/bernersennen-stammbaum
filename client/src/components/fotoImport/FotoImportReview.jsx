import { useId } from 'react'
import { Button } from '../ui'
import SichtbarkeitWahl from '../entryForm/SichtbarkeitWahl.jsx'
import { MAX_DAYS, MAX_PER_ENTRY, MAX_PHOTOS } from '../../lib/fotoImport/group.js'
import { MAX_ZIP_IMAGES } from '../../lib/fotoImport/takeout.js'
import { IMPORT_TEXT } from '../../lib/fotoImport/texts.js'
import { formatDateLong } from '../../lib/dates.js'
import { useIsDemo } from '../../lib/demo.js'
import { t } from '../../lib/i18n/index.js'

// Ein Tag: Überschrift und ein ruhiges Raster; ein Tipp nimmt ein Foto mit oder lässt es weg.
function DayGrid({ day, selected, previews, onToggle }) {
  const date = formatDateLong(day.date)
  return (
    <section className="foto-import-day">
      <h3 className="foto-import-day-title">
        {t(IMPORT_TEXT.dayGroup, { date, n: day.items.length })}
        {day.items.some((item) => item.dateGuessed) && <span className="muted"> · {t(IMPORT_TEXT.dateGuessed)}</span>}
      </h3>
      <ul className="foto-import-grid" role="list">
        {day.items.map((item) => (
          <li key={item.id}>
            <label className={`foto-import-thumb${selected.has(item.id) ? ' is-selected' : ''}`}>
              <input type="checkbox" className="visually-hidden" checked={selected.has(item.id)} onChange={() => onToggle(item.id)} aria-label={t(IMPORT_TEXT.selectPhoto, { date })} />
              <img src={previews.get(item.id)} alt="" loading="lazy" width={96} height={96} />
            </label>
          </li>
        ))}
      </ul>
    </section>
  )
}

function ImportOptions({ flow, isHousehold, shareNames }) {
  const nameId = useId()
  const needsName = !flow.autorName.trim() || flow.error === t(IMPORT_TEXT.nameMissing)
  return (
    <>
      {isHousehold && <SichtbarkeitWahl privat={flow.privat} onChange={flow.setPrivat} shareNames={shareNames} />}
      {needsName && (
        <div className="foto-import-name">
          <label className="field-label" htmlFor={nameId}>
            {t(IMPORT_TEXT.namePrompt)}
          </label>
          <input id={nameId} value={flow.autorName} maxLength={60} onChange={(event) => flow.setAutorName(event.target.value)} />
        </div>
      )}
    </>
  )
}

// Schritt 2: Tage prüfen (alles vorausgewählt), einmal Sichtbarkeit wählen, los. In der Demo nur ansehen.
export default function FotoImportReview({ flow, isHousehold, shareNames }) {
  const isDemo = useIsDemo()
  const { plan } = flow
  return (
    <div className="foto-import-step">
      <p className="field-hint">{t(IMPORT_TEXT.reviewHint)}</p>
      {flow.truncated && <p className="notice">{t(IMPORT_TEXT.moreThanRead, { n: MAX_ZIP_IMAGES })}</p>}
      {flow.overCap > 0 && <p className="notice">{t(IMPORT_TEXT.capHint, { photos: MAX_PHOTOS, days: MAX_DAYS, perDay: MAX_PER_ENTRY, n: flow.overCap })}</p>}
      <div className="foto-import-days">
        {flow.days.map((day) => (
          <DayGrid key={day.date} day={day} selected={flow.selected} previews={flow.previews} onToggle={flow.toggle} />
        ))}
      </div>
      {!isDemo && <ImportOptions flow={flow} isHousehold={isHousehold} shareNames={shareNames} />}
      {flow.error && (
        <p className="field-error" role="alert">
          {flow.error}
        </p>
      )}
      <p className="foto-import-summary">{t(IMPORT_TEXT.summary, { photos: plan.photos, days: plan.plan.length })}</p>
      {isDemo && <p className="notice">{t(IMPORT_TEXT.demo)}</p>}
      <div className="form-actions foto-import-actions">
        <Button variant="ghost" onClick={flow.reset}>
          {t(IMPORT_TEXT.back)}
        </Button>
        {!isDemo && (
          <Button onClick={flow.start} disabled={plan.plan.length === 0}>
            {t(IMPORT_TEXT.start)}
          </Button>
        )}
      </div>
    </div>
  )
}
