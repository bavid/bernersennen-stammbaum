import { Link } from 'react-router-dom'
import { PREVIEW_DISABLED_HINT, useIsPreview } from '../lib/preview.js'

// Links, die in der Kundensicht (lib/preview.js) nirgendwohin führen: Website, Klickzählung (/r/...),
// mailto/tel und interne Seiten wie /p/... oder /t/... - dort würde ein Klick die Vorschau verlassen
// (oder bei einem Entwurf auf eine 404 führen). Außerhalb der Vorschau entsteht genau der bisherige Link.

// Sieht aus wie der Link (gleiche Klassen), ist aber nur Text: role="link" + aria-disabled, damit
// Screenreader ihn als deaktivierten Link ansagen, und der Hinweis als Tooltip und Beschreibung.
export function DisabledLink({ className, children }) {
  return (
    <span
      role="link"
      aria-disabled="true"
      className={className ? `${className} is-preview-disabled` : 'is-preview-disabled'}
      title={PREVIEW_DISABLED_HINT}
      aria-description={PREVIEW_DISABLED_HINT}
    >
      {children}
    </span>
  )
}

// Externer Link, standardmäßig in neuem Tab. newTab={false} für mailto:/tel: (wie bisher ohne target/rel).
export function ExternalLink({ href, className, rel = 'noopener noreferrer', newTab = true, children }) {
  const preview = useIsPreview()
  if (preview) return <DisabledLink className={className}>{children}</DisabledLink>
  if (!newTab) {
    return (
      <a href={href} className={className}>
        {children}
      </a>
    )
  }
  return (
    <a href={href} className={className} target="_blank" rel={rel}>
      {children}
    </a>
  )
}

// Interner Link (react-router) - in der Vorschau ebenso deaktiviert.
export function InternalLink({ to, className, children }) {
  const preview = useIsPreview()
  if (preview) return <DisabledLink className={className}>{children}</DisabledLink>
  return (
    <Link to={to} className={className}>
      {children}
    </Link>
  )
}
