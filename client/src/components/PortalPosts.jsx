import PortalSection from './PortalSection.jsx'
import { PromotionList } from './PromotionCard.jsx'
import { SECTION_IDS } from '../lib/portalTabs.js'
import { t } from '../lib/i18n/index.js'

// Reiter "Angebote" auf dem Portal ("Angebote & Aktuelles", Phase P2, seit Phase U ohne Kennzeichnung): die Beiträge des
// Partners auf SEINER Seite - dort braucht es kein "Anzeige"-Badge, die Kennzeichnung gilt nur, wenn die
// Beiträge in "Entdecken" neben anderen stehen. Der Link behält rel="sponsored" für Anzeigen. Öffentlich
// nur freigegebene (GET /api/public/partners/:slug/posts, nur Beiträge dieses Partners - keine fremden);
// in der Kundensicht auch die eingereichten, mit "Wartet auf Freigabe" und ohne Link. Ohne Beiträge
// erscheint der Abschnitt nicht.
export default function PortalPosts({ posts }) {
  if (!posts.length) return null
  return (
    <PortalSection id={SECTION_IDS.posts} title={t('Angebote & Aktuelles')} className="partner-portal-posts">
      <PromotionList items={posts} labelled={false} />
    </PortalSection>
  )
}
