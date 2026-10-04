import { Link, useSearchParams } from 'react-router-dom'
import Icon from '../components/Icon.jsx'
import KartenDesigner from '../components/visitenkarte/KartenDesigner.jsx'
import useVisitenkarte from '../hooks/useVisitenkarte.js'
import { profileTabRoute } from '../lib/partnerProfile.js'
import { ART, ART_PARAM, artFromParam } from '../lib/einladungskarte.js'

// /visitenkarten (Phase V5) - Karten-Designer eines Partner- oder Tierheim-Bereichs, verlinkt aus dem Profil (Reiter
// "Teilen") und den Kunden-Gutscheinen; kein eigener Navigationspunkt. Zwei Kartenarten (?art=einladung): Visitenkarten
// (vorne ihr, hinten euer Portal) und Einladungskarten (vorne ihr, hinten Familie auf Pfoten mit Code). Lädt Profil,
// gespeicherte Gestaltungen und die öffentliche Adresse (hooks/useVisitenkarte.js), den Rest macht
// components/visitenkarte/KartenDesigner.jsx.

export const VISITENKARTEN_LEAD =
  'Eure Karte im Scheckkarten-Format: vorne ihr, hinten der QR-Code zu eurem Portal – auf Wunsch mit einem Kunden-Gutschein auf jeder Karte.'
export const EINLADUNGSKARTEN_LEAD =
  'Zum Verteilen an eure Kundschaft: vorne ihr, hinten Familie auf Pfoten mit einem eigenen Code auf jeder Karte – wer ihn einlöst, legt eine eigene Tierchronik an.'

const TITLES = { [ART.visitenkarte]: 'Visitenkarten gestalten', [ART.einladung]: 'Einladungskarten gestalten' }
const LEADS = { [ART.visitenkarte]: VISITENKARTEN_LEAD, [ART.einladung]: EINLADUNGSKARTEN_LEAD }

export default function PartnerVisitenkartenPage() {
  const { profile, state, publicUrl, appEnv, configReady, error } = useVisitenkarte()
  const [params, setParams] = useSearchParams()
  const art = artFromParam(params.get(ART_PARAM))
  const ready = profile && state && configReady

  // Andere Parameter (z. B. aus der Demo) bleiben stehen; die Visitenkarte braucht keinen.
  function selectArt(next) {
    const updated = new URLSearchParams(params)
    if (next === ART.einladung) updated.set(ART_PARAM, next)
    else updated.delete(ART_PARAM)
    setParams(updated, { replace: true })
  }

  return (
    <div className="page vk-page">
      <header className="page-hero vk-hero">
        <div>
          <span className="eyebrow">Partner-Profil</span>
          <h1>{TITLES[art]}</h1>
          <p className="muted vk-lead">{LEADS[art]}</p>
        </div>
        {/* Audit V7a: zurück in den Reiter "Teilen", aus dem man meist kommt. */}
        <Link to={profileTabRoute('teilen')} className="btn btn-ghost">
          <Icon name="arrowLeft" /> Zurück zum Profil
        </Link>
      </header>

      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {!error && !ready && (
        <p className="muted page-loading" role="status">
          Lade …
        </p>
      )}
      {!error && ready && <KartenDesigner art={art} onArt={selectArt} profile={profile} initial={state} publicUrl={publicUrl} appEnv={appEnv} />}
    </div>
  )
}
