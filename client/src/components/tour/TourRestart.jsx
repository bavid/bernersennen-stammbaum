import { Button } from '../ui/index.js'
import { ChapterLinks } from './TourPrompt.jsx'
import { useTour } from './tourContext.js'
import { TOUR_SCOPE } from '../../lib/tour.js'
import { useT } from '../../lib/i18n/index.js'

// „Rundgang erneut starten“ - Einstellungen › App (Haushalte) und Zugang (Partner, Tierheime). Ohne Rundgang (Admin-Ansicht,
// Besuch, Tests ohne TourProvider) steht hier nichts.
export default function TourRestart({ headingLevel: Heading = 'h3', className = '' }) {
  const t = useT()
  const tour = useTour()
  if (!tour) return null
  return (
    <section className={`tour-restart ${className}`.trim()} aria-labelledby="tour-restart-title">
      <Heading id="tour-restart-title">{t('Rundgang')}</Heading>
      <p className="muted">{t('Zeigt euch noch einmal Schritt für Schritt, wo was ist.')}</p>
      <Button variant="ghost" onClick={() => tour.start({ scope: TOUR_SCOPE.alles })}>
        {t('Rundgang erneut starten')}
      </Button>
      <ChapterLinks chapters={tour.chapters} onStart={tour.start} skipFirst={false} />
    </section>
  )
}
