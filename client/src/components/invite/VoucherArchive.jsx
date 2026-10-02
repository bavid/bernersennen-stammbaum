import { useTheme } from '../../themes/ThemeProvider.jsx'
import VoucherRow from './VoucherRow.jsx'

// Eingelöste Codes (Phase V2b, GET /api/vouchers/mine?archiv=1): ausgeblendet, bis man „Eingelöste anzeigen“ wählt.
// Darüber die Zahl der Menschen, die über eigene Codes eine Chronik angelegt haben (neueChronik). own: im eigenen
// Zuhause („Du hast …“), sonst in einer Familie oder bei einem Partner („Über eure Codes …“).
export function broughtText(count, appName, own) {
  const who = count === 1 ? 'eine Person' : `${count} Leute`
  return own ? `Du hast schon ${who} zu ${appName} gebracht.` : `Über eure Codes ${count === 1 ? 'ist' : 'sind'} schon ${who} zu ${appName} gekommen.`
}

export default function VoucherArchive({ entries, open, onToggle, own, onLabelChange, disabled }) {
  const { theme } = useTheme()
  if (!entries || entries.length === 0) return null
  const brought = entries.filter((voucher) => voucher.neueChronik).length

  return (
    <div className="voucher-archive">
      {brought > 0 && <p className="voucher-archive-count">{broughtText(brought, theme.appName, own)}</p>}
      <button type="button" className="btn btn-ghost voucher-archive-toggle" aria-expanded={open} onClick={onToggle}>
        {open ? 'Eingelöste ausblenden' : `Eingelöste anzeigen (${entries.length})`}
      </button>
      {open && (
        <ul className="voucher-list voucher-list-archive">
          {entries.map((voucher) => (
            <VoucherRow key={voucher.id} voucher={voucher} onLabelChange={onLabelChange} disabled={disabled} />
          ))}
        </ul>
      )}
    </div>
  )
}
