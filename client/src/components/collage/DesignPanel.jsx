import { useId } from 'react'
import Icon from '../Icon.jsx'
import { MARGIN, PAGE } from '../../lib/collage/layout.js'
import { LAYOUTS, computeLayout, layoutOf } from '../../lib/collage/layouts.js'
import { BACKGROUNDS, BACKGROUND_GROUPS, backgroundTileUrl } from '../../lib/collage/backgrounds.js'

// Reiter "Seite", Teil Gestaltung: Vorlage und Hintergrund der Seite, wahlweise für alle Seiten.

// Beispiel-Fotozahl je Vorlage für das Miniaturbild - gezeichnet aus derselben Geometrie wie die Seite selbst
const SAMPLE_COUNT = { auto: 5, 'grid-2': 4, 'grid-3': 9, hero: 4, polaroid: 4, timeline: 4 }
const rectOf = ({ x, y, width, height }) => ({ x, y, width, height })

function MiniLayout({ layoutId }) {
  const { frames, line } = computeLayout(layoutId, SAMPLE_COUNT[layoutId])
  return (
    <svg className="layout-mini" viewBox={`0 0 ${PAGE.width} ${PAGE.height}`} aria-hidden="true" focusable="false">
      <rect className="mini-title" x={MARGIN} y={120} width={620} height={80} rx={12} />
      {line && <rect className="mini-line" x={line.x - 8} y={line.y1} width={16} height={line.y2 - line.y1} />}
      {frames.map((frame, i) =>
        frame.polaroid ? (
          <g key={i} transform={`rotate(${frame.rotation} ${frame.polaroid.x + frame.polaroid.width / 2} ${frame.polaroid.y + frame.polaroid.height / 2})`}>
            <rect className="mini-card" {...rectOf(frame.polaroid)} />
            <rect className="mini-photo" {...rectOf(frame)} />
          </g>
        ) : (
          <rect key={i} className="mini-photo" {...rectOf(frame)} rx={28} />
        )
      )}
    </svg>
  )
}

function LayoutPicker({ value, onChange, labelId }) {
  return (
    <div className="layout-picker" role="radiogroup" aria-labelledby={labelId}>
      {LAYOUTS.map((layout) => (
        <label key={layout.id} className={`layout-option ${value === layout.id ? 'is-checked' : ''}`} title={layout.hint}>
          <input type="radio" name="collage-layout" value={layout.id} checked={value === layout.id} onChange={() => onChange(layout.id)} />
          <MiniLayout layoutId={layout.id} />
          <span>{layout.label}</span>
        </label>
      ))}
    </div>
  )
}

function swatchStyle(bg) {
  const tileUrl = backgroundTileUrl(bg)
  return { backgroundColor: bg.paper, ...(tileUrl ? { backgroundImage: `url("${tileUrl}")` } : {}) }
}

function BackgroundPicker({ value, onChange, labelId }) {
  return (
    <div className="bg-picker" role="radiogroup" aria-labelledby={labelId}>
      {BACKGROUND_GROUPS.map((group) => (
        <div key={group.id} className="bg-group">
          <span className="bg-group-label" aria-hidden="true">
            {group.label}
          </span>
          <div className="bg-swatches">
            {BACKGROUNDS.filter((bg) => bg.group === group.id).map((bg) => (
              <label key={bg.id} className={`bg-option ${value === bg.id ? 'is-checked' : ''}`}>
                <input type="radio" name="collage-background" value={bg.id} checked={value === bg.id} onChange={() => onChange(bg.id)} />
                <span className="bg-swatch" style={swatchStyle(bg)} aria-hidden="true" />
                <span>{bg.label}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function DesignPanel({ page, pageCount, actions }) {
  const layoutLabel = useId()
  const backgroundLabel = useId()
  const several = pageCount > 1
  return (
    <>
      <section className="inspector-section">
        <h3 id={layoutLabel}>Vorlage</h3>
        <LayoutPicker value={page.layout} onChange={actions.setLayout} labelId={layoutLabel} />
        <p className="field-hint">
          <strong>{layoutOf(page.layout).label}:</strong> {layoutOf(page.layout).hint}. Beim Wechsel bleiben alle Fotos auf
          der Seite – sie werden nur neu verteilt.
        </p>
        {(several || page.layout === 'timeline') && (
          <div className="inspector-buttons">
            {page.layout === 'timeline' && (
              <button type="button" className="btn btn-ghost" onClick={actions.sortByDate}>
                <Icon name="sort" /> Nach Datum sortieren
              </button>
            )}
            {several && (
              <button type="button" className="btn btn-ghost" onClick={() => actions.applyToAll({ layout: page.layout })}>
                <Icon name="copy" /> Vorlage für alle Seiten
              </button>
            )}
          </div>
        )}
      </section>
      <section className="inspector-section">
        <h3 id={backgroundLabel}>Hintergrund</h3>
        <BackgroundPicker value={page.background} onChange={actions.setBackground} labelId={backgroundLabel} />
        {several && (
          <div className="inspector-buttons">
            <button type="button" className="btn btn-ghost" onClick={() => actions.applyToAll({ background: page.background })}>
              <Icon name="copy" /> Hintergrund für alle Seiten
            </button>
          </div>
        )}
      </section>
    </>
  )
}
