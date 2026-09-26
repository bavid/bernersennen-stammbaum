import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

// Alle Seiten als Bilder in einem Druckbogen: der Browser-Druckdialog erzeugt daraus
// Ausdrucke oder ein PDF ("Als PDF speichern"). Jede Seite = ein A4-Blatt.
export default function PrintSheet({ images, onDone }) {
  const ref = useRef(null)
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  // Nur wenn sich die Bilder ändern – nicht bei jedem Neuzeichnen der Seite drucken
  useEffect(() => {
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      window.removeEventListener('afterprint', finish)
      onDoneRef.current()
    }
    const imgs = [...ref.current.querySelectorAll('img')]
    Promise.all(imgs.map((img) => img.decode().catch(() => {}))).then(() => {
      if (finished) return
      window.addEventListener('afterprint', finish)
      window.print()
      // Fallback, falls ein Browser kein afterprint meldet
      setTimeout(finish, 1000)
    })
    return () => {
      finished = true
      window.removeEventListener('afterprint', finish)
    }
  }, [images])

  // Direkt in <body>, damit beim Drucken die ausgeblendete App keine Leerseiten erzeugt
  return createPortal(
    <div className="print-sheet" ref={ref} aria-hidden="true">
      {images.map((url, i) => (
        <img key={url} src={url} alt={`Seite ${i + 1}`} />
      ))}
    </div>,
    document.body
  )
}
