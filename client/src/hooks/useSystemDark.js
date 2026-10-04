import { useEffect, useState } from 'react'

const DARK_QUERY = '(prefers-color-scheme: dark)'

function query() {
  try {
    return window.matchMedia?.(DARK_QUERY) || null
  } catch {
    return null
  }
}

// Ist das Gerät gerade dunkel eingestellt? Folgt einem Wechsel (z. B. abends) - für „Automatisch“ im Mini-Designer.
export default function useSystemDark() {
  const [dark, setDark] = useState(() => Boolean(query()?.matches))
  useEffect(() => {
    const media = query()
    if (!media?.addEventListener) return undefined
    const onChange = (event) => setDark(event.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])
  return dark
}
