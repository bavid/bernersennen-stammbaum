// Ein Foto als Polaroid (B+ Familienalbum): weißer Rand, sanfter Schatten, leicht gedreht - für Erinnerungsfotos auf Start,
// in der Chronik und bei „Heute vor einem Jahr“. Die Drehung kommt aus tiltFor(index), damit nebeneinander liegende Fotos
// verschieden schräg liegen; mit „Bewegung reduzieren“ liegen alle gerade (album.css). caption: kleine Unterschrift in
// Handschrift. Das Bild selbst ist Schmuck, wenn die Karte daneben alles sagt (alt leer).
const TILTS = [-3, 2, -1.5, 2.5]

export function tiltFor(index = 0) {
  return TILTS[Math.abs(index) % TILTS.length]
}

export default function Polaroid({ src, alt = '', caption, index = 0, width = 160, height = 120, className = '' }) {
  return (
    <figure className={`polaroid${className ? ` ${className}` : ''}`} style={{ '--tilt': `${tiltFor(index)}deg` }}>
      <img src={src} alt={alt} loading="lazy" width={width} height={height} />
      {caption && <figcaption className="polaroid-caption hand">{caption}</figcaption>}
    </figure>
  )
}
