import { useEffect, useRef, useState } from 'react'
import { FADE_MS, LOAD_TIMEOUT_MS, altText, fotoKey } from '../../lib/bilderrahmen.js'
import FrameCaption from './FrameCaption.jsx'

// Schwenk und Zoom je Foto leicht anders (aus dem Schlüssel abgeleitet, also bei jedem Durchlauf gleich).
const DRIFTS = [
  ['-2%', '-1.5%'],
  ['2%', '-1%'],
  ['-1.5%', '1.5%'],
  ['1.5%', '1.5%']
]

function driftFor(key) {
  let hash = 0
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  const [x, y] = DRIFTS[hash % DRIFTS.length]
  return { '--frame-drift-x': x, '--frame-drift-y': y }
}

let layerId = 0

// Die Bilder der Diashow als übereinanderliegende Ebenen: ein neues Foto lädt unsichtbar über dem alten und blendet erst
// ein, wenn es geladen ist (onShown) - ein kaputtes zeigt sich nie, es fällt still heraus (onFailed). Danach räumt die
// Ebene darunter nach der Überblendung weg. Hinter jedem Foto liegt eine unscharf vergrößerte Kopie als warmer Grund.
// moving: sanfter Schwenk und Zoom (aus, wenn das System „Bewegung reduzieren“ wünscht). durationS: so lange bewegt es sich.
export default function FrameSlides({ foto, optionen, now, moving, durationS, onShown, onFailed }) {
  const [layers, setLayers] = useState([])
  const shownRef = useRef(onShown)
  shownRef.current = onShown

  useEffect(() => {
    if (!foto) {
      setLayers([])
      return
    }
    setLayers((current) => {
      const top = current.at(-1)
      // Dasselbe Foto mit frisch signierter Adresse (Rahmen-Gerät): die stehende Ebene bleibt.
      if (top && fotoKey(top.foto) === fotoKey(foto)) return current
      const below = current.filter((layer) => layer.ready).slice(-1)
      layerId += 1
      return [...below, { foto, id: layerId, ready: false }]
    })
  }, [foto])

  // Steht das oberste Foto, verschwinden die Ebenen darunter nach der Überblendung.
  const top = layers.at(-1)
  useEffect(() => {
    if (!top?.ready || layers.length < 2) return undefined
    const timer = setTimeout(() => setLayers((current) => current.filter((layer) => layer.id === top.id)), FADE_MS)
    return () => clearTimeout(timer)
  }, [top, layers.length])

  // Hängt das Laden (Netz weg, ohne Fehler), zählt es nach LOAD_TIMEOUT_MS wie ein Fehler - die Diashow bleibt nicht stehen.
  const failedRef = useRef(onFailed)
  failedRef.current = onFailed
  useEffect(() => {
    if (!top || top.ready) return undefined
    const timer = setTimeout(() => {
      setLayers((current) => current.filter((item) => item.id !== top.id))
      failedRef.current(top.foto)
    }, LOAD_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [top])

  function handleLoad(layer) {
    setLayers((current) => current.map((item) => (item.id === layer.id ? { ...item, ready: true } : item)))
    shownRef.current(layer.foto)
  }

  function handleError(layer) {
    setLayers((current) => current.filter((item) => item.id !== layer.id))
    failedRef.current(layer.foto)
  }

  return (
    <div className="frame-slides">
      {layers.map((layer) => {
        const isTop = layer.id === top?.id
        const key = fotoKey(layer.foto)
        return (
          <div key={layer.id} className={`frame-layer${layer.ready ? ' is-ready' : ''}`} aria-hidden={isTop ? undefined : 'true'}>
            <img className="frame-backdrop" src={layer.foto.url} alt="" aria-hidden="true" referrerPolicy="no-referrer" />
            <figure className="frame-photo">
              <div className="frame-photo-clip">
                <img
                  className={`frame-img${moving ? ' is-moving' : ''}`}
                  style={moving ? { ...driftFor(key), '--frame-duration': `${durationS}s` } : undefined}
                  src={layer.foto.url}
                  alt={altText(layer.foto)}
                  referrerPolicy="no-referrer"
                  decoding="async"
                  onLoad={() => handleLoad(layer)}
                  onError={() => handleError(layer)}
                />
              </div>
              {optionen.untertitel && <FrameCaption foto={layer.foto} optionen={optionen} now={now} />}
            </figure>
          </div>
        )
      })}
    </div>
  )
}
