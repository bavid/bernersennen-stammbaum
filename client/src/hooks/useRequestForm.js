import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import useFocusFirstError from './useFocusFirstError.js'
import { kontaktFor, saveKontakt } from '../lib/kontaktDefaults.js'
import { requestClientErrors, requestErrorField, requestErrorMessage, toRequestPayload } from '../lib/anfragen.js'

function withoutKey(object, key) {
  return Object.fromEntries(Object.entries(object).filter(([field]) => field !== key))
}

// Gemeinsamer Ablauf der beiden Anfrage-Formulare (RequestVoucherForm, RequestPartnerForm): Felder, Honigtopf
// "website", Prüfung im Client (lib/anfragen.js), Absenden an POST /api/public/anfragen, Fehler am Feld (400) oder
// oben im Banner (429, sonst) mit Fokus dorthin (useFocusFirstError). Nach dem Erfolg ist sent true - das Formular
// klappt zu, der Fokus geht auf den Dank (successRef, tabIndex -1), damit er nicht im Nichts landet.
export default function useRequestForm(typ, emptyForm) {
  const [form, setForm] = useState(() => ({ ...emptyForm, ...kontaktFor(emptyForm) }))
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
    setFieldErrors((current) => withoutKey(current, key))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    const clientErrors = requestClientErrors(form, typ)
    setFieldErrors(clientErrors)
    if (Object.keys(clientErrors).length) {
      focusFirstError()
      return
    }

    setSending(true)
    try {
      await api.sendAnfrage({ ...toRequestPayload(form, typ), website })
      saveKontakt(form)
      setSent(true)
    } catch (err) {
      const field = requestErrorField(err, Object.keys(emptyForm))
      if (field) setFieldErrors({ [field]: err.message })
      else setError(requestErrorMessage(err))
      focusFirstError()
    } finally {
      setSending(false)
    }
  }

  return { form, update, website, setWebsite, fieldErrors, error, sent, sending, handleSubmit, formRef, bannerRef, successRef }
}
