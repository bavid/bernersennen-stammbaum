import { useEffect, useState } from 'react'
import { api } from '../api'

// Drucken mit Kunden-Gutscheinen (Phase V5, VisitenkartenDesigner): die Codes holt erst der Klick auf "Drucken" - in
// genau der Zahl, die gerade gedruckt wird (api.partnerArea.visitenkarteGutscheine, der Server vermerkt sie dabei als
// gedruckt). So bleiben keine geholten, aber nie gedruckten Codes liegen, wenn man vorher die Bögen ändert, neu lädt
// oder die Seite verlässt. Die Codes leben nur für diesen einen Druck im State (und im DOM der Druckfassung) und
// verschwinden nach dem Druckdialog (afterprint) - ein neuer Druck bekommt neue Codes, nie dieselben zweimal.
// available: wie viele Codes ein Druck gerade bekommen kann (ungedruckte bzw. mit nurUngedruckt false alle offenen).
export default function useVisitenkartenDruck(initialGutscheine) {
  const [gutscheine, setGutscheine] = useState(initialGutscheine)
  const [nurUngedruckt, setNurUngedruckt] = useState(true)
  const [printCodes, setPrintCodes] = useState([])
  const [lastPrint, setLastPrint] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [pending, setPending] = useState(false)

  // Erst drucken, wenn die Druckfassung die Codes im DOM hat (nach dem Rendern).
  useEffect(() => {
    if (!pending) return
    setPending(false)
    window.addEventListener('afterprint', () => setPrintCodes([]), { once: true })
    window.print()
  }, [pending])

  const available = nurUngedruckt ? gutscheine.ungedruckt : gutscheine.offen

  // withCodes: mit Gutscheinen (eigener Bereich, Schalter an, etwas verfügbar); cards: Karten dieses Drucks.
  async function print({ withCodes, cards }) {
    if (!withCodes) {
      window.print()
      return
    }
    setError(null)
    setBusy(true)
    try {
      const result = await api.partnerArea.visitenkarteGutscheine({ anzahl: cards, nurUngedruckt })
      setGutscheine(result.gutscheine)
      setPrintCodes(result.codes)
      setLastPrint({ gutscheine: result.codes.length, karten: cards })
      setPending(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return { gutscheine, setGutscheine, nurUngedruckt, setNurUngedruckt, available, printCodes, lastPrint, busy, error, print }
}
