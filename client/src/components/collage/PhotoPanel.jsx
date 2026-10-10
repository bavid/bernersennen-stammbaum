import Icon from '../Icon.jsx'
import { useTheme } from '../../themes/ThemeProvider.jsx'
import { MAX_ZOOM, MIN_ZOOM, clampZoom } from '../../lib/collage/layout.js'
import { t } from '../../lib/i18n/index.js'

// Reiter "Fotos" im Collage-Editor: ausgewähltes Foto (Unterschrift, Zoom, Reihenfolge, Datum am Zeitstrahl)
// und die Ablage mit weiteren Fotos der gewählten Tiere.
function PhotoControls({ page, photo, onChange, onMove, onRemove }) {
  const index = page.photos.findIndex((p) => p.id === photo.id)
  const reset = { focusX: 0.5, focusY: 0.5, zoom: 1 }
  return (
    <section className="inspector-section inspector-photo">
      <h3>{t('Ausgewähltes Foto')}</h3>
      <div className="field">
        <label className="field-label" htmlFor="cphoto-caption">
          {t('Bildunterschrift')}
        </label>
        <input
          id="cphoto-caption"
          value={photo.caption}
          placeholder={t('leer = keine Unterschrift')}
          maxLength={120}
          onChange={(e) => onChange({ caption: e.target.value })}
        />
      </div>
      {page.layout === 'timeline' && (
        <div className="field">
          <label className="field-label" htmlFor="cphoto-date">
            {t('Datum am Zeitstrahl')}
          </label>
          <input id="cphoto-date" type="date" value={photo.date || ''} onChange={(e) => onChange({ date: e.target.value })} />
        </div>
      )}
      <div className="field">
        <label className="field-label" htmlFor="cphoto-zoom">
          {t('Zoom · {n} %', { n: Math.round(photo.zoom * 100) })}
        </label>
        <input
          id="cphoto-zoom"
          type="range"
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step="0.05"
          value={photo.zoom}
          onChange={(e) => onChange({ zoom: clampZoom(e.target.value) })}
        />
        <span className="field-hint">{t('Im Bild ziehen verschiebt den Ausschnitt.')}</span>
      </div>
      <div className="inspector-buttons">
        <button type="button" className="btn btn-ghost" onClick={() => onMove(index - 1)} disabled={index === 0}>
          <Icon name="arrowLeft" /> {t('Früher')}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => onMove(index + 1)} disabled={index === page.photos.length - 1}>
          {t('Später')} <Icon name="arrowLeft" className="icon-flip" />
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => onMove(0)} disabled={index === 0}>
          <Icon name="star" /> {t('Als Hauptbild')}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => onChange(reset)}>
          {t('Ausschnitt zurücksetzen')}
        </button>
      </div>
      <button type="button" className="btn btn-danger" onClick={onRemove}>
        <Icon name="trash" /> {t('Von der Seite entfernen')}
      </button>
    </section>
  )
}

function PhotoTray({ photos, onAdd }) {
  const { words } = useTheme()
  return (
    <section className="inspector-section">
      <h3>{t('Fotos hinzufügen')}</h3>
      {photos.length === 0 ? (
        <p className="field-hint">{t('Alle Fotos der gewählten {animals} sind schon auf dieser Seite.', { animals: words.animals })}</p>
      ) : (
        <div className="tray">
          {photos.map((photo) => (
            <button
              type="button"
              key={photo.url}
              className="tray-photo"
              onClick={() => onAdd(photo)}
              title={photo.caption || t('Foto hinzufügen')}
              aria-label={t('Foto {caption} zu dieser Seite hinzufügen', { caption: photo.caption || '' })}
            >
              <img src={photo.url} alt="" loading="lazy" />
              <span className="tray-plus">
                <Icon name="plus" />
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

export default function PhotoPanel({ page, selectedPhoto, trayPhotos, actions }) {
  return (
    <>
      {selectedPhoto ? (
        <PhotoControls
          page={page}
          photo={selectedPhoto}
          onChange={(patch) => actions.updatePhoto(selectedPhoto.id, patch)}
          onMove={(to) => actions.movePhoto(selectedPhoto.id, to)}
          onRemove={() => actions.removePhoto(selectedPhoto.id)}
        />
      ) : (
        <p className="inspector-tip">
          <Icon name="image" /> {t('Klick ein Foto in der Vorschau an, um Ausschnitt, Zoom und Unterschrift zu bearbeiten.')}
        </p>
      )}
      <PhotoTray photos={trayPhotos} onAdd={actions.addPhoto} />
    </>
  )
}
