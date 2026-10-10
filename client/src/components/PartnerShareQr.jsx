import { useMemo, useState } from 'react'
import Icon from './Icon.jsx'
import { qrFileName, qrSvgMarkup } from '../lib/partnerShare.js'
import { t } from '../lib/i18n/index.js'
import { Button } from './ui/index.js'

// Kantenlänge der PNG-Datei - groß genug für Druck (Flyer, Visitenkarte), die Module bleiben scharf.
const PNG_SIZE = 1024
// Die Download-URL erst nach einer Sekunde freigeben - manche Browser (Safari) brechen sonst ab.
const REVOKE_DELAY_MS = 1000

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS)
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Bild nicht lesbar'))
    image.src = url
  })
}

// Das SVG auf ein Canvas zeichnen und als PNG ausgeben (alles im Browser, nichts geht an einen Server).
async function svgToPng(markup) {
  const svgUrl = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }))
  try {
    const image = await loadImage(svgUrl)
    const canvas = document.createElement('canvas')
    canvas.width = PNG_SIZE
    canvas.height = PNG_SIZE
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Kein Canvas')
    context.imageSmoothingEnabled = false
    context.drawImage(image, 0, 0, PNG_SIZE, PNG_SIZE)
    return await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Kein PNG'))), 'image/png')
    })
  } finally {
    URL.revokeObjectURL(svgUrl)
  }
}

// QR-Code der Portal-Adresse mit Download als SVG (Druckerei, beliebig skalierbar) und PNG (Social Media,
// Office). Angezeigt wird genau die Datei, die man herunterlädt (als data:-Bild) - so lässt sich der Code
// auch direkt vom Bildschirm scannen.
export default function PartnerShareQr({ url, slug }) {
  const markup = useMemo(() => qrSvgMarkup(url), [url])
  const imageUrl = useMemo(() => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`, [markup])
  const [error, setError] = useState(null)

  function downloadSvg() {
    setError(null)
    downloadBlob(new Blob([markup], { type: 'image/svg+xml' }), qrFileName(slug, 'svg'))
  }

  async function downloadPng() {
    setError(null)
    try {
      downloadBlob(await svgToPng(markup), qrFileName(slug, 'png'))
    } catch {
      setError(t('Das PNG ließ sich in diesem Browser nicht erzeugen – nehmt bitte die SVG-Datei.'))
    }
  }

  return (
    <div className="partner-share-qr">
      <img src={imageUrl} alt={t('QR-Code, öffnet {url}', { url })} className="partner-share-qr-code" width={160} height={160} />
      <div className="partner-share-qr-actions">
        <Button type="button" variant="ghost" onClick={downloadSvg}>
          <Icon name="download" />
          {t('QR-Code herunterladen (SVG)')}
        </Button>
        <Button type="button" variant="ghost" onClick={downloadPng}>
          <Icon name="download" />
          {t('Als PNG')}
        </Button>
        <p className="field-hint">{t('SVG für Flyer und Druck, PNG für Social Media.')}</p>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
