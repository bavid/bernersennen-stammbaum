import PartnerPostsEditor from '../components/PartnerPostsEditor.jsx'

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
          <h1>Beiträge</h1>
          <p className="page-lede">Kurse, Aktionen und Termine – als gekennzeichnete Anzeige für Menschen in eurer Nähe.</p>
        </div>
      </header>

      <PartnerPostsEditor typ={family.partner?.typ} vertrauenswuerdig={Boolean(family.partner?.vertrauenswuerdig)} />
    </div>
  )
}
