import { useState } from 'react'
import useFocusFirstError from './useFocusFirstError.js'
import { serverFeldFehler } from '../lib/spendenLive.js'

// Formular-Zustand für „Spenden erfassen“ und „Anschub“ im Admin (AdminSpendeForm, AdminVorleistungForm): Werte, Fehler am
// Feld (Client wie Server), Fokus auf den ersten Fehler. toPayload(form) -> { payload, errors }; onSave(payload) darf werfen.
export default function useSpendenForm(initial, toPayload, onSave) {
  const [form, setForm] = useState(initial)
  const [errors, setErrors] = useState({})
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const { formRef, bannerRef, focusFirstError } = useFocusFirstError()

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
    setErrors((current) => Object.fromEntries(Object.entries(current).filter(([field]) => field !== key)))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    const { payload, errors: clientErrors } = toPayload(form)
    if (!payload) {
      setErrors(clientErrors)
      focusFirstError()
      return
    }
    setSaving(true)
    try {
      await onSave(payload)
    } catch (err) {
      const field = serverFeldFehler(err)
      if (field) setErrors({ [field.field]: field.message })
      else setError(err.message)
      focusFirstError()
    } finally {
      setSaving(false)
    }
  }

  return { form, errors, error, saving, update, handleSubmit, formRef, bannerRef, setForm }
}
