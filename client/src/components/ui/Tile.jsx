import { cx, pick } from './classNames.js'

// Box-System: Bild-Kachel mit Unterschrift (Tiere, Fotos, Orte). Ohne Bild steht der erste Buchstabe des Titels
// auf ruhigem Grund. Mit href ist die ganze Kachel ein Link. alt leer lassen, wenn die Unterschrift das Bild schon
// beschreibt (sonst liest der Screenreader alles doppelt). Stil: styles/ui.css.
export const TILE_SHAPES = ['square', 'wide']

function TileBody({ src, alt, title, sub }) {
  const initial = (title || '').trim().charAt(0).toUpperCase()
  return (
    <figure className="ui-tile-figure">
      <div className="ui-tile-media">
        {src ? <img src={src} alt={alt} loading="lazy" decoding="async" /> : <span aria-hidden="true">{initial}</span>}
      </div>
      {(title || sub) && (
        <figcaption className="ui-tile-caption">
          {title && <span className="ui-tile-title">{title}</span>}
          {sub && <span className="ui-tile-sub">{sub}</span>}
        </figcaption>
      )}
    </figure>
  )
}

export default function Tile({ src, alt = '', title, sub, href, shape = 'square', className, ...rest }) {
  const classes = cx('ui-tile', `ui-tile--${pick(shape, TILE_SHAPES, 'square')}`, className)
  const body = <TileBody src={src} alt={alt} title={title} sub={sub} />
  if (href) {
    return (
      <a className={classes} href={href} {...rest}>
        {body}
      </a>
    )
  }
  return (
    <div className={classes} {...rest}>
      {body}
    </div>
  )
}
