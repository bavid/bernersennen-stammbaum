import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

// Bei jedem Seitenwechsel nach oben scrollen.
// Block-Body ist Pflicht: neuere Browser geben bei scrollTo ein Promise zurück, das React
// sonst beim Seitenwechsel als Aufräumfunktion aufrufen würde (Absturz, leere Seite).
export default function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}
