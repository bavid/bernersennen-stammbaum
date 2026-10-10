import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import useFocusFirstError from './useFocusFirstError.js'
import { kontaktFor, saveKontakt } from '../lib/kontaktDefaults.js'
import { requestErrorMessage } from '../lib/anfragen.js'
import {
  EMPTY_GESCHAEFT,
  EMPTY_TERMIN,
  MAX_TERMINE,
  STEPS,
  geschaeftErrorField,
  geschaeftErrors,
  stepOfField,
  toGeschaeftPayload
} from '../lib/geschaeftAnfrage.js'

function withoutKeys(object, keys) {
  return Object.fromEntries(Object.entries(object).filter(([field]) => !keys.includes(field)))
}

// Ablauf der Geschäftsanfrage (components/geschaeft/GeschaeftAnfrageForm): Felder, Terminvorschläge (1–3), Schritte
// am Handy (step), Prüfung im Client je Schritt bzw. ganz, Absenden mit Honigtopf "website", Fehler am Feld (und
// zurück zum passenden Schritt) oder oben im Banner. Nach dem Erfolg ist sent true, der Fokus geht auf den Dank.
export default function useGeschaeftAnfrage() {
  const [form, setForm] = useState(() => ({ ...EMPTY_GESCHAEFT, ...kontaktFor(EMPTY_GESCHAEFT) }))
  const [step, setStep] = useState(0)
  const [website, setWebsite] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState(null)
  const [sent, setSent] = useState(false)
  const [sending, setSending] = useState(false)
  const successRef = useRef(null)
  const { formRef, bannerRef, focusFirstError } = useFocusFirstError()

  useEffect(() => {
    if (sent) successRef.current?.focus()
  }, [sent])

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
    setFieldErrors((current) => withoutKeys(current, [key]))
  }

  function updateTermin(index, key, value) {
    setForm((current) => ({
      ...current,
      termine: current.termine.map((termin, i) => (i === index ? { ...termin, [key]: value } : termin))
    }))
    setFieldErrors((current) => withoutKeys(current, [`termin-${index}`, 'termine']))
  }

  function addTermin() {
    setForm((current) =>
      current.termine.length >= MAX_TERMINE ? current : { ...current, termine: [...current.termine, EMPTY_TERMIN] }
    )
  }

  function removeTermin(index) {
    setForm((current) => ({ ...current, termine: current.termine.filter((_, i) => i !== index) }))
    setFieldErrors((current) => withoutKeys(current, ['termin-0', 'termin-1', 'termin-2']))
  }

  function showErrors(errors) {
    setFieldErrors(errors)
    const first = Object.keys(errors)[0]
    if (first) setStep(stepOfField(first))
    focusFirstError()
  }

  // Weiter (Handy): nur die Felder des aktuellen Schritts prüfen.
  function next() {
    const errors = geschaeftErrors(form, { stepKey: STEPS[step].key })
    if (Object.keys(errors).length) return showErrors(errors)
    setFieldErrors({})
    setStep((current) => Math.min(current + 1, STEPS.length - 1))
  }

  function back() {
    setFieldErrors({})
    setStep((current) => Math.max(current - 1, 0))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    const errors = geschaeftErrors(form)
    if (Object.keys(errors).length) return showErrors(errors)

    setSending(true)
    try {
      await api.sendAnfrage({ ...toGeschaeftPayload(form), website })
      saveKontakt(form)
      setSent(true)
    } catch (err) {
      const field = geschaeftErrorField(err)
      if (field) showErrors({ [field]: err.message })
      else {
        setError(requestErrorMessage(err))
        focusFirstError()
      }
    } finally {
      setSending(false)
    }
  }

  return {
    form,
    update,
    updateTermin,
    addTermin,
    removeTermin,
    step,
    next,
    back,
    website,
    setWebsite,
    fieldErrors,
    error,
    sent,
    sending,
    handleSubmit,
    formRef,
    bannerRef,
    successRef
  }
}
