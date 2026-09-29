import Icon from './Icon.jsx'
import { useTheme } from '../themes/ThemeProvider.jsx'
import { MAX_ZOOM, MIN_ZOOM } from '../lib/zoom.js'

// Ansicht des Stammbaums: zoomen, einpassen, Vorfahren kompakt, Vollbild. Name je Auftritt (Phase U: Standard
// "Familienbande", Berner "Stammbaum").
export default function PedigreeToolbar({
  zoom,
  expanded,
  compact,
  canCompact,
  onZoomIn,
  onZoomOut,
  onReset,
  onFit,
  onToggleCompact,
  onToggleExpand
}) {
  const { words } = useTheme()
  return (
    <div className="pedigree-toolbar" role="toolbar" aria-label={words.treeView}>
      <span className="pedigree-hint">Ziehen zum Verschieben · Strg + Mausrad zum Zoomen</span>
      <div className="zoom-group">
        <button type="button" className="tool-btn" onClick={onZoomOut} disabled={zoom <= MIN_ZOOM} aria-label="Verkleinern" title="Verkleinern">
          <Icon name="minus" />
        </button>
        <button type="button" className="tool-btn zoom-value" onClick={onReset} title="Auf 100 % zurücksetzen" aria-label={`Zoom ${Math.round(zoom * 100)} %, auf 100 % zurücksetzen`}>
          {Math.round(zoom * 100)} %
        </button>
        <button type="button" className="tool-btn" onClick={onZoomIn} disabled={zoom >= MAX_ZOOM} aria-label="Vergrößern" title="Vergrößern">
          <Icon name="plus" />
        </button>
      </div>
      <button type="button" className="tool-btn tool-btn-label" onClick={onFit} aria-label="Einpassen" title={words.treeFit}>
        <Icon name="fit" /> <span>Einpassen</span>
      </button>
      {canCompact && (
        <button
          type="button"
          className="tool-btn tool-btn-label"
          onClick={onToggleCompact}
          aria-pressed={compact}
          aria-label="Vorfahren kompakt"
          title={compact ? 'Alle Generationen voll zeigen' : 'Ältere Generationen nur mit Porträt und Namen zeigen'}
        >
          <Icon name="layers" /> <span>Kompakt</span>
        </button>
      )}
      <button
        type="button"
        className="tool-btn tool-btn-label"
        onClick={onToggleExpand}
        aria-pressed={expanded}
        aria-label={expanded ? 'Vollbild schließen' : 'Vollbild'}
      >
        <Icon name={expanded ? 'shrink' : 'expand'} /> <span>{expanded ? 'Schließen' : 'Vollbild'}</span>
      </button>
    </div>
  )
}
