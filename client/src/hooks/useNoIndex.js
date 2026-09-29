import { useEffect } from 'react'

// <meta name="robots" content="noindex"> im head, solange die Seite eingehängt ist - für öffentliche Seiten, die
// Suchmaschinen (noch) nicht aufnehmen sollen: Steckbriefe (/t/:slug, immer) und /partner-werden (bis Phase G).
// Gilt ab dem ersten Rendern, auch während des Ladens und im 404-Fall; beim Verlassen kommt das Tag wieder weg.
// enabled false (z. B. die Kundensicht, keine öffentliche Seite) lässt den head unberührt.
export function useNoIndex(enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined
    const meta = document.createElement('meta')
    meta.setAttribute('name', 'robots')
    meta.setAttribute('content', 'noindex')
    document.head.appendChild(meta)
    return () => {
      document.head.removeChild(meta)
    }
  }, [enabled])
}
