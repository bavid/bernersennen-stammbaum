// Filter über einem Tier-Raster (Familienbande des Tierheims, Raster „Alle“ der Tiere): „Alle“ und je Gruppe ein Umschalter
// (aria-pressed) mit der Zahl seiner Tiere. Ein voller Name steht im Tooltip (title) - der Name des Knopfs bleibt, was man
// sieht. options: [{ param (null = Alle), label, title?, count }], current: der gewählte param oder null, onSelect(param),
// controls: id des Rasters, label: Name der Gruppe für Screenreader.
export default function FilterChips({ options, current, onSelect, controls, label }) {
  return (
    <div className="family-filter" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.param ?? 'alle'}
          type="button"
          className="family-filter-option"
          aria-pressed={option.param === current}
          aria-controls={controls}
          title={option.title}
          onClick={() => onSelect(option.param)}
        >
          {/* Das Leerzeichen trennt Name und Zahl auch im Namen des Knopfs ("Lindenhof 1") */}
          {option.label}{' '}
          <span className="family-filter-count">{option.count}</span>
        </button>
      ))}
    </div>
  )
}
