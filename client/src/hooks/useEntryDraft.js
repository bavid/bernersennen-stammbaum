import { useCallback, useEffect, useRef } from 'react'
import { draftHasContent, removeDraft, writeDraft } from '../lib/entryForm.js'

const SAVE_DELAY_MS = 400

function persist(key, values) {
  if (draftHasContent(values)) writeDraft(key, values)
  else removeDraft(key)
}

// Entwurf einer neuen Erinnerung (lib/entryForm.js, sessionStorage): wer das Formular aus Versehen schließt, findet beim
// nächsten Öffnen für dasselbe Tier alles wieder (lesen: lib/entryForm.js readDraft). key null (z. B. beim Bearbeiten):
// kein Entwurf. values: die Felder des Formulars - gespeichert kurz nach jeder Änderung und beim Schließen. clear(): nach
// dem Festhalten (danach wird nichts mehr gespeichert), discard(): „Verwerfen“.
export default function useEntryDraft(key, values) {
  const latest = useRef(values)
  const done = useRef(false)
  const serialized = JSON.stringify(values)

  useEffect(() => {
    latest.current = values
  })

  useEffect(() => {
    if (!key || done.current) return undefined
    const timer = setTimeout(() => persist(key, JSON.parse(serialized)), SAVE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [key, serialized])

  useEffect(
    () => () => {
      if (key && !done.current) persist(key, latest.current)
    },
    [key]
  )

  const clear = useCallback(() => {
    done.current = true
    if (key) removeDraft(key)
  }, [key])

  const discard = useCallback(() => {
    if (key) removeDraft(key)
  }, [key])

  return { clear, discard }
}
