import { originLabel, sharedInHint } from '../../lib/tierZuhause.js'

// Wo das Tier einer Karte wohnt (lib/tierZuhause.js): „aus Zuhause Möwenweg“ - für Tiere des eigenen Zuhauses nichts. Ist die
// Erinnerung über eine Familie zu sehen, steht das leise dabei („geteilt in Familie Sonnenhang“): als Tooltip und für
// Screenreader, nie als zweiter Chip. area: der Bereich der Karte (Farbe wie bisher: Salbei für Familien, Rosé für
// Besuche - sonst die Grundfarbe der Stelle). className: die Chip-Klasse der Stelle (Start: feed-area-chip, Suche: search-chip).
const AREA_TONES = new Set(['familie', 'besuch'])

export default function OriginChip({ zuhause, area, className = 'feed-area-chip' }) {
  const label = originLabel(zuhause)
  if (!label) return null
  const hint = sharedInHint(zuhause, area)
  return (
    <span className={AREA_TONES.has(area?.art) ? `${className} is-${area.art}` : className} title={hint || undefined}>
      {label}
      {hint && <span className="visually-hidden">, {hint}</span>}
    </span>
  )
}
