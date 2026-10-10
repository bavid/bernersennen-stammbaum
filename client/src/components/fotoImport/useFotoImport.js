import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../../api'
import { collectPhotos } from '../../lib/fotoImport/collect.js'
import { groupByDay, initialSelection, planImport } from '../../lib/fotoImport/group.js'
import { reencodeImage } from '../../lib/fotoImport/reencode.js'
import { runImport } from '../../lib/fotoImport/runImport.js'
import { IMPORT_TEXT } from '../../lib/fotoImport/texts.js'
import { formatDateLong } from '../../lib/dates.js'
import { readSetting, writeSetting } from '../../lib/storage.js'
import { t } from '../../lib/i18n/index.js'

function errorText(err) {
  if (err?.code && IMPORT_TEXT[err.code]) return t(IMPORT_TEXT[err.code], err.details)
  return err?.message || String(err)
}

// Vorschau-Adressen der Fotos (für das Raster) - beim Wechsel/Schließen wieder freigeben.
function usePreviews(photos) {
  const urls = useMemo(() => new Map(photos.map((photo) => [photo.id, URL.createObjectURL(photo.blob)])), [photos])
  useEffect(() => () => urls.forEach((url) => URL.revokeObjectURL(url)), [urls])
  return urls
}

const DEFAULT_DEPS = { api, prepare: (item) => reencodeImage(item.blob, item.name) }

// Hochladen-Teil: Fortschritt, Ergebnis, erledigte Tage (fürs „nochmal“) und Abbrechen.
function useImportRun({ dogId, onCreated, deps }) {
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [result, setResult] = useState(null)
  const [doneDates, setDoneDates] = useState(() => new Set())
  const controller = useRef(null)
  useEffect(() => () => controller.current?.abort(), [])

  async function run({ plan, autorName, privat }) {
    controller.current = new AbortController()
    const outcome = await runImport({
      plan, dogId, autorName, privat, api: deps.api, prepare: deps.prepare,
      titleFor: (date) => t(IMPORT_TEXT.dayTitle, { date: formatDateLong(date) }),
      signal: controller.current.signal, onProgress: setProgress, done: doneDates
    })
    setDoneDates((current) => new Set([...current, ...outcome.created.map((c) => c.date)]))
    if (outcome.created.length > 0) onCreated?.(outcome.created.map((c) => c.entry))
    setResult(outcome)
  }

  function clear() {
    setResult(null)
    setDoneDates(new Set())
  }

  return { progress, result, run, clear, cancel: () => controller.current?.abort() }
}

// Ablauf von „Fotos mitbringen“: pick → reading → review → run → done. Hält Auswahl, Sichtbarkeit (wie eine neue
// Erinnerung: geteilt) und Namen; das Hochladen steckt in useImportRun.
export default function useFotoImport({ dogId, onCreated, deps = DEFAULT_DEPS }) {
  const [step, setStep] = useState('pick')
  const [photos, setPhotos] = useState([])
  const [truncated, setTruncated] = useState(false)
  const [selected, setSelected] = useState(() => new Set())
  const [error, setError] = useState(null)
  const [privat, setPrivat] = useState(false)
  const [autorName, setAutorName] = useState(() => readSetting('autorName', ''))
  const days = useMemo(() => groupByDay(photos), [photos])
  const plan = useMemo(() => planImport(days, selected), [days, selected])
  const overCap = useMemo(() => planImport(days, photos.map((p) => p.id)).skipped, [days, photos])
  const previews = usePreviews(photos)
  const runner = useImportRun({ dogId, onCreated, deps })

  async function pick(fileList) {
    setError(null)
    setStep('reading')
    try {
      const read = await collectPhotos(fileList)
      setPhotos(read.photos)
      setTruncated(read.truncated)
      setSelected(initialSelection(groupByDay(read.photos)))
      setStep('review')
    } catch (err) {
      setError(errorText(err))
      setStep('pick')
    }
  }

  function toggle(id) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function start() {
    if (!autorName.trim()) return setError(t(IMPORT_TEXT.nameMissing))
    writeSetting('autorName', autorName.trim())
    setError(null)
    setStep('run')
    await runner.run({ plan: plan.plan, autorName: autorName.trim(), privat })
    setStep('done')
  }

  function reset() {
    setPhotos([])
    setSelected(new Set())
    runner.clear()
    setStep('pick')
  }

  return {
    step, days, selected, plan, overCap, truncated, previews, error, privat, autorName,
    progress: runner.progress, result: runner.result, cancel: runner.cancel,
    pick, toggle, start, reset, setPrivat, setAutorName
  }
}
