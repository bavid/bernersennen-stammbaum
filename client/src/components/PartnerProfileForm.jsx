import { useState } from 'react'
import { api } from '../api'
import { useIsDemo, useReadOnlyHint } from '../lib/demo.js'
import {
  MAX_ANSPRECHPERSON_LENGTH,
  MAX_NAME_LENGTH,
  MAX_PORTAL_TEXT_LENGTH,
  MAX_TITEL_LENGTH,
  MIN_PORTAL_TEXT_LENGTH,
  changedProfileFields,
  hasShelterLinks,
  profileErrorField,
  profileForm
} from '../lib/partnerProfile.js'
import useFocusFirstError from '../hooks/useFocusFirstError.js'
import AdminField, { fieldProps } from './AdminField.jsx'
import ColorField from './ColorField.jsx'
import { useToast } from './Toast.jsx'
import { t } from '../lib/i18n/index.js'
import { Button } from './ui/index.js'

const SAVE_DEMO_HINT_ID = 'profile-save-demo-hint'

function withoutKeys(object, keys) {
  return Object.fromEntries(Object.entries(object).filter(([key]) => !keys.includes(key)))
}

// Ein Eingabefeld des Profils: Label, Hinweis und Feldfehler über AdminField, id = profile-<name>.
function ProfileInput({ name, label, hint, form, errors, update, className = '', ...inputAttributes }) {
  const id = `profile-${name}`
  const error = errors[name]
  return (
    <AdminField id={id} label={label} hint={hint} error={error} className={`${error ? 'has-error' : ''} ${className}`.trim()}>
      <input {...fieldProps(id, { error, hint })} value={form[name]} onChange={(e) => update({ [name]: e.target.value })} {...inputAttributes} />
    </AdminField>
  )
}

function portalTextHint(length) {
  const minimum = length < MIN_PORTAL_TEXT_LENGTH ? t(' · mindestens {min} zum Veröffentlichen', { min: MIN_PORTAL_TEXT_LENGTH }) : ''
  return `${t('{n} / {max} Zeichen', { n: length, max: MAX_PORTAL_TEXT_LENGTH })}${minimum}`
}

// Reiter "Angaben" auf /profil: drei ruhige Abschnitte - Auftritt (Name, Texte, Farbe, Links), Kontakt, Standort (Audit W,
// M7: Logo und Fotos stehen im Reiter "Fotos", PartnerFotosPanel). Speichern schickt nur geänderte Felder
// (changedProfileFields); Fehler vom Server stehen am passenden Feld (profileErrorField), sonst - z. B. die Ablehnung
// "Solange euer Profil öffentlich ist …" mit fehlt - oben im Banner.
export default function PartnerProfileForm({ profile, onSaved }) {
  const isDemo = useIsDemo()
  const readOnlyHint = useReadOnlyHint()
  const toast = useToast()
  const [form, setForm] = useState(() => profileForm(profile))
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const { formRef, bannerRef, focusFirstError } = useFocusFirstError()

  const changes = changedProfileFields(form, profile)
  const isDirty = Object.keys(changes).length > 0
  const fieldState = { form, errors: fieldErrors, update }

  function update(patch) {
    setForm((current) => ({ ...current, ...patch }))
    setFieldErrors((current) => withoutKeys(current, Object.keys(patch)))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (isDemo || !isDirty) return
    setError(null)
    setFieldErrors({})
    setSaving(true)
    try {
      const saved = await api.partnerArea.updateProfile(changes)
      setForm(profileForm(saved))
      onSaved(saved)
      toast(t('Gespeichert.'))
    } catch (err) {
      const field = err.details?.fehlt ? null : profileErrorField(err.message)
      if (field) setFieldErrors({ [field]: err.message })
      else setError(err.message)
      focusFirstError()
    } finally {
      setSaving(false)
    }
  }

  return (
    <form ref={formRef} className="partner-profile-form form-stack" onSubmit={handleSubmit} noValidate>
      {error && (
        <div ref={bannerRef} className="error-banner" role="alert" tabIndex={-1}>
          {error}
        </div>
      )}

      <fieldset className="partner-fieldset">
        <legend>{t('Auftritt')}</legend>
        <div className="form-grid">
          <ProfileInput name="name" label={t('Name')} maxLength={MAX_NAME_LENGTH} autoComplete="organization" {...fieldState} />
          <ProfileInput name="portalTitel" label={t('Portal-Titel')} maxLength={MAX_TITEL_LENGTH} placeholder={t('Willkommen bei {name}', { name: form.name || '…' })} {...fieldState} />
          <AdminField
            id="profile-portalText"
            label={t('Portal-Text')}
            hint={portalTextHint(form.portalText.length)}
            error={fieldErrors.portalText}
            className={`span-2 ${fieldErrors.portalText ? 'has-error' : ''}`.trim()}
          >
            <textarea
              {...fieldProps('profile-portalText', { error: fieldErrors.portalText, hint: true })}
              value={form.portalText}
              onChange={(e) => update({ portalText: e.target.value })}
              maxLength={MAX_PORTAL_TEXT_LENGTH}
              rows={5}
            />
          </AdminField>
          <ColorField id="profile-farbe" label={t('Farbe')} value={form.farbe} error={fieldErrors.farbe} onChange={(farbe) => update({ farbe })} />
          <ProfileInput name="website" label={t('Website')} type="url" placeholder="https://…" {...fieldState} />
          {hasShelterLinks(profile.typ) && (
            <>
              <ProfileInput name="spendenUrl" label={t('Spenden-Link')} type="url" placeholder="https://…" {...fieldState} />
              <ProfileInput name="vermittlungUrl" label={t('Vermittlungs-Link')} type="url" placeholder="https://…" {...fieldState} />
            </>
          )}
        </div>
      </fieldset>

      <fieldset className="partner-fieldset">
        <legend>{t('Kontakt')}</legend>
        <div className="form-grid">
          <ProfileInput
            name="ansprechperson"
            label={t('Ansprechperson (freiwillig)')}
            maxLength={MAX_ANSPRECHPERSON_LENGTH}
            autoComplete="name"
            placeholder={t('z. B. Anna Berg')}
            hint={t('Steht auf eurem Portal neben ‚Schreib uns‘ und im Kontaktformular.')}
            className="span-2"
            {...fieldState}
          />
          <ProfileInput name="kontaktEmail" label={t('E-Mail')} type="email" autoComplete="email" {...fieldState} />
          <ProfileInput name="kontaktTelefon" label={t('Telefon')} type="tel" autoComplete="tel" {...fieldState} />
          <ProfileInput
            name="kontaktFormularUrl"
            label={t('Kontaktformular-URL')}
            type="url"
            placeholder="https://…"
            hint={t('Link zu eurem eigenen Kontaktformular')}
            className="span-2"
            {...fieldState}
          />
          <div className="field span-2">
            <label className="check">
              <input
                type="checkbox"
                checked={form.kontaktformularAktiv}
                onChange={(e) => update({ kontaktformularAktiv: e.target.checked })}
                aria-describedby="profile-kontaktformularAktiv-hint"
              />
              {t('Formular ‚Schreib uns‘ anbieten')}
            </label>
            <p className="field-hint" id="profile-kontaktformularAktiv-hint">
              {t('Nachrichten landen in eurem Postfach unter ‚Nachrichten‘.')}
            </p>
          </div>
        </div>
      </fieldset>

      <fieldset className="partner-fieldset">
        <legend>{t('Standort')}</legend>
        <div className="form-grid">
          <ProfileInput
            name="plz"
            label={t('Postleitzahl')}
            inputMode="numeric"
            maxLength={5}
            autoComplete="postal-code"
            hint={profile.ort && form.plz === profile.plz ? t('Ort: {ort}', { ort: profile.ort }) : undefined}
            {...fieldState}
            update={(patch) => update({ plz: patch.plz.replace(/\D/g, '').slice(0, 5) })}
          />
        </div>
      </fieldset>

      <div className="form-actions">
        <Button
          type="submit"
          disabled={isDemo || saving || !isDirty}
          aria-describedby={isDemo ? SAVE_DEMO_HINT_ID : undefined}
        >
          {saving ? t('Speichere …') : t('Speichern')}
        </Button>
        {!isDirty && !isDemo && <span className="field-hint">{t('Keine ungespeicherten Änderungen.')}</span>}
        {isDemo && (
          <span id={SAVE_DEMO_HINT_ID} className="field-hint">
            {readOnlyHint}
          </span>
        )}
      </div>
    </form>
  )
}
