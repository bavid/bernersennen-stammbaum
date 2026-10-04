import { useEffect, useState } from 'react'

function mediaQuery(query) {
  try {
    return window.matchMedia?.(query) || null
  } catch {
    return null
  }
}

// Trifft eine Media-Query gerade zu? Folgt einem Wechsel (Fenster schmaler/breiter). Ohne matchMedia (z. B. jsdom): false.
export default function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => Boolean(mediaQuery(query)?.matches))
  useEffect(() => {
    const media = mediaQuery(query)
    if (!media?.addEventListener) return undefined
    setMatches(media.matches)
    const onChange = (event) => setMatches(event.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [query])
  return matches
}
