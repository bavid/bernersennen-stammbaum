import { useId } from 'react'
import { PER_PAGE_OPTIONS, RANGES } from '../../lib/fotobuch.js'
import { t } from '../../lib/i18n/index.js'

// Einstellungen fürs Fotobuch (pages/FotobuchPage.jsx): Zeitraum, private Erinnerungen, Erinnerungen je Seite, Kapitel.
// Liegt im .print-head und kommt nicht aufs Papier. options/onChange: lib/fotobuch.js DEFAULT_OPTIONS.

const RANGE_LABELS = {
  all: 'Alles',
  year: 'Dieses Jahr',
  '12m': 'Letzte 12 Monate',
  custom: 'Eigener Zeitraum'
}

function Segmented({ label, values, current, format, onSelect }) {
  const labelId = useId()
  return (
    <div className="fotobuch-option">
      <span className="field-label" id={labelId}>
        {label}
      </span>
      <div className="segmented" role="group" aria-labelledby={labelId}>
        {values.map((value) => (
          <button key={value} type="button" aria-pressed={value === current} onClick={() => onSelect(value)}>
            {format(value)}
          </button>
        ))}
      </div>
    </div>
  )
}

function CustomRange({ options, onChange }) {
  return (
    <div className="fotobuch-dates">
      <div className="field">
        <label className="field-label" htmlFor="fotobuch-from">
          {t('Von')}
        </label>
        <input
          id="fotobuch-from"
          type="date"
          value={options.from}
          onChange={(event) => onChange({ ...options, from: event.target.value })}
        />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="fotobuch-to">
          {t('Bis')}
        </label>
        <input id="fotobuch-to" type="date" value={options.to} onChange={(event) => onChange({ ...options, to: event.target.value })} />
      </div>
    </div>
  )
}

function Check({ id, checked, label, onChange }) {
  return (
    <label className="fotobuch-check" htmlFor={id}>
      <input id={id} type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  )
}

export default function FotobuchOptions({ options, showPrivate, onChange }) {
  const set = (patch) => onChange({ ...options, ...patch })
  return (
    <div className="fotobuch-options">
      <Segmented
        label={t('Zeitraum')}
        values={RANGES}
        current={options.range}
        format={(value) => t(RANGE_LABELS[value])}
        onSelect={(range) => set({ range })}
      />
      {options.range === 'custom' && <CustomRange options={options} onChange={onChange} />}
      <Segmented
        label={t('Erinnerungen je Seite')}
        values={PER_PAGE_OPTIONS}
        current={options.perPage}
        format={(value) => String(value)}
        onSelect={(perPage) => set({ perPage })}
      />
      <div className="fotobuch-checks">
        <Check
          id="fotobuch-chapters"
          checked={options.chapters}
          label={t('Jedes Jahr auf einer neuen Seite')}
          onChange={(chapters) => set({ chapters })}
        />
        {showPrivate && (
          <Check
            id="fotobuch-private"
            checked={options.includePrivate}
            label={t('Private Erinnerungen mitdrucken')}
            onChange={(includePrivate) => set({ includePrivate })}
          />
        )}
      </div>
    </div>
  )
}
