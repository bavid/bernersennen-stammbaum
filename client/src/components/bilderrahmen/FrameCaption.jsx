import { captionFor } from '../../lib/bilderrahmen.js'

// Bildunterschrift auf dem weißen Rand des Fotos: Name · Datum, darüber klein in Handschrift „Heute vor 3 Jahren“ oder
// „In Erinnerung“ - die einzige Stelle mit der Handschrift. Nur Text, keine Erinnerungstexte.
export default function FrameCaption({ foto, optionen, now }) {
  const { name, datum, heuteVor, erinnerung } = captionFor(foto, optionen, now)
  const accent = [heuteVor, erinnerung].filter(Boolean).join(' · ')
  return (
    <figcaption className="frame-caption">
      {accent && <span className="frame-caption-accent">{accent}</span>}
      <span className="frame-caption-main">
        <strong>{name}</strong>
        {datum && <span> · {datum}</span>}
      </span>
    </figcaption>
  )
}
