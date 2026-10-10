import { useState } from 'react'
import { api } from '../api'
import Icon from './Icon.jsx'
import { Button } from './ui/index.js'

const MAX_GRUND_LENGTH = 300

// Phase F: „Überall sichtbar“ in der Partnerliste des Admins (partners.ueberall_sichtbar / ueberall_gesperrt /
// ueberall_freigabe). Der Partner beantragt es selbst (PartnerUeberallSwitch). Hier steht es nur in drei Fällen:
// - beantragt (an, Freigabe offen) -> Chip „Deutschlandweit beantragt“ mit „Freigeben“ und „Ablehnen“ (mit Grund),
//   PUT /api/admin/partners/:id/ueberall-freigabe { freigeben, grund }.
// - an und freigegeben -> Chip „Überall sichtbar“ mit „Ausschalten“ (schaltet aus UND sperrt).
// - vom Team ausgeschaltet -> Chip „vom Team ausgeschaltet“ mit „Wieder erlauben“ (hebt die Sperre auf).
// Sonst nichts - ruhig bleiben. Beides wird protokolliert (AdminLog).
export default function AdminPartnerUeberall({ partner, onChanged }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const gesperrt = Boolean(partner.ueberall_gesperrt)
  const an = Boolean(partner.ueberall_sichtbar)
  if (!an && !gesperrt) return null

  async function run(action) {
    setError(null)
    setBusy(true)
    try {
      await action()
      onChanged()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const beantragt = an && !gesperrt && partner.ueberall_freigabe === ''
  return (
    <div className="admin-partner-ueberall">
      {beantragt ? (
        <AntragActions partner={partner} busy={busy} onRun={run} />
      ) : (
        <>
          <span className={`pill admin-partner-ueberall-pill${gesperrt ? ' is-gesperrt' : ''}`}>
            <Icon name={gesperrt ? 'lock' : 'compass'} />
            {gesperrt ? 'Überall sichtbar: vom Team ausgeschaltet' : 'Überall sichtbar'}
          </span>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => run(() => api.admin.setPartnerUeberallErlaubt(partner.id, gesperrt))}>
            {gesperrt ? 'Wieder erlauben' : 'Ausschalten'}
            <span className="visually-hidden">: Überall sichtbar für {partner.name}</span>
          </Button>
        </>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

// Offener Antrag: Freigeben sofort, Ablehnen erst mit einem kurzen Grund (den sieht der Partner im Profil).
function AntragActions({ partner, busy, onRun }) {
  const [rejecting, setRejecting] = useState(false)
  const [grund, setGrund] = useState('')
  const decide = (freigeben) => onRun(() => api.admin.decidePartnerUeberall(partner.id, freigeben, freigeben ? undefined : grund.trim()))
  const label = <span className="visually-hidden">: Deutschlandweit für {partner.name}</span>
  return (
    <>
      <span className="pill admin-partner-ueberall-pill is-beantragt">
        <Icon name="compass" />
        Deutschlandweit beantragt
      </span>
      <Button type="button" variant="ghost" disabled={busy} onClick={() => decide(true)}>
        Freigeben{label}
      </Button>
      {!rejecting ? (
        <Button type="button" variant="ghost" disabled={busy} onClick={() => setRejecting(true)}>
          Ablehnen{label}
        </Button>
      ) : (
        <form
          className="admin-partner-ueberall-reject"
          onSubmit={(event) => {
            event.preventDefault()
            decide(false)
          }}
        >
          <label className="visually-hidden" htmlFor={`ueberall-grund-${partner.id}`}>
            Grund für die Ablehnung
          </label>
          <input
            id={`ueberall-grund-${partner.id}`}
            value={grund}
            maxLength={MAX_GRUND_LENGTH}
            placeholder="Kurzer Grund (sieht der Partner)"
            onChange={(event) => setGrund(event.target.value)}
            required
          />
          <Button type="submit" variant="ghost" disabled={busy || !grund.trim()}>
            Ablehnen
          </Button>
        </form>
      )}
    </>
  )
}
