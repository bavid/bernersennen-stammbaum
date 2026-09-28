import Icon from '../Icon.jsx'
import ConfirmButton from '../ConfirmButton.jsx'
import { useTheme } from '../../themes/ThemeProvider.jsx'
import { MAX_ZOOM, MIN_ZOOM, clampZoom } from '../../lib/collage/layout.js'

function PageTexts({ page, onChange }) {
  const field = (key, label, placeholder) => (
    <div className="field">
      <label className="field-label" htmlFor={`cpage-${key}`}>
        {label}
      </label>
      <input
        id={`cpage-${key}`}
        value={page[key]}
        placeholder={placeholder}
        maxLength={160}
        onChange={(e) => onChange({ [key]: e.target.value })}
      />
    </div>
  )
  return (
    <section className="inspector-section">
      <h3>Seite</h3>
      {field('title', 'Titel', 'z. B. Hermes')}
      {field('subtitle', 'Untertitel', 'z. B. Berner-Mix · geboren am 14. Mai 2026')}
      {field('footer', 'Fußzeile', 'z. B. Mutter: Trude · Vater: Bruno')}
    </section>
  )
}

function PhotoControls({ page, photo, onChange, onMove, onRemove }) {
  const index = page.photos.findIndex((p) => p.id === photo.id)
  const reset = { focusX: 0.5, focusY: 0.5, zoom: 1 }
  return (
    <section className="inspector-section inspector-photo">
      <h3>Ausgewähltes Foto</h3>
      <div className="field">
        <label className="field-label" htmlFor="cphoto-caption">
          Bildunterschrift
        </label>
        <input
          id="cphoto-caption"
          value={photo.caption}
          placeholder="leer = keine Unterschrift"
          maxLength={120}
          onChange={(e) => onChange({ caption: e.target.value })}
        />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="cphoto-zoom">
          Zoom · {Math.round(photo.zoom * 100)} %
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
        <span className="field-hint">Im Bild ziehen verschiebt den Ausschnitt.</span>
      </div>
      <div className="inspector-buttons">
        <button type="button" className="btn btn-ghost" onClick={() => onMove(index - 1)} disabled={index === 0}>
          <Icon name="arrowLeft" /> Früher
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => onMove(index + 1)} disabled={index === page.photos.length - 1}>
          Später <Icon name="arrowLeft" className="icon-flip" />
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => onMove(0)} disabled={index === 0}>
          <Icon name="star" /> Als Hauptbild
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => onChange(reset)}>
          Ausschnitt zurücksetzen
        </button>
      </div>
      <button type="button" className="btn btn-danger" onClick={onRemove}>
        <Icon name="trash" /> Von der Seite entfernen
      </button>
    </section>
  )
}

function PhotoTray({ photos, onAdd }) {
  const { words } = useTheme()
  return (
    <section className="inspector-section">
      <h3>Fotos hinzufügen</h3>
      {photos.length === 0 ? (
        <p className="field-hint">Alle Fotos der gewählten {words.animals} sind schon auf dieser Seite.</p>
      ) : (
        <div className="tray">
          {photos.map((photo) => (
            <button
              type="button"
              key={photo.url}
              className="tray-photo"
              onClick={() => onAdd(photo)}
              title={photo.caption || 'Foto hinzufügen'}
              aria-label={`Foto ${photo.caption || ''} zu dieser Seite hinzufügen`}
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

// Seitenleiste des Editors: Texte der Seite, ausgewähltes Foto, freie Fotos, Seite löschen.
export default function CollageInspector({
  page,
  selectedPhoto,
  trayPhotos,
  onPageChange,
  onPhotoChange,
  onMovePhoto,
  onRemovePhoto,
  onAddPhoto,
  onDeletePage,
  canDeletePage
}) {
  return (
    <aside className="inspector">
      <PageTexts page={page} onChange={onPageChange} />
      {selectedPhoto ? (
        <PhotoControls
          page={page}
          photo={selectedPhoto}
          onChange={(patch) => onPhotoChange(selectedPhoto.id, patch)}
          onMove={(to) => onMovePhoto(selectedPhoto.id, to)}
          onRemove={() => onRemovePhoto(selectedPhoto.id)}
        />
      ) : (
        <p className="inspector-tip">
          <Icon name="image" /> Klick ein Foto in der Vorschau an, um Ausschnitt, Zoom und Unterschrift zu bearbeiten.
        </p>
      )}
      <PhotoTray photos={trayPhotos} onAdd={onAddPhoto} />
      {canDeletePage && (
        <section className="inspector-section">
          <ConfirmButton onConfirm={onDeletePage} label="Diese Seite löschen" confirmLabel="Seite wirklich löschen?" />
        </section>
      )}
    </aside>
  )
}
