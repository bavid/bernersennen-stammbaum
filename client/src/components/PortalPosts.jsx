import { PromotionList } from './PromotionCard.jsx'

// "Aktuelles von {Name}" auf dem Portal (Phase P2): die Beiträge des Partners als Anzeigen-Karten
// (PromotionCard - Badge "Anzeige", Link mit rel="sponsored"). Öffentlich nur freigegebene (GET
// /api/public/partners/:slug/posts); in der Kundensicht auch die eingereichten, mit "Wartet auf Freigabe"
// und ohne Link. Ohne Beiträge erscheint der Abschnitt nicht.
export default function PortalPosts({ partner, posts }) {
  if (!posts.length) return null
  return (
    <section className="partner-portal-posts" aria-labelledby="partner-portal-posts-title">
      <h2 id="partner-portal-posts-title">Aktuelles von {partner.name}</h2>
      <PromotionList items={posts} />
    </section>
  )
}
