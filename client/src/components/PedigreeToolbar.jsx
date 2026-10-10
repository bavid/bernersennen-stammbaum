import Icon from './Icon.jsx'
import { useTheme } from '../themes/ThemeProvider.jsx'
import { MAX_ZOOM, MIN_ZOOM } from '../lib/zoom.js'
import { t } from '../lib/i18n/index.js'

// Ansicht des Stammbaums: zoomen, einpassen, Vorfahren kompakt, Vollbild. Name aus den Wörtern (Phase U: "Familienbande").
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
      <span className="pedigree-hint">{t('Ziehen zum Verschieben · Strg + Mausrad zum Zoomen')}</span>
      <div className="zoom-group">
        <button type="button" className="tool-btn" onClick={onZoomOut} disabled={zoom <= MIN_ZOOM} aria-label={t('Verkleinern')} title={t('Verkleinern')}>
          <Icon name="minus" />
        </button>
        <button type="button" className="tool-btn zoom-value" onClick={onReset} title={t('Auf 100 % zurücksetzen')} aria-label={t('Zoom {n} %, auf 100 % zurücksetzen', { n: Math.round(zoom * 100) })}>
          {Math.round(zoom * 100)} %
        </button>
        <button type="button" className="tool-btn" onClick={onZoomIn} disabled={zoom >= MAX_ZOOM} aria-label={t('Vergrößern')} title={t('Vergrößern')}>
          <Icon name="plus" />
        </button>
      </div>
      <button type="button" className="tool-btn tool-btn-label" onClick={onFit} aria-label={t('Einpassen')} title={words.treeFit}>
        <Icon name="fit" /> <span>{t('Einpassen')}</span>
      </button>
      {canCompact && (
        <button
          type="button"
          className="tool-btn tool-btn-label"
          onClick={onToggleCompact}
          aria-pressed={compact}
          aria-label={t('Vorfahren kompakt')}
          title={compact ? t('Alle Generationen voll zeigen') : t('Ältere Generationen nur mit Porträt und Namen zeigen')}
        >
          <Icon name="layers" /> <span>{t('Kompakt')}</span>
        </button>
      )}
      <button
        type="button"
        className="tool-btn tool-btn-label"
        onClick={onToggleExpand}
        aria-pressed={expanded}
        aria-label={expanded ? t('Vollbild schließen') : t('Vollbild')}
      >
        <Icon name={expanded ? 'shrink' : 'expand'} /> <span>{expanded ? t('Schließen') : t('Vollbild')}</span>
      </button>
    </div>
  )
}
