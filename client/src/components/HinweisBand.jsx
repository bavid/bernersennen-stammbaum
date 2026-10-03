import useHinweise from '../hooks/useHinweise.js'
import HinweisCarousel from './HinweisCarousel.jsx'
import { focusContent } from '../lib/focusContent.js'

// Globale Hinweise des Admins (Phase N Task 5) ganz oben auf jeder Seite - in der schmalen Leiste über dem Kopf (TopStrip,
// main.jsx) und damit über allem, was App rendert (öffentliche Seiten, Login, Bereiche, Admin, Portal, Steckbrief).
// Nichts, solange nichts geladen ist, alles weggeklickt ist oder die Anfrage scheitert. compact: siehe HinweisCarousel.
export default function HinweisBand({ compact = false }) {
  const { hinweise, dismiss } = useHinweise()
  if (!hinweise?.length) return null

  function handleDismiss(id) {
    const isLast = hinweise.every((hinweis) => hinweis.id === id)
    dismiss(id)
    // Fokus nach dem letzten Hinweis (Audit V7a): das Band verschwindet samt Knopf - ohne das landete der Fokus im
    // Nichts (body). Nach dem Rendern ohne Band auf den Inhalt (lib/focusContent.js).
    if (isLast) setTimeout(() => focusContent(), 0)
  }

  return <HinweisCarousel hinweise={hinweise} onDismiss={handleDismiss} compact={compact} />
}
