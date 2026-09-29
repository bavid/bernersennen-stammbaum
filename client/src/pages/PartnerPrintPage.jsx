import { api } from '../api'
import VoucherPrintView, { usePrintBodyClass, useVoucherPrint } from '../components/VoucherPrintView.jsx'

// Druckseite eines Kunden-Gutschein-Stapels für den Partner (Phase 5 Task 4): /partner-drucken/:id, als eigener
// Chunk aus App.jsx - nur mit Sitzung in einem Partner- oder Tierheim-Bereich (App.jsx prüft das, ohne geht es
// zum Login bzw. zur Startseite des Bereichs). Die Klartext-Codes kommen von api.partnerArea.printBatch (Server:
// no-store, nur eigene Stapel) und leben nur im State und im DOM der Karten. Motiv: immer die Partner-Karte mit
// Logo, Farbstreifen und "überreicht von" (server/lib/voucherPrint.js printBatch mit dem eigenen Partner).

export const PARTNER_PRINT_HINT = 'Jede Karte legt für eure Kundschaft eine eigene Chronik an – und zeigt, dass sie von euch kommt.'
const DESIGN_LABEL = 'Kunden-Karte mit eurem Auftritt'
const BACK = { to: '/profil', label: 'Zurück zum Profil' }

const designLabel = () => DESIGN_LABEL

export default function PartnerPrintPage({ batchId }) {
  usePrintBodyClass()
  const state = useVoucherPrint({ load: () => api.partnerArea.printBatch(batchId), key: batchId })
  return <VoucherPrintView state={state} back={BACK} designLabel={designLabel} hint={PARTNER_PRINT_HINT} />
}
