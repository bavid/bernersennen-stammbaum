import { useTheme } from '../../themes/ThemeProvider.jsx'
import VoucherRow from './VoucherRow.jsx'
import { t } from '../../lib/i18n/index.js'
import { Button } from '../ui/index.js'

// Eingelöste Codes (Phase V2b, GET /api/vouchers/mine?archiv=1): ausgeblendet, bis man „Eingelöste anzeigen“ wählt.
// Darüber die Zahl der Menschen, die über eigene Codes eine Chronik angelegt haben (neueChronik). own: im eigenen
// Zuhause („Du hast …“), sonst in einer Familie oder bei einem Partner („Über eure Codes …“).
export function broughtText(count, appName, own) {
  if (own) return count === 1 ? t('Du hast schon eine Person zu {app} gebracht.', { app: appName }) : t('Du hast schon {n} Leute zu {app} gebracht.', { n: count, app: appName })
  return count === 1
    ? t('Über eure Codes ist schon eine Person zu {app} gekommen.', { app: appName })
    : t('Über eure Codes sind schon {n} Leute zu {app} gekommen.', { n: count, app: appName })
}

export default function VoucherArchive({ entries, open, onToggle, own, onLabelChange, disabled }) {
  const { theme } = useTheme()
  if (!entries || entries.length === 0) return null
  const brought = entries.filter((voucher) => voucher.neueChronik).length

  return (
    <div className="voucher-archive">
      {brought > 0 && <p className="voucher-archive-count">{broughtText(brought, theme.appName, own)}</p>}
      <Button type="button" variant="ghost" className="voucher-archive-toggle" aria-expanded={open} onClick={onToggle}>
        {open ? t('Eingelöste ausblenden') : t('Eingelöste anzeigen ({n})', { n: entries.length })}
      </Button>
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
