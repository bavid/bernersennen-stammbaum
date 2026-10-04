import { areaChipLabel } from '../../lib/startFeed.js'

// Kleiner Bereichs-Hinweis auf einer Karte von Start (Phase W, Schritt 3): „Familie Sonnenhang“ in Salbei, „Zu Besuch:
// Zuhause Möwenweg“ in Rosé - für das eigene Zuhause nichts. Teil des Link-Texts der Karte (kein eigenes Ziel).
export default function AreaChip({ area }) {
  const label = areaChipLabel(area)
  if (!label) return null
  return <span className={`feed-area-chip is-${area.art}`}>{label}</span>
}
