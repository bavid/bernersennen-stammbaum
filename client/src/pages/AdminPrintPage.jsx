import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { api } from '../api'
import Icon from '../components/Icon.jsx'
import VoucherPrintView, { usePrintBodyClass, useVoucherPrint } from '../components/VoucherPrintView.jsx'
import { DESIGN } from '../lib/voucherPrint.js'
import { Button } from '../components/ui/index.js'

// Druckseite eines Gutschein-Stapels (Phase 5 Task 2): /admin/gutscheine/:id/druck, als eigener Chunk aus
// App.jsx. Nur mit Admin-Sitzung - ohne geht es zurück zu /admin (dort steht der Login). Die Klartext-Codes
// kommen von api.admin.printBatch (Server: no-store); Aufbau und Karten teilt sich die Seite mit der Druckseite
// der Partner (components/VoucherPrintView.jsx) - hier zusätzlich der CSV-Export ohne Codes.

const DESIGN_LABEL = {
  [DESIGN.customer]: 'Kunden-Karte',
  [DESIGN.partner]: 'Partner-Stapel-Karte',
  [DESIGN.access]: 'Partner-Zugangs-Karte'
}

const BACK = { to: '/admin', label: 'Zurück zum Admin' }

export { PRINT_BODY_CLASS } from '../components/VoucherPrintView.jsx'

const designLabel = (design) => DESIGN_LABEL[design]

export default function AdminPrintPage({ batchId }) {
  const [admin, setAdmin] = useState(undefined)
  usePrintBodyClass()

  useEffect(() => {
    api.admin
      .me()
      .then(setAdmin)
      .catch(() => setAdmin(null))
  }, [])

  // Druckdaten und Konfiguration erst mit bestätigter Sitzung.
  const state = useVoucherPrint({ load: () => api.admin.printBatch(batchId), ready: Boolean(admin), key: batchId })

  if (admin === undefined) return <div className="splash" aria-busy="true" />
  if (!admin) return <Navigate to="/admin" replace />

  const csvLink = (
    <Button href={api.admin.voucherCsvUrl(batchId)} download variant="ghost">
      <Icon name="download" /> CSV herunterladen
    </Button>
  )

  // Audit V7a: "Drucken" meldet den Druck - erst dann gelten die Codes als gedruckt.
  const markPrinted = (ids) => api.admin.markPrinted(batchId, ids)

  return <VoucherPrintView state={state} back={BACK} actions={csvLink} designLabel={designLabel} markPrinted={markPrinted} />
}
