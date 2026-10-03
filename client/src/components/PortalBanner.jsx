import { portalBannerItems } from '../lib/partnerBanner.js'
import { useIsPreview } from '../lib/preview.js'

// Feste Maße für width/height (das Seitenverhältnis steht per CSS fest, .portal-banner) - der Platz ist vor dem
// Laden reserviert, nichts springt.
const BANNER_WIDTH = 1600
const BANNER_HEIGHT = 900

// Bannerfotos im Kopf des Portals (Phase V4b): ein Foto als breites Banner (3:1 am Desktop, 16:9 am Handy), zwei
// nebeneinander (60/40) - am Handy wischt man zum zweiten. Ohne Alternativtext gilt das Foto als Schmuck (alt="").
// Nur erlaubte Foto-Adressen (portalBannerItems), in der Kundensicht auch die eigenen über /uploads.
export default function PortalBanner({ banner }) {
  const preview = useIsPreview()
  const items = portalBannerItems(banner, { preview })
  if (items.length === 0) return null
  const double = items.length > 1

  return (
    <div
      className={`portal-banner ${double ? 'portal-banner-double' : 'portal-banner-single'}`}
      // Zwei Fotos lassen sich am Handy waagerecht wischen - per Tastatur erreichbar, mit Namen für Screenreader.
      {...(double ? { role: 'group', 'aria-label': 'Bannerfotos', tabIndex: 0 } : {})}
    >
      {items.map((item, index) => (
        <img
          key={item.fotoUrl}
          src={item.fotoUrl}
          alt={item.alt}
          width={BANNER_WIDTH}
          height={BANNER_HEIGHT}
          className="portal-banner-photo"
          decoding="async"
          // Beide Fotos stehen ganz oben - das erste zuerst laden, keins verzögert.
          {...(index === 0 ? { fetchpriority: 'high' } : {})}
        />
      ))}
    </div>
  )
}
