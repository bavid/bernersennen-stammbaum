import { portalBanner } from '../lib/partnerBanner.js'
import { useIsPreview } from '../lib/preview.js'

// Feste Maße für width/height (das Seitenverhältnis steht per CSS fest, .portal-banner) - der Platz ist vor dem
// Laden reserviert, nichts springt.
const BANNER_WIDTH = 1600
const BANNER_HEIGHT = 900

// Bannerfotos im Kopf des Portals (Phase V4b, Feedback-Runde): im Layout, das der Partner gewählt hat (layout:
// partner.bannerLayout) - ein breites Foto, halb/halb, groß links mit klein rechts oder groß links mit zwei rechts
// übereinander (3:1 am Desktop). Fehlen Fotos dafür, das nächstkleinere Layout (lib/partnerBanner.js portalBanner). Am
// Handy steht das erste Foto in voller Breite, die weiteren wischt man herein. Ohne Alternativtext gilt ein Foto als
// Schmuck (alt=""). Nur erlaubte Foto-Adressen, in der Kundensicht auch die eigenen über /uploads.
export default function PortalBanner({ banner, layout }) {
  const preview = useIsPreview()
  const shown = portalBanner(banner, layout, { preview })
  if (shown.items.length === 0) return null
  const multi = shown.items.length > 1

  return (
    <div
      className={`portal-banner ${multi ? 'portal-banner-multi' : 'portal-banner-single'} is-${shown.layout}`}
      data-layout={shown.layout}
      // Mehrere Fotos lassen sich am Handy waagerecht wischen - per Tastatur erreichbar, mit Namen für Screenreader.
      {...(multi ? { role: 'group', 'aria-label': 'Bannerfotos', tabIndex: 0 } : {})}
    >
      {shown.items.map((item, index) => (
        <img
          key={item.fotoUrl}
          src={item.fotoUrl}
          alt={item.alt}
          width={BANNER_WIDTH}
          height={BANNER_HEIGHT}
          className="portal-banner-photo"
          decoding="async"
          // Alle Fotos stehen ganz oben - das erste zuerst laden, keins verzögert.
          {...(index === 0 ? { fetchpriority: 'high' } : {})}
        />
      ))}
    </div>
  )
}
