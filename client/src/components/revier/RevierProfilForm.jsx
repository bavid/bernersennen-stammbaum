import { useId, useState } from 'react'
import ShareSwitch from '../shares/ShareSwitch.jsx'
import { Button, Chip } from '../ui/index.js'
import { MAX_PROFIL_TEXT, kannEinschalten } from '../../lib/revier.js'
import { useT } from '../../lib/i18n/index.js'

const formOf = (settings) => ({
  aktiv: settings.aktiv,
  plz: settings.plz || '',
  zustimmung: settings.zustimmung,
  name: settings.name || '',
  text: settings.text || '',
  ortZeigen: settings.ortZeigen,
  followerOeffentlich: settings.followerOeffentlich
})

function StatusChip({ settings }) {
  const t = useT()
  if (settings.gesperrt) return <Chip tone="gesperrt" icon="lock">{t('Vom Team ausgeschaltet')}</Chip>
  return settings.aktiv ? (
    <Chip tone="ok" icon="globe">{t('Öffentlich zu sehen')}</Chip>
  ) : (
    <Chip icon="lock">{t('Nicht öffentlich')}</Chip>
  )
}

function Standort({ form, set, readOnly, ort }) {
  const t = useT()
  const hintId = useId()
  return (
    <>
      <label className="field">
        <span className="field-label">{t('Eure Postleitzahl')}</span>
        <input
          inputMode="numeric"
          maxLength={5}
          value={form.plz}
          disabled={readOnly}
          aria-describedby={hintId}
          onChange={(event) => set({ plz: event.target.value.replace(/\D/g, '') })}
        />
        <span className="field-hint" id={hintId}>
          {t('Andere sehen nie eure Postleitzahl – nur, wie weit ihr ungefähr entfernt seid („unter 5 km“, „5–10 km“ …).')}
        </span>
      </label>
      <ShareSwitch
        label={ort ? t('Ort zusätzlich zeigen ({ort})', { ort }) : t('Ort zusätzlich zeigen')}
        checked={form.ortZeigen}
        disabled={readOnly}
        onChange={(ortZeigen) => set({ ortZeigen })}
      />
    </>
  )
}

function Auftritt({ form, set, readOnly, vorgabeName }) {
  const t = useT()
  return (
    <>
      <label className="field">
        <span className="field-label">{t('Name im Profil')}</span>
        <input value={form.name} maxLength={40} placeholder={vorgabeName} disabled={readOnly} onChange={(event) => set({ name: event.target.value })} />
      </label>
      <label className="field">
        <span className="field-label">{t('Ein paar Worte über euch (freiwillig)')}</span>
        <textarea rows={3} maxLength={MAX_PROFIL_TEXT} value={form.text} disabled={readOnly} onChange={(event) => set({ text: event.target.value })} />
      </label>
      <fieldset className="revier-follower-wahl">
        <legend className="field-label">{t('Wer euch folgt')}</legend>
        <label>
          <input type="radio" name="revier-follower" checked={!form.followerOeffentlich} disabled={readOnly} onChange={() => set({ followerOeffentlich: false })} />
          {t('Privat – andere sehen nur die Zahl')}
        </label>
        <label>
          <input type="radio" name="revier-follower" checked={form.followerOeffentlich} disabled={readOnly} onChange={() => set({ followerOeffentlich: true })} />
          {t('Öffentlich – andere sehen die Namen der Profile')}
        </label>
      </fieldset>
    </>
  )
}

// Das eigene öffentliche Profil: Schalter, PLZ + Häkchen (Pflicht zum Einschalten), Ort, Name, Text, Follower - ein
// „Speichern“ für alles. Ausschalten wirkt sofort überall (der Server prüft bei jedem Lesen).
export default function RevierProfilForm({ settings, busy, readOnly, onSave }) {
  const t = useT()
  const [form, setForm] = useState(() => formOf(settings))
  const set = (patch) => setForm((current) => ({ ...current, ...patch }))
  const blocked = form.aktiv && !kannEinschalten(form)

  function submit(event) {
    event.preventDefault()
    if (blocked || busy) return
    onSave({ ...form, plz: form.plz || null, name: form.name.trim() || null }).then((ok) => ok || setForm(formOf(settings)))
  }

  return (
    <form className="revier-form" onSubmit={submit}>
      <div className="revier-form-kopf">
        <ShareSwitch label={t('Profil öffentlich zeigen')} checked={form.aktiv} disabled={readOnly || settings.gesperrt} onChange={(aktiv) => set({ aktiv })} />
        <StatusChip settings={settings} />
      </div>
      <Standort form={form} set={set} readOnly={readOnly} ort={settings.ort} />
      <label className="revier-zustimmung">
        <input type="checkbox" checked={form.zustimmung} disabled={readOnly} onChange={(event) => set({ zustimmung: event.target.checked })} />
        {t('Ich möchte, dass andere mein Profil sehen können.')}
      </label>
      <Auftritt form={form} set={set} readOnly={readOnly} vorgabeName={settings.vorgabeName} />
      {blocked && <p className="field-hint" role="alert">{t('Zum Einschalten braucht es eure Postleitzahl und das Häkchen.')}</p>}
      <Button type="submit" disabled={readOnly || blocked} aria-busy={busy || undefined}>
        {t('Speichern')}
      </Button>
    </form>
  )
}
