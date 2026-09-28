import { useCallback, useEffect, useRef, useState } from 'react'

// Nach einem gescheiterten Absenden (Fehler vom Client oder vom Server) den Fokus dorthin, wo der
// Fehler steht: erstes Feld mit aria-invalid - DOM-Reihenfolge ist die Lesereihenfolge -, sonst das
// Fehlerbanner oben (braucht tabIndex={-1}). Läuft als Effekt nach dem Rendern, damit Feldfehler und
// Banner schon im DOM stehen. formRef an das <form>, bannerRef an das Banner, focusFirstError() im
// Fehlerzweig aufrufen.
export default function useFocusFirstError() {
  const formRef = useRef(null)
  const bannerRef = useRef(null)
  const [request, setRequest] = useState(0)

  useEffect(() => {
    if (!request) return
    const target = formRef.current?.querySelector('[aria-invalid="true"]') || bannerRef.current
    target?.focus()
  }, [request])

  const focusFirstError = useCallback(() => setRequest((count) => count + 1), [])

  return { formRef, bannerRef, focusFirstError }
}
