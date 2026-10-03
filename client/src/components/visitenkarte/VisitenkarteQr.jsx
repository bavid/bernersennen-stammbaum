import { useMemo } from 'react'
import { qrSvgPath } from '../../lib/qr.js'

// QR-Code einer Visitenkarte (Phase V5): ein SVG-Pfad aus lib/qr.js - kein Bild, kein Canvas, keine Datei. Die Ruhezone
// (heller Rand) bringt styles/visitenkarten.css als weißen Innenabstand mit. label: was der Code öffnet (für Screenreader).
export default function VisitenkarteQr({ url, label, className = '' }) {
  const { size, path } = useMemo(() => qrSvgPath(url), [url])
  return (
    <svg className={`vk-qr ${className}`.trim()} viewBox={`0 0 ${size} ${size}`} shapeRendering="crispEdges" role="img" aria-label={label}>
      <path d={path} fill="#000" />
    </svg>
  )
}
