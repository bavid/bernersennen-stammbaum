import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { api } from '../api'
import Icon from '../components/Icon.jsx'
import VoucherSheets from '../components/VoucherSheets.jsx'
import { DESIGN, cardDesign, chunkCards, needsPublicUrl, printBaseUrl } from '../lib/voucherPrint.js'

// Druckseite eines Gutschein-Stapels (Phase 5 Task 2): /admin/gutscheine/:id/druck, als eigener Chunk aus
// App.jsx. Nur mit Admin-Sitzung - ohne geht es zurück zu /admin (dort steht der Login). Die Klartext-Codes
// kommen von api.admin.printBatch (Server: no-store) und leben nur im State dieser Seite und im DOM der
// Karten: kein localStorage, keine URL, keine Ausgabe in der Konsole.

const DESIGN_LABEL = {
  [DESIGN.customer]: 'Kunden-Karte',
  [DESIGN.partner]: 'Partner-Stapel-Karte',
  [DESIGN.access]: 'Partner-Zugangs-Karte'
}

// collage.css blendet beim Drucken die ganze App (#root) aus, weil die Collage ihre Seiten außerhalb
// davon druckt. Solange diese Seite offen ist, hebt print.css das über diese Klasse am <body> wieder auf.
export const PRINT_BODY_CLASS = 'has-voucher-print'

function pluralize(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`
}

// PUBLIC_URL fehlt oder zeigt auf localhost/eine IP: die QR-Codes würden auf diese Adresse zeigen.
function PublicUrlWarning({ baseUrl }) {
  return (
    <div className="warning-banner" role="alert">
      <Icon name="alert" />
      <div>
        <strong>Vor dem Druck die öffentliche Domain setzen (PUBLIC_URL)</strong>
        <p>
          Sonst zeigen die QR-Codes auf diese Adresse: <code>{baseUrl}</code>
        </p>
      </div>
    </div>
  )
}

function PrintToolbar({ batchId, duplex, onDuplex }) {
  return (
    <div className="print-toolbar" role="toolbar" aria-label="Druckoptionen">
      <Link to="/admin" className="btn btn-ghost">
        <Icon name="arrowLeft" /> Zurück zum Admin
      </Link>
      <span className="print-toolbar-spacer" />
      <div className="segmented segmented-sm" role="group" aria-label="Seiten">
        <button type="button" aria-pressed={!duplex} onClick={() => onDuplex(false)}>
          Nur Vorderseite
        </button>
        <button type="button" aria-pressed={duplex} onClick={() => onDuplex(true)}>
          Vorder- und Rückseite
        </button>
      </div>
      <a href={api.admin.voucherCsvUrl(batchId)} download className="btn btn-ghost">
        <Icon name="download" /> CSV herunterladen
      </a>
      <button type="button" className="btn btn-primary" onClick={() => window.print()}>
        <Icon name="printer" /> Drucken
      </button>
    </div>
  )
}

function PrintHead({ batch, codeCount, sheetCount, nichtDruckbar }) {
  return (
    <header className="print-head">
      <span className="eyebrow">Gutschein-Karten</span>
      <h1>{batch.label}</h1>
      <p className="print-head-meta muted">
        <span className="pill">{DESIGN_LABEL[cardDesign(batch)]}</span>
        {batch.partner && <span className="pill pill-rust">{batch.partner.name}</span>}
        <span>
          {pluralize(codeCount, 'Karte', 'Karten')} · {pluralize(sheetCount, 'Bogen', 'Bögen')}
        </span>
      </p>
      {nichtDruckbar > 0 && (
        <p className="field-hint" role="note">
          {pluralize(nichtDruckbar, 'Gutschein', 'Gutscheine')} ohne druckbaren Code (eingelöst, widerrufen oder ohne Klartext)
        </p>
      )}
    </header>
  )
}

function PrintContent({ batchId, print, publicUrl, duplex, onDuplex }) {
  const baseUrl = printBaseUrl(publicUrl, window.location.origin)
  const sheets = chunkCards(print.codes)

  return (
    <div className="print-page">
      <PrintToolbar batchId={batchId} duplex={duplex} onDuplex={onDuplex} />
      <main className="print-main">
        <PrintHead batch={print.batch} codeCount={print.codes.length} sheetCount={sheets.length} nichtDruckbar={print.nichtDruckbar} />
        {needsPublicUrl(publicUrl) && <PublicUrlWarning baseUrl={baseUrl} />}
        {sheets.length === 0 ? (
          <p className="muted">Keine offenen Gutscheine in diesem Stapel – nichts zu drucken.</p>
        ) : (
          <VoucherSheets sheets={sheets} batch={print.batch} baseUrl={baseUrl} duplex={duplex} />
        )}
      </main>
    </div>
  )
}

export default function AdminPrintPage({ batchId }) {
  const [admin, setAdmin] = useState(undefined)
  const [print, setPrint] = useState(null)
  const [publicUrl, setPublicUrl] = useState(null)
  const [error, setError] = useState(null)
  const [duplex, setDuplex] = useState(false)

  useEffect(() => {
    api.admin
      .me()
      .then(setAdmin)
      .catch(() => setAdmin(null))
  }, [])

  useEffect(() => {
    document.body.classList.add(PRINT_BODY_CLASS)
    return () => document.body.classList.remove(PRINT_BODY_CLASS)
  }, [])

  // Druckdaten und Konfiguration erst mit bestätigter Sitzung. Fehlt die Konfiguration, bleibt es beim
  // Ursprung der Seite (mit Warnbanner) - die Karten sind davon unabhängig.
  useEffect(() => {
    if (!admin) return undefined
    let cancelled = false
    api.admin
      .printBatch(batchId)
      .then((result) => {
        if (!cancelled) setPrint(result)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
    api
      .config()
      .then((config) => {
        if (!cancelled) setPublicUrl(config.publicUrl || null)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [admin, batchId])

  if (admin === undefined) return <div className="splash" aria-busy="true" />
  if (!admin) return <Navigate to="/admin" replace />

  if (error) {
    return (
      <div className="print-page">
        <PrintToolbar batchId={batchId} duplex={duplex} onDuplex={setDuplex} />
        <main className="print-main">
          <div className="error-banner" role="alert">
            {error}
          </div>
        </main>
      </div>
    )
  }

  if (!print) {
    return (
      <div className="print-page">
        <main className="print-main">
          <p className="muted page-loading" role="status">
            Lade …
          </p>
        </main>
      </div>
    )
  }

  return <PrintContent batchId={batchId} print={print} publicUrl={publicUrl} duplex={duplex} onDuplex={setDuplex} />
}
