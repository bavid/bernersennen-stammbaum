import { api } from '../api'
import VoucherPrintView, { usePrintBodyClass, useVoucherPrint } from '../components/VoucherPrintView.jsx'
import { profileTabRoute } from '../lib/partnerProfile.js'

// Druckseite eines Kunden-Gutschein-Stapels für den Partner (Phase 5 Task 4): /partner-drucken/:id, als eigener
// Chunk aus App.jsx - nur mit Sitzung in einem Partner- oder Tierheim-Bereich (App.jsx prüft das, ohne geht es
// zum Login bzw. zur Startseite des Bereichs). Die Klartext-Codes kommen von api.partnerArea.printBatch (Server:
// no-store, nur eigene Stapel) und leben nur im State und im DOM der Karten. Motiv: immer die Partner-Karte mit
// Logo, Farbstreifen und "überreicht von" (server/lib/voucherPrint.js printBatch mit dem eigenen Partner).
// Audit V7a: "Drucken" meldet den Druck (api.partnerArea.markPrinted) - nicht in Demo und Admin-Ansicht (readOnly), die
// nur lesen.

export const PARTNER_PRINT_HINT = 'Jede Karte legt für eure Kundschaft eine eigene Chronik an – und zeigt, dass sie von euch kommt.'
// Audit V7a: in der Demo sehen die Codes echt aus (die Visitenkarten zeigen "MUSTER") - sagen, dass sie nicht gelten.
export const DEMO_PRINT_HINT = 'Demo: Beispiel-Codes – sie lassen sich nicht einlösen.'
const DESIGN_LABEL = 'Kunden-Karte mit eurem Auftritt'
// Audit V7a: zurück in den Reiter "Teilen" mit den Kunden-Gutscheinen, aus dem man kommt.
const BACK = { to: profileTabRoute('teilen'), label: 'Zurück zum Profil' }

const designLabel = () => DESIGN_LABEL

export default function PartnerPrintPage({ batchId, readOnly = false, demo = false }) {
  usePrintBodyClass()
  const state = useVoucherPrint({ load: () => api.partnerArea.printBatch(batchId), key: batchId })
  const markPrinted = readOnly ? null : (ids) => api.partnerArea.markPrinted(batchId, ids)
  return <VoucherPrintView state={state} back={BACK} designLabel={designLabel} hint={demo ? `${PARTNER_PRINT_HINT} ${DEMO_PRINT_HINT}` : PARTNER_PRINT_HINT} markPrinted={markPrinted} />
}
