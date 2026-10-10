import { useEffect, useState } from 'react'
import { api } from '../../api'
import Modal from '../Modal.jsx'
import Icon from '../Icon.jsx'
import { Button } from '../ui/index.js'
import { grussKarteModel } from '../../lib/grusskarte.js'
import { downloadBlob, shareFile, shareableFile } from '../../lib/grusskarteShare.js'
import { t } from '../../lib/i18n/index.js'
import '../../styles/grusskarte.css'

// PUBLIC_URL aus /api/config (für den QR-Code); scheitert die Anfrage, gilt der Ursprung dieser Seite.
async function loadPublicUrl() {
  try {
    const config = await api.config()
    return config?.publicUrl || null
  } catch {
    return null
  }
}

// Karte bauen, sobald der Dialog offen ist. state: { status: 'loading' | 'ready' | 'error', blob, preview, withPhoto, model }
function useCard(entry, dogName) {
  const [state, setState] = useState({ status: 'loading' })
  useEffect(() => {
    if (!entry) return undefined
    let cancelled = false
    let preview = null
    setState({ status: 'loading' })
    ;(async () => {
      try {
        const publicUrl = await loadPublicUrl()
        const model = grussKarteModel({ entry, dogName, publicUrl, origin: window.location.origin })
        // Zeichnen und QR erst laden, wenn jemand eine Karte möchte (eigener Chunk).
        const { renderCard } = await import('../../lib/grusskarteCanvas.js')
        const { blob, withPhoto } = await renderCard(model)
        if (cancelled) return
        preview = URL.createObjectURL(blob)
        setState({ status: 'ready', blob, preview, withPhoto, model })
      } catch {
        if (!cancelled) setState({ status: 'error' })
      }
    })()
    return () => {
      cancelled = true
      if (preview) URL.revokeObjectURL(preview)
    }
  }, [entry, dogName])
  return state
}

function CardActions({ card, onDone }) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const file = shareableFile(card.blob, card.model.fileName)

  async function handleShare() {
    setBusy(true)
    setFailed(false)
    try {
      if (await shareFile(file)) onDone()
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {failed && <p className="grusskarte-error">{t('Teilen hat nicht geklappt. Speichere das Bild und teile es selbst.')}</p>}
      <div className="grusskarte-actions">
        {file && (
          <Button onClick={handleShare} disabled={busy}>
            <Icon name="share" />
            {t('Teilen')}
          </Button>
        )}
        <Button variant={file ? 'ghost' : 'primary'} onClick={() => downloadBlob(card.blob, card.model.fileName)}>
          <Icon name="download" />
          {t('Bild speichern')}
        </Button>
      </div>
    </>
  )
}

// „Als Karte teilen“: Vorschau der Grüße-Karte zu einer Erinnerung, dann Teilen (Handy) oder Bild speichern.
// Das Bild entsteht nur auf dem Gerät - es wird nichts hochgeladen.
export default function GrussKarteDialog({ entry, dogName, onClose }) {
  const card = useCard(entry, dogName)
  return (
    <Modal open={Boolean(entry)} title="Als Karte teilen" onClose={onClose} className="grusskarte-modal">
      {entry && (
        <div className="grusskarte">
          {card.status === 'loading' && <p className="muted grusskarte-status">{t('Die Karte entsteht …')}</p>}
          {card.status === 'error' && (
            <p className="grusskarte-error">{t('Die Karte ließ sich auf diesem Gerät nicht erstellen.')}</p>
          )}
          {card.status === 'ready' && (
            <>
              <img className="grusskarte-preview" src={card.preview} alt={t('Grüße-Karte: {title}', { title: card.model.title })} />
              {!card.withPhoto && entry.foto_urls?.length > 0 && (
                <p className="muted grusskarte-hint">{t('Das Foto ließ sich nicht einbinden – die Karte zeigt nur den Text.')}</p>
              )}
              {entry.privat ? (
                <p className="grusskarte-privat">
                  <Icon name="lock" />
                  {t('Diese Erinnerung ist privat. Wenn du die Karte teilst, verlässt das Bild die App.')}
                </p>
              ) : null}
              <CardActions card={card} onDone={onClose} />
              <p className="muted grusskarte-hint">{t('Das Bild entsteht nur auf deinem Gerät – nichts wird hochgeladen.')}</p>
            </>
          )}
        </div>
      )}
    </Modal>
  )
}
