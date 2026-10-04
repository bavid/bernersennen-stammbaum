import { useState } from 'react'
import VoucherRow from './VoucherRow.jsx'
import VoucherArchive from './VoucherArchive.jsx'
import VoucherCreateBar from './VoucherCreateBar.jsx'

export const PRINTED_HINT = '„gedruckt“: Der Code steht schon auf gedruckten Karten – bitte nicht noch einmal weitergeben.'

// Die eigenen Codes eines Bereichs (Phase V2b, useVoucherList) - im Einladen-Dialog je nach Zweck gefiltert (Phase W,
// Schritt 2: Besuchs-Codes und Einladungscodes getrennt). list: useVoucherList(); vouchers/archive: die gezeigten
// Ausschnitte; canCreate: "Neuen Code erstellen"; roleOptions (Familie): Rolle je Einladung; canModerate: fremde Codes
// zurückziehen; own: Zahl im Archiv als "Du hast …"; emptyText: ohne offene Codes.
export default function CodeList({ list, vouchers, archive, canCreate, roleOptions = [], canModerate, own, disabled, emptyText }) {
  const [archiveOpen, setArchiveOpen] = useState(false)
  return (
    <>
      {list.error && (
        <div className="error-banner" role="alert">
          {list.error}
        </div>
      )}
      {canCreate && <VoucherCreateBar limit={list.limit} busy={list.creating} disabled={disabled} onCreate={list.create} />}
      {vouchers === undefined && !list.error && <p className="muted">Lade …</p>}
      {vouchers && vouchers.length === 0 && emptyText && <p className="muted">{emptyText}</p>}
      {vouchers && vouchers.length > 0 && (
        <ul className="voucher-list">
          {vouchers.map((voucher) => (
            <VoucherRow
              key={voucher.id}
              voucher={voucher}
              roleOptions={roleOptions}
              onRoleChange={list.setRole}
              onLabelChange={list.setLabel}
              onDelete={list.remove}
              canDelete={voucher.eigen || canModerate}
              disabled={disabled}
            />
          ))}
        </ul>
      )}
      {/* Phase V5: gedruckte Codes stehen schon auf Karten - die Liste nennt ungedruckte zuerst (Server). */}
      {vouchers?.some((voucher) => voucher.gedruckt && voucher.status === 'offen') && <p className="field-hint">{PRINTED_HINT}</p>}
      <VoucherArchive
        entries={archive}
        open={archiveOpen}
        onToggle={() => setArchiveOpen((value) => !value)}
        own={own}
        onLabelChange={list.setLabel}
        disabled={disabled}
      />
    </>
  )
}
