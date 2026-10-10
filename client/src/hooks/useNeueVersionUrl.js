import { useEffect, useState } from 'react'
import { loadNeueVersionUrl } from '../lib/instanzModus.js'

// null, solange GET /api/config läuft oder keine neue Version angekündigt ist (lib/instanzModus.js).
export default function useNeueVersionUrl() {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    let active = true
    loadNeueVersionUrl().then((value) => active && setUrl(value))
    return () => {
      active = false
    }
  }, [])
  return url
}
