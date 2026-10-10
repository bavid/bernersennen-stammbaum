import useSheetFit from '../hooks/useSheetFit.js'
import VoucherCard, { VoucherCardBack } from './VoucherCard.jsx'
import { t } from '../lib/i18n/index.js'

// A4-Bögen für die Druckseite (AdminPrintPage): je Bogen bis zu 10 Karten (lib/voucherPrint.js chunkCards),
// mit duplex hinter jedem Vorder-Bogen ein Rück-Bogen mit ebenso vielen Karten - so passen die Rückseiten
// beim beidseitigen Druck auf die Vorderseiten (print.css spiegelt dafür die Spaltenreihenfolge).

function FrontSheet({ codes, batch, baseUrl, number, total }) {
  return (
    <section className="voucher-sheet voucher-sheet-front" aria-label={t('Bogen {n} von {total}, Vorderseite', { n: number, total })}>
      <span className="voucher-sheet-label" aria-hidden="true">
        {t('Bogen {n}/{total} · Vorderseite', { n: number, total })}
      </span>
      <div className="voucher-sheet-grid">
        {codes.map((code) => (
          <VoucherCard key={code} code={code} batch={batch} baseUrl={baseUrl} />
        ))}
      </div>
    </section>
  )
}

function BackSheet({ count, batch, baseUrl, number, total }) {
  return (
    <section className="voucher-sheet voucher-sheet-back" aria-label={t('Bogen {n} von {total}, Rückseite', { n: number, total })}>
      <span className="voucher-sheet-label" aria-hidden="true">
        {t('Bogen {n}/{total} · Rückseite', { n: number, total })}
      </span>
      <div className="voucher-sheet-grid">
        {Array.from({ length: count }, (_, index) => (
          <VoucherCardBack key={index} batch={batch} baseUrl={baseUrl} />
        ))}
      </div>
    </section>
  )
}

export default function VoucherSheets({ sheets, batch, baseUrl, duplex }) {
  const total = sheets.length
  const fitRef = useSheetFit()
  return (
    <div ref={fitRef} className="voucher-sheets">
      {sheets.map((codes, index) => {
        const number = index + 1
        return (
          <FrontSheetPair key={number} codes={codes} batch={batch} baseUrl={baseUrl} number={number} total={total} duplex={duplex} />
        )
      })}
    </div>
  )
}

// Vorder- und (optional) Rückbogen als Paar, damit die Reihenfolge im DOM der Druckreihenfolge entspricht.
function FrontSheetPair({ codes, batch, baseUrl, number, total, duplex }) {
  return (
    <>
      <FrontSheet codes={codes} batch={batch} baseUrl={baseUrl} number={number} total={total} />
      {duplex && <BackSheet count={codes.length} batch={batch} baseUrl={baseUrl} number={number} total={total} />}
    </>
  )
}
