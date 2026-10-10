import AnimalAdoptionCard from './AnimalAdoptionCard.jsx'
import HappyEndCard from './HappyEndCard.jsx'
import Icon from './Icon.jsx'
import PortalSection from './PortalSection.jsx'
import { ExternalLink } from './PreviewLink.jsx'
import { isExternalUrl } from '../lib/format.js'
import { SECTION_IDS } from '../lib/portalTabs.js'
import { adoptionSectionTitle } from '../lib/shelter.js'
import { t } from '../lib/i18n/index.js'

// Reiter "Tiere" auf dem Portal eines Tierheims: die Tiere in Vermittlung (je eine Karte zum Steckbrief /t/:slug) und
// darunter die Happy Ends - ein Reiter statt zweier, das hält die Leiste ruhig. Die externe Vermittlungsseite steht
// hier statt im Kopf (dort hieße sie wie dieser Reiter). Ohne Tiere und Happy Ends gibt es den Reiter nicht.
export default function PortalAnimals({ animals, happyEnds, partner }) {
  const hasVermittlung = isExternalUrl(partner.vermittlung_url)
  return (
    <>
      {animals.length > 0 && (
        <PortalSection id={SECTION_IDS.animals} title={t(adoptionSectionTitle(animals))} className="partner-portal-animals">
          <div className="shelter-grid">
            {animals.map((animal) => (
              <AnimalAdoptionCard key={animal.slug} animal={animal} />
            ))}
          </div>
          {hasVermittlung && (
            <ExternalLink href={partner.vermittlung_url} className="btn btn-ghost portal-animals-more">
              {t('Alle Tiere auf der Vermittlungsseite')}
              <Icon name="external" />
            </ExternalLink>
          )}
        </PortalSection>
      )}

      {happyEnds.length > 0 && (
        <PortalSection id={SECTION_IDS.happyEnds} title={t('Happy Ends')} className="partner-portal-animals partner-portal-happy-ends">
          <div className="shelter-grid">
            {happyEnds.map((happyEnd, index) => (
              <HappyEndCard key={`${happyEnd.name}-${index}`} happyEnd={happyEnd} />
            ))}
          </div>
        </PortalSection>
      )}
    </>
  )
}
