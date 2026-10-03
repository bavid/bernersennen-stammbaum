import useHinweise from '../hooks/useHinweise.js'
import HinweisCarousel from './HinweisCarousel.jsx'

// Globale Hinweise des Admins (Phase N Task 5) ganz oben auf jeder Seite - in main.jsx direkt unter dem Umgebungs-Band
// (EnvBanner) und damit über allem, was App rendert (öffentliche Seiten, Login, Bereiche, Admin, Portal, Steckbrief).
// Nichts, solange nichts geladen ist, alles weggeklickt ist oder die Anfrage scheitert.
export default function HinweisBand() {
  const { hinweise, dismiss } = useHinweise()
  if (!hinweise?.length) return null
  return <HinweisCarousel hinweise={hinweise} onDismiss={dismiss} />
}
