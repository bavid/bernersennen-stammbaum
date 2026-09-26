import Icon from './Icon.jsx'
import { MAX_ZOOM, MIN_ZOOM } from '../lib/zoom.js'

// Ansicht des Stammbaums: zoomen, einpassen, Vollbild
export default function PedigreeToolbar({ zoom, expanded, onZoomIn, onZoomOut, onReset, onFit, onToggleExpand }) {
  return (
    <div className="pedigree-toolbar" role="toolbar" aria-label="Stammbaum-Ansicht">
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
      <button type="button" className="tool-btn tool-btn-label" onClick={onFit} title="Ganzen Stammbaum zeigen">
        <Icon name="fit" /> <span>Einpassen</span>
      </button>
      <button type="button" className="tool-btn tool-btn-label" onClick={onToggleExpand} aria-pressed={expanded}>
        <Icon name={expanded ? 'shrink' : 'expand'} /> <span>{expanded ? 'Schließen' : 'Vollbild'}</span>
      </button>
    </div>
  )
}
