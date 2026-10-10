import { Button } from '../ui'
import { IMPORT_COUNT, IMPORT_TEXT, countText } from '../../lib/fotoImport/texts.js'
import { formatDateLong } from '../../lib/dates.js'
import { t } from '../../lib/i18n/index.js'

// Schritt 3: Fortschritt beim Hochladen, Abbrechen jederzeit (schon angelegte Erinnerungen bleiben).
export function FotoImportProgress({ progress, onCancel }) {
  return (
    <div className="foto-import-step">
      <p role="status">{t(IMPORT_TEXT.uploading, { done: Math.min(progress.done + 1, progress.total), total: progress.total })}</p>
      <progress className="foto-import-progress" max={progress.total || 1} value={progress.done} />
      <div className="form-actions foto-import-actions">
        <Button variant="ghost" onClick={onCancel}>
          {t(IMPORT_TEXT.cancel)}
        </Button>
      </div>
    </div>
  )
}

// Ergebnis: wie viele Erinnerungen, welche Tage fehlen (mit Grund) und „nochmal“ für genau diese.
export function FotoImportDone({ result, onRetry, onClose }) {
  const n = result.created.length
  return (
    <div className="foto-import-step">
      <p role="status">{t(countText(result.cancelled ? IMPORT_COUNT.cancelled : IMPORT_COUNT.done, n), { n })}</p>
      {result.errors.length > 0 && (
        <div className="foto-import-errors" role="alert">
          <p>{t(IMPORT_TEXT.errorsTitle)}</p>
          <ul>
            {result.errors.map((item) => (
              <li key={item.date}>
                {formatDateLong(item.date)}: {item.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="form-actions foto-import-actions">
        {(result.errors.length > 0 || result.cancelled) && (
          <Button variant="ghost" onClick={onRetry}>
            {t(IMPORT_TEXT.retry)}
          </Button>
        )}
        <Button onClick={onClose}>{t(IMPORT_TEXT.close)}</Button>
      </div>
    </div>
  )
}
