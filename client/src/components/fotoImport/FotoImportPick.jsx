import { useId } from 'react'
import Icon from '../Icon.jsx'
import { IMPORT_TEXT } from '../../lib/fotoImport/texts.js'
import { t } from '../../lib/i18n/index.js'

// Wahlmöglichkeit als Etikett um ein verstecktes Dateifeld (wie das Fotofeld der Erinnerung).
function PickOption({ icon, label, inputProps, onFiles, primary, desktopOnly }) {
  const id = useId()
  function handleChange(event) {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    if (files.length > 0) onFiles(files)
  }
  return (
    <label className={`btn ${primary ? 'btn-primary' : 'btn-ghost'} foto-import-pick${desktopOnly ? ' is-desktop-only' : ''}`} htmlFor={id}>
      <Icon name={icon} />
      {label}
      <input id={id} className="visually-hidden" type="file" onChange={handleChange} {...inputProps} />
    </label>
  )
}

// Schritt 1: Fotos, ein Ordner (nur am Computer sinnvoll - webkitdirectory) oder eine ZIP-Datei aus Google Fotos
// (Download oder Takeout - beides liest lib/fotoImport/takeout.js).
export default function FotoImportPick({ reading, error, onFiles }) {
  return (
    <div className="foto-import-step">
      <p>{t(IMPORT_TEXT.intro)}</p>
      <p className="field-hint">{t(IMPORT_TEXT.privacy)}</p>
      {reading ? (
        <p className="foto-import-status" role="status">
          {t(IMPORT_TEXT.reading)}
        </p>
      ) : (
        <div className="foto-import-picks">
          <PickOption primary icon="image" label={t(IMPORT_TEXT.pickPhotos)} onFiles={onFiles} inputProps={{ accept: 'image/*', multiple: true }} />
          <PickOption desktopOnly icon="layers" label={t(IMPORT_TEXT.pickFolder)} onFiles={onFiles} inputProps={{ webkitdirectory: '', directory: '', multiple: true }} />
          <PickOption icon="download" label={t(IMPORT_TEXT.pickZip)} onFiles={onFiles} inputProps={{ accept: '.zip,application/zip' }} />
        </div>
      )}
      {!reading && <p className="field-hint foto-import-howto">{t(IMPORT_TEXT.howTo)}</p>}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
