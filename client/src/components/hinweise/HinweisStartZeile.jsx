import Icon from '../Icon.jsx'
import { useGlocke } from './HinweiseProvider.jsx'
import { startLineText } from '../../lib/glocke.js'

// Auf Start (statt der früheren „Für dich“-Kästen): eine schmale Zeile „2 neue Hinweise · ansehen“, nur wenn es welche
// gibt - sie öffnet dasselbe Fenster wie die Glocke im Kopf.
export default function HinweisStartZeile() {
  const glocke = useGlocke()
  if (!glocke?.enabled || glocke.total === 0) return null
  return (
    <button type="button" className="start-hinweise" aria-haspopup="dialog" aria-expanded={glocke.open} onClick={glocke.openPanel}>
      <Icon name="bell" />
      <span className="start-hinweise-text">{startLineText(glocke.total)}</span>
      <span className="start-hinweise-action">ansehen</span>
    </button>
  )
}
