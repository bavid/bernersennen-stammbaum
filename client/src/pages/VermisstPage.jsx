import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import Icon from '../components/Icon.jsx'
import { Button, EmptyState } from '../components/ui'
import VermisstForm from '../components/vermisst/VermisstForm.jsx'
import VermisstSheet from '../components/vermisst/VermisstSheet.jsx'
import { usePrintBodyClass } from '../components/VoucherPrintView.jsx'
import { parseAreaId } from '../lib/areas.js'
import { downloadBlob, shareFile, shareableFile } from '../lib/grusskarteShare.js'
import { EMPTY_INPUTS, buildPoster, canMakePoster, pickPhotos } from '../lib/vermisst.js'
import { t } from '../lib/i18n/index.js'

// Druckseite „Vermisst“ (/tier/:id/vermisst, App.jsx: nur im Zuhause, ohne App-Hülle wie das Startpaket). Ein Suchplakat
// aus dem Profil; Ort, Zeit, Telefon und Chipnummer tippt man hier ein - sie bleiben im State der Seite, es gibt keinen
// Aufruf, der sie verschickt (nur getDog/listTimeline lesen). Kein Register, keine öffentliche Seite: TASSO und FINDEFIX.

export const DENIED_TEXT = 'Ein Suchplakat gibt es nur für eigene Tiere, die bei euch leben.'

function usePosterData(id) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => {
    let current = true
    if (!id) {
      setError(t('Dieses Tier gibt es hier nicht.'))
      return undefined
    }
    Promise.all([api.getDog(id), api.listTimeline(id).catch(() => [])])
      .then(([dog, entries]) => current && setData({ dog, entries }))
      .catch((err) => current && setError(err.message))
    return () => {
      current = false
    }
  }, [id])
  return { data, error }
}

function ShareButton({ poster }) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  async function handleShare() {
    setBusy(true)
    setFailed(false)
    try {
      const { renderPoster } = await import('../lib/vermisstCanvas.js')
      const blob = await renderPoster(poster)
      const fileName = `vermisst-${poster.name}.png`
      const file = shareableFile(blob, fileName)
      if (file) await shareFile(file)
      else downloadBlob(blob, fileName)
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <Button variant="ghost" disabled={busy} onClick={handleShare}>
        <Icon name="download" />
        {busy ? t('Erzeuge …') : t('Als Bild teilen')}
      </Button>
      {failed && <span role="alert">{t('Das Bild ging gerade nicht – bitte drucken.')}</span>}
    </>
  )
}

function Message({ children }) {
  return (
    <div className="print-page">
      <main className="print-main">{children}</main>
    </div>
  )
}

export default function VermisstPage({ dogId, family }) {
  usePrintBodyClass()
  const id = parseAreaId(dogId)
  const { data, error } = usePosterData(id)
  const [inputs, setInputs] = useState(EMPTY_INPUTS)
  const [chosen, setChosen] = useState(null)

  if (error) {
    return (
      <Message>
        <div className="error-banner" role="alert">
          {error}
        </div>
      </Message>
    )
  }
  if (!data) return <div className="print-page" aria-busy="true" />
  if (!canMakePoster(family, data.dog)) {
    return (
      <Message>
        <EmptyState icon="lock" title={t('Kein Zugriff')}>
          {t(DENIED_TEXT)}
        </EmptyState>
      </Message>
    )
  }

  const photos = pickPhotos(data.dog, data.entries)
  const photo = photos.includes(chosen) ? chosen : photos[0]
  const poster = buildPoster({ dog: data.dog, photo, inputs })
  return (
    <div className="print-page vermisst-page">
      <div className="print-toolbar">
        <Button variant="ghost" as={Link} to={`/tier/${id}`}>
          {t('Zurück zum Tier')}
        </Button>
        <span className="print-toolbar-spacer" />
        <ShareButton poster={poster} />
        <Button onClick={() => window.print()}>{t('Drucken')}</Button>
      </div>
      <main className="print-main">
        <header className="print-head">
          <h1>{t('Suchplakat für {name}', { name: poster.name })}</h1>
          <p className="print-head-meta">{t('Ein Blatt A4 zum Aushängen. Nichts wird hochgeladen oder veröffentlicht.')}</p>
          <VermisstForm photos={photos} selected={photo} name={poster.name} inputs={inputs} onSelectPhoto={setChosen} onChange={setInputs} />
        </header>
        <div className="voucher-sheets">
          <VermisstSheet poster={poster} />
        </div>
      </main>
    </div>
  )
}
