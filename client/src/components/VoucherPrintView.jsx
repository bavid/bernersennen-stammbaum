import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import Icon from './Icon.jsx'
import VoucherSheets from './VoucherSheets.jsx'
import { ADDRESS_PENDING_TEXT, cardDesign, chunkCards, needsPublicUrl, printAddressPending, printBaseUrl } from '../lib/voucherPrint.js'

// Druckansicht eines Gutschein-Stapels - geteilt zwischen der Druckseite des Admins (AdminPrintPage,
// /admin/gutscheine/:id/druck) und der des Partners (PartnerPrintPage, /partner-drucken/:id, Phase 5 Task 4):
// Werkzeugleiste (zurück, Vorder-/Rückseite, Drucken, dazu eigene Aktionen), Kopf mit Motiv und Anzahl, Warnung
// ohne öffentliche Domain und die A4-Bögen (VoucherSheets). Die Klartext-Codes leben nur im State der Seite und
// im DOM der Karten: kein localStorage, keine URL, keine Ausgabe in der Konsole.

// collage.css blendet beim Drucken die ganze App (#root) aus, weil die Collage ihre Seiten außerhalb
// davon druckt. Solange eine Druckseite offen ist, hebt print.css das über diese Klasse am <body> wieder auf.
export const PRINT_BODY_CLASS = 'has-voucher-print'

export function usePrintBodyClass() {
  useEffect(() => {
    document.body.classList.add(PRINT_BODY_CLASS)
    return () => document.body.classList.remove(PRINT_BODY_CLASS)
  }, [])
}

// Druckdaten (load: api.admin.printBatch bzw. api.partnerArea.printBatch) und Konfiguration (publicUrl, appEnv), sobald
// ready true ist. Fehlt die Konfiguration, bleibt es beim Ursprung der Seite (beim Admin mit Warnbanner) - die Karten
// sind davon unabhängig. key: wechselt der Stapel, lädt alles neu.
export function useVoucherPrint({ load, ready = true, key }) {
  const [print, setPrint] = useState(null)
  const [publicUrl, setPublicUrl] = useState(null)
  const [appEnv, setAppEnv] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!ready) return undefined
    let cancelled = false
    load()
      .then((result) => {
        if (!cancelled) setPrint(result)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
    api
      .config()
      .then((config) => {
        if (cancelled) return
        setPublicUrl(config.publicUrl || null)
        setAppEnv(config.appEnv || null)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
    // load ist eine Inline-Funktion des Aufrufers - key (Stapel-Id) und ready bestimmen, wann neu geladen wird.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, key])

  return { print, publicUrl, appEnv, error }
}

function pluralize(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`
}

// Nur für den Admin: PUBLIC_URL fehlt oder zeigt auf localhost/eine IP - die QR-Codes würden auf diese Adresse zeigen.
// Partner sehen stattdessen höchstens ADDRESS_PENDING_TEXT (PrintContent), nie eine Adresse.
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

// Audit V7a: der Druck wird ausdrücklich gemeldet - markPrinted(ids) (POST …/print/gedruckt) mit den Gutschein-Ids der
// Karten, einmal je geladenem Stapel: beim Knopf "Drucken" und ebenso, wenn der Druckdialog des Browsers anders geöffnet wird
// (beforeprint, z. B. Strg+P). Das Laden der Druckdaten (GET) ändert nichts. Ohne markPrinted (Demo, Admin-Ansicht) oder
// ohne Codes wird nichts gemeldet. Schlägt die Meldung fehl, sagt das ein Hinweis in der Werkzeugleiste (nicht im Druck).
function usePrintedReport(print, markPrinted) {
  const reported = useRef(false)
  const [reportError, setReportError] = useState(null)

  useEffect(() => {
    reported.current = false
    setReportError(null)
  }, [print])

  const report = useCallback(() => {
    const ids = Array.isArray(print?.ids) ? print.ids : []
    if (!markPrinted || reported.current || ids.length === 0) return
    reported.current = true
    setReportError(null)
    Promise.resolve()
      .then(() => markPrinted(ids))
      .catch((err) => {
        reported.current = false
        setReportError(err?.message || 'Unbekannter Fehler')
      })
  }, [print, markPrinted])

  useEffect(() => {
    window.addEventListener('beforeprint', report)
    return () => window.removeEventListener('beforeprint', report)
  }, [report])

  return { report, reportError }
}

// back: { to, label } - wohin "zurück" führt. actions: weitere Knöpfe/Links (z. B. der CSV-Export des Admins).
// onPrint: vor dem Druckdialog (meldet den Druck), reportError: Hinweis, wenn das Melden fehlschlug.
// printDisabled: solange die Plattform keine öffentliche Adresse hat (Partner-Druckseite in Produktion).
function PrintToolbar({ back, duplex, onDuplex, actions, onPrint, reportError, printDisabled = false }) {
  return (
    <div className="print-toolbar" role="toolbar" aria-label="Druckoptionen">
      <Link to={back.to} className="btn btn-ghost">
        <Icon name="arrowLeft" /> {back.label}
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
      {actions}
      <button
        type="button"
        className="btn btn-primary"
        disabled={printDisabled}
        onClick={() => {
          onPrint()
          window.print()
        }}
      >
        <Icon name="printer" /> Drucken
      </button>
      {reportError && (
        <p className="field-error print-toolbar-error" role="alert">
          Der Druck ließ sich nicht vermerken ({reportError}) – Karten mit diesen Codes nicht doppelt ausgeben.
        </p>
      )}
    </div>
  )
}

function PrintHead({ batch, codeCount, sheetCount, nichtDruckbar, schonGedruckt = 0, designLabel, hint }) {
  return (
    <header className="print-head">
      <span className="eyebrow">Karten mit Einladungscode</span>
      <h1>{batch.label}</h1>
      <p className="print-head-meta muted">
        <span className="pill">{designLabel(cardDesign(batch))}</span>
        {batch.partner && <span className="pill pill-rust">{batch.partner.name}</span>}
        <span>
          {pluralize(codeCount, 'Karte', 'Karten')} · {pluralize(sheetCount, 'Bogen', 'Bögen')}
        </span>
      </p>
      {hint && <p className="muted">{hint}</p>}
      {nichtDruckbar > 0 && (
        <p className="field-hint" role="note">
          {pluralize(nichtDruckbar, 'Code', 'Codes')} ohne druckbaren Code (eingelöst, widerrufen oder ohne Klartext)
        </p>
      )}
      {/* Phase V5: jeder gemeldete Druck wird vermerkt (gedruckt_at) - schon gedruckte Codes nicht doppelt ausgeben. */}
      {schonGedruckt > 0 && (
        <p className="field-hint" role="note">
          {schonGedruckt === codeCount ? 'Alle Codes' : `${schonGedruckt} der Codes`} wurden schon einmal gedruckt – Karten mit
          diesen Codes nicht doppelt ausgeben.
        </p>
      )}
    </header>
  )
}

// partner: die Druckseite des Partners - ohne technische Warnung; addressPending: noch keine öffentliche Adresse (dann
// nur der freundliche Satz und keine Karten, damit auch Strg+P nichts mit falschem QR-Ziel druckt).
function PrintContent({ print, publicUrl, duplex, designLabel, hint, partner, addressPending }) {
  const baseUrl = printBaseUrl(publicUrl, window.location.origin)
  const sheets = addressPending ? [] : chunkCards(print.codes)

  return (
    <>
      <PrintHead
        batch={print.batch}
        codeCount={print.codes.length}
        sheetCount={sheets.length}
        nichtDruckbar={print.nichtDruckbar}
        schonGedruckt={print.schonGedruckt}
        designLabel={designLabel}
        hint={hint}
      />
      {!partner && needsPublicUrl(publicUrl) && <PublicUrlWarning baseUrl={baseUrl} />}
      {addressPending ? (
        <p className="vk-note" role="status">
          <Icon name="clock" /> {ADDRESS_PENDING_TEXT}
        </p>
      ) : sheets.length === 0 ? (
        <p className="muted">Keine offenen Codes in diesem Stapel – nichts zu drucken.</p>
      ) : (
        <VoucherSheets sheets={sheets} batch={print.batch} baseUrl={baseUrl} duplex={duplex} />
      )}
    </>
  )
}

// state: Rückgabe von useVoucherPrint. designLabel: Beschriftung je Motiv (lib/voucherPrint.js DESIGN) für den
// Kopf. hint: optionaler Satz unter dem Titel (Partner-Druckseite). markPrinted: (ids) => Promise, meldet den Druck
// (Audit V7a) - null in schreibgeschützten Sitzungen. partner: die Druckseite des Partners (Feedback-Runde: keine
// technische Adresse; ohne öffentliche Adresse in Produktion wartet der Druck), readOnly: Demo bzw. Admin-Ansicht.
export default function VoucherPrintView({ state, back, actions = null, designLabel, hint = null, markPrinted = null, partner = false, readOnly = false }) {
  const [duplex, setDuplex] = useState(false)
  const { print, publicUrl, appEnv, error } = state
  const addressPending = partner && printAddressPending({ appEnv, publicUrl, readOnly })
  const { report, reportError } = usePrintedReport(print, addressPending ? null : markPrinted)

  if (!print && !error) {
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

  return (
    <div className="print-page">
      <PrintToolbar
        back={back}
        duplex={duplex}
        onDuplex={setDuplex}
        actions={actions}
        onPrint={report}
        reportError={reportError}
        printDisabled={addressPending}
      />
      <main className="print-main">
        {error ? (
          <div className="error-banner" role="alert">
            {error}
          </div>
        ) : (
          <PrintContent
            print={print}
            publicUrl={publicUrl}
            duplex={duplex}
            designLabel={designLabel}
            hint={hint}
            partner={partner}
            addressPending={addressPending}
          />
        )}
      </main>
    </div>
  )
}
