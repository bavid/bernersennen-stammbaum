import { Link } from 'react-router-dom'
import Icon from '../components/Icon.jsx'
import VisitenkartenDesigner from '../components/visitenkarte/VisitenkartenDesigner.jsx'
import useVisitenkarte from '../hooks/useVisitenkarte.js'
import { profileTabRoute } from '../lib/partnerProfile.js'

// /visitenkarten (Phase V5) - Visitenkarten-Designer eines Partner- oder Tierheim-Bereichs, verlinkt aus dem Profil
// (Reiter "Teilen") und den Kunden-Gutscheinen; kein eigener Navigationspunkt. Lädt Profil, gespeicherte Gestaltung und
// die öffentliche Adresse (hooks/useVisitenkarte.js), den Rest macht components/visitenkarte/VisitenkartenDesigner.jsx.

export const VISITENKARTEN_LEAD =
  'Eure Karte im Scheckkarten-Format: vorne ihr, hinten der QR-Code zu eurem Portal – auf Wunsch mit einem Kunden-Gutschein auf jeder Karte.'

export default function PartnerVisitenkartenPage() {
  const { profile, state, publicUrl, configReady, error } = useVisitenkarte()
  const ready = profile && state && configReady

  return (
    <div className="page vk-page">
      <header className="page-hero vk-hero">
        <div>
          <span className="eyebrow">Partner-Profil</span>
          <h1>Visitenkarten gestalten</h1>
          <p className="muted vk-lead">{VISITENKARTEN_LEAD}</p>
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
      {!error && ready && <VisitenkartenDesigner profile={profile} initial={state} publicUrl={publicUrl} />}
    </div>
  )
}
