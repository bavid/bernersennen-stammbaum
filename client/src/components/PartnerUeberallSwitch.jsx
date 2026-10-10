import { useState } from 'react'
import { api } from '../api'
import Icon from './Icon.jsx'
import { useIsDemo, useReadOnlyHint } from '../lib/demo.js'
import { useToast } from './Toast.jsx'
import { t } from '../lib/i18n/index.js'
import { Chip } from './ui/index.js'

export const UEBERALL_LABEL = 'Überall sichtbar'
export const UEBERALL_HINT = 'Euer Portal erscheint in „Entdecken“ nicht nur in der Nähe, sondern deutschlandweit – nach einer kurzen Prüfung durch unser Team.'
// Wie server/lib/ueberallSichtbar.js GESPERRT_MESSAGE.
export const TEAM_AUS_HINT = 'Diese Hervorhebung wurde vom Team ausgeschaltet – bitte meldet euch bei uns.'

const HINT_ID = 'partner-ueberall-hint'
// Der Schalter ist ein Antrag (server/lib/ueberallSichtbar.js): sichtbar erst nach der Freigabe durch das Team.
const BEANTRAGT_TEXT = 'Beantragt – unser Team schaut es sich an.'
const FREIGEGEBEN_TEXT = 'Freigegeben – ihr erscheint deutschlandweit in „Entdecken“.'

// Stand des Antrags unter dem Schalter - nichts, solange er aus ist und nie abgelehnt wurde.
function AntragStatus({ profile }) {
  const an = Boolean(profile.ueberallSichtbar)
  if (profile.ueberallGesperrt) return null
  if (an && profile.ueberallFreigabe === '') return <Chip tone="wartet">{t(BEANTRAGT_TEXT)}</Chip>
  if (an) return <Chip tone="ok">{t(FREIGEGEBEN_TEXT)}</Chip>
  if (profile.ueberallFreigabe !== 'abgelehnt') return null
  return (
    <p className="field-hint" role="note">
      {t('Nicht freigegeben: {grund}', { grund: profile.ueberallGrund || '–' })} {t('Ihr könnt es nach einer Änderung neu beantragen.')}
    </p>
  )
}
const DEMO_HINT_ID = 'partner-ueberall-demo-hint'

// Phase F: der Schalter „Überall sichtbar“ im Reiter „Teilen“ des Partner-Profils (heute kostenlos - kein Preisversprechen im Label)
// (PUT /api/partner-area/profile/ueberall-sichtbar, server/lib/ueberallSichtbar.js). Ein Klick speichert sofort; die Antwort
// ist das ganze Profil (onSaved). In der Demo, bei einer Sperre des Profils und wenn das Team die Hervorhebung ausgeschaltet
// hat (ueberallGesperrt) gesperrt, jeweils mit Hinweis. Wirkt nur, solange das Profil öffentlich ist - das sagt die Zeile
// darunter.
export default function PartnerUeberallSwitch({ profile, onSaved }) {
  const isDemo = useIsDemo()
  const readOnlyHint = useReadOnlyHint()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const an = Boolean(profile.ueberallSichtbar)
  const locked = Boolean(profile.gesperrt)
  const teamAus = Boolean(profile.ueberallGesperrt)
  const disabled = isDemo || locked || teamAus || busy

  async function toggle() {
    setError(null)
    setBusy(true)
    try {
      const saved = await api.partnerArea.setUeberallSichtbar(!an)
      onSaved(saved)
      toast(an ? t('Ausgeschaltet – ihr erscheint wieder nur in der Nähe.') : t(saved?.ueberallFreigabe === 'freigegeben' ? FREIGEGEBEN_TEXT : BEANTRAGT_TEXT))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card partner-ueberall" aria-labelledby="partner-ueberall-title">
      <div className="partner-ueberall-head">
        <Icon name="compass" />
        <div>
          <h2 id="partner-ueberall-title">{t(UEBERALL_LABEL)}</h2>
          <p className="muted" id={HINT_ID}>
            {t(UEBERALL_HINT)}
          </p>
        </div>
      </div>
      <label className="check partner-ueberall-switch">
        <input
          type="checkbox"
          role="switch"
          checked={an}
          disabled={disabled}
          onChange={toggle}
          aria-describedby={isDemo ? `${HINT_ID} ${DEMO_HINT_ID}` : HINT_ID}
        />
        {t(UEBERALL_LABEL)}
      </label>
      <AntragStatus profile={profile} />
      {teamAus && (
        <p className="field-hint" role="note">
          {t(TEAM_AUS_HINT)}
        </p>
      )}
      {profile.status !== 'aktiv' && !locked && !teamAus && (
        <p className="field-hint">{t('Gilt, sobald euer Profil veröffentlicht ist.')}</p>
      )}
      {locked && <p className="field-hint">{t('Gesperrt – bitte meldet euch beim Betreiber.')}</p>}
      {isDemo && (
        <p className="field-hint" id={DEMO_HINT_ID}>
          {readOnlyHint}
        </p>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
