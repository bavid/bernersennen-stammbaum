import { useEffect, useState } from 'react'
import { loadInstanzModus } from '../lib/instanzModus.js'

// null, solange GET /api/config läuft - danach '' oder 'rudel' (lib/instanzModus.js).
export default function useInstanzModus() {
  const [modus, setModus] = useState(null)
  useEffect(() => {
    let active = true
    loadInstanzModus().then((value) => active && setModus(value))
    return () => {
      active = false
    }
  }, [])
  return modus
}
