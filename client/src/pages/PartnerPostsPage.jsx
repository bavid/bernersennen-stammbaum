import PartnerPostsEditor from '../components/PartnerPostsEditor.jsx'
import { t } from '../lib/i18n/index.js'

// /beitraege (Phase P2) - eigene Beiträge eines Partner-Bereichs: Anzeigen, die nach Freigabe durch den
// Betreiber in "Entdecken" und auf dem Portal erscheinen. Tierheime erreichen dieselbe Liste als Reiter
// "Beiträge" im Profil (PartnerProfilePage), damit ihre Navigation bei fünf Einträgen bleibt.
export default function PartnerPostsPage({ family }) {
  const name = family.partner?.name || family.name

  return (
    <div className="page partner-posts-page">
      <header className="page-hero">
        <div>
          <span className="eyebrow">{name}</span>
          <h1>{t('Beiträge')}</h1>
          <p className="page-lede">{t('Kurse, Aktionen und Angebote – für „Entdecken“ und euer Portal.')}</p>
        </div>
      </header>

      {/* Audit V7a: die Überschrift "Eure Beiträge" stünde direkt unter "Beiträge" - hier nur für Screenreader. */}
      <PartnerPostsEditor typ={family.partner?.typ} vertrauenswuerdig={Boolean(family.partner?.vertrauenswuerdig)} showTitle={false} />
    </div>
  )
}
