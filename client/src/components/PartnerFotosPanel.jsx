import { api } from '../api'
import { useIsDemo, useReadOnlyHint } from '../lib/demo.js'
import AdminImageUpload from './AdminImageUpload.jsx'
import EinblickeEditor from './EinblickeEditor.jsx'
import PartnerBannerEditor from './PartnerBannerEditor.jsx'
import { t } from '../lib/i18n/index.js'

const LOGO_TITLE_ID = 'partner-logo-title'

// Das Logo (bis Audit W ein Feld im Formular "Angaben"): speichert sofort über einen eigenen Endpunkt, onUploaded(logoUrl)
// bekommt die neue Adresse - die Seite frischt danach Status und Checkliste auf.
function PartnerLogoCard({ logoUrl, onUploaded }) {
  const isDemo = useIsDemo()
  const readOnlyHint = useReadOnlyHint()
  return (
    <section className="partner-logo-card" aria-labelledby={LOGO_TITLE_ID}>
      <h2 id={LOGO_TITLE_ID}>Logo</h2>
      <div className="partner-logo-field">
        <AdminImageUpload
          label="Logo"
          buttonLabel={t('Logo hochladen')}
          imageUrl={logoUrl}
          disabled={isDemo}
          upload={async (file) => (await api.partnerArea.uploadLogo(file)).logoUrl}
          onUploaded={onUploaded}
        />
        {isDemo && <p className="field-hint">{readOnlyHint}</p>}
      </div>
    </section>
  )
}

// Reiter "Fotos" auf /profil (Audit W, M7): alles Bildliche an einer Stelle - oben das Logo, darunter die Bannerfotos
// samt Layout (PartnerBannerEditor) und die Einblicke (EinblickeEditor, bis dahin ein eigener Reiter). Der Reiter "Angaben"
// behält so nur Texte, Kontakt und Standort und bleibt kurz. profile: aus GET /partner-area/profile; onLogoUploaded,
// onBannerChange, onEinblickeChanged: wie bisher an der Seite (Status auffrischen bzw. Banner übernehmen).
export default function PartnerFotosPanel({ profile, onLogoUploaded, onBannerChange, onEinblickeChanged }) {
  return (
    <>
      <PartnerLogoCard logoUrl={profile.logoUrl} onUploaded={onLogoUploaded} />
      <PartnerBannerEditor banner={profile.banner} layout={profile.bannerLayout} onChange={onBannerChange} />
      <EinblickeEditor onChanged={onEinblickeChanged} />
    </>
  )
}
