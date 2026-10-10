import { Link, useSearchParams } from 'react-router-dom'
import Icon from '../components/Icon.jsx'
import KartenDesigner from '../components/visitenkarte/KartenDesigner.jsx'
import useVisitenkarte from '../hooks/useVisitenkarte.js'
import { profileTabRoute } from '../lib/partnerProfile.js'
import { KARTE_PARAM, karteFromParams } from '../lib/kartenWahl.js'
import { t } from '../lib/i18n/index.js'

// /visitenkarten (Phase V5, Feedback-Runde) - Karten-Designer eines Partner- oder Tierheim-Bereichs, verlinkt aus dem
// Profil (Reiter "Teilen") und den Einladungscodes; kein eigener Navigationspunkt. Eine Seite ohne "Kartenart": vorne
// immer eure Kontakte, hinten wählbar euer Portal, ein Einladungscode oder beides (Kombi) - die Wahl steht in der
// Adresse (?karte=…, das frühere ?art=einladung öffnet die Einladungskarte). Lädt Profil, gespeicherte Gestaltung und
// die öffentliche Adresse (hooks/useVisitenkarte.js), den Rest macht components/visitenkarte/KartenDesigner.jsx.

export const KARTEN_LEAD =
  'Zum Selberdrucken im Scheckkarten-Format: vorne eure Kontakte, hinten euer Portal, ein Einladungscode für eure Kundschaft – oder beides.'
const LEGACY_PARAM = 'art'

export default function PartnerVisitenkartenPage() {
  const { profile, state, publicUrl, appEnv, configReady, error } = useVisitenkarte()
  const [params, setParams] = useSearchParams()
  const karte = karteFromParams(params)
  const ready = profile && state && configReady

  // Andere Parameter (z. B. aus der Demo) bleiben stehen; das frühere ?art= fällt weg.
  function selectKarte(next) {
    const updated = new URLSearchParams(params)
    updated.delete(LEGACY_PARAM)
    updated.set(KARTE_PARAM, next)
    setParams(updated, { replace: true })
  }

  return (
    <div className="page vk-page">
      <header className="page-hero vk-hero">
        <div>
          <span className="eyebrow">{t('Partner-Profil')}</span>
          <h1>{t('Karten gestalten')}</h1>
          <p className="muted vk-lead">{t(KARTEN_LEAD)}</p>
        </div>
        {/* Audit V7a: zurück in den Reiter "Teilen", aus dem man meist kommt. */}
        <Link to={profileTabRoute('teilen')} className="btn btn-ghost">
          <Icon name="arrowLeft" /> {t('Zurück zum Profil')}
        </Link>
      </header>

      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {!error && !ready && (
        <p className="muted page-loading" role="status">
          {t('Lade …')}
        </p>
      )}
      {!error && ready && (
        <KartenDesigner karte={karte} onKarte={selectKarte} profile={profile} initial={state} publicUrl={publicUrl} appEnv={appEnv} />
      )}
    </div>
  )
}
