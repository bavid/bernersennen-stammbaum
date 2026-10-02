import Icon from './Icon.jsx'
import { InternalLink } from './PreviewLink.jsx'
import PartnerDiscoverCard from './PartnerDiscoverCard.jsx'
import AnimalAdoptionCard from './AnimalAdoptionCard.jsx'
import PromotionCard, { PromotionList } from './PromotionCard.jsx'
import SupportBlock from './SupportBlock.jsx'
import DiscoverChapter, { DiscoverEmpty, DiscoverSubheading, FallbackNote } from './DiscoverChapter.jsx'
import { splitByDistance } from '../lib/discover.js'
import { countItems, donationsOf, limitGroups, sectionCounts, tabLabel } from '../lib/discoverTabs.js'

// Die Bereiche des Reiters "Entdecken" - jeder bekommt die bereits normalisierte Antwort (lib/discover.js
// normalizeDiscover, fehlende Abschnitte sind leere Listen), dazu limit (unter "Alle" PREVIEW_LIMIT, im
// eigenen Reiter unbegrenzt) und onShowAll (nur unter "Alle": "Alle anzeigen" wechselt den Reiter).

// Alle Karten eines Bereichs in EINEM Raster, in dieser Reihenfolge: Partner, Tiere, Empfehlungen ohne Partner (Tiere
// neben ihren Tierheimen - keine halb leeren Zeilen, eine linke Kante, gleiche Spalten). Phase V1: ein Partner = eine
// Karte (PartnerDiscoverCard) mit seinen Anzeigen und Einblicken; mit Anzeigen darf sie am Desktop zwei Spalten
// breit sein (has-anzeigen).
function CardList({ partners = [], animals = [], promotions = [] }) {
  if (partners.length + animals.length + promotions.length === 0) return null
  return (
    <ul className="partner-list discover-card-list">
      {partners.map((partner) => (
        <li key={`partner-${partner.id}`} className={partner.anzeigen?.length > 0 ? 'has-anzeigen' : undefined}>
          <PartnerDiscoverCard partner={partner} />
        </li>
      ))}
      {animals.map((animal) => (
        <li key={`animal-${animal.slug}`}>
          <AnimalAdoptionCard animal={animal} />
        </li>
      ))}
      {promotions.map((promotion) => (
        <li key={`promotion-${promotion.id}`}>
          <PromotionCard promotion={promotion} />
        </li>
      ))}
    </ul>
  )
}

// Umkreis-Fallback: was außerhalb des gewählten Radius liegt, steht gesammelt unter "Weiter weg".
function FarAway({ children }) {
  return (
    <div className="discover-far">
      <DiscoverSubheading>Weiter weg</DiscoverSubheading>
      {children}
    </div>
  )
}

// "Alle anzeigen" nur, wenn es mehr gibt als gezeigt - und nur unter "Alle" (dort gibt es onShowAll).
function showAllFor(onShowAll, total, shown) {
  return onShowAll && total > shown ? { count: total, onClick: onShowAll } : null
}

function PartnerListHint({ children }) {
  return (
    <DiscoverEmpty>
      {children} – schaut in die <InternalLink to="/partner">Partnerliste</InternalLink>.
    </DiscoverEmpty>
  )
}

// Bereich aus Partnerkarten (samt ihren Anzeigen) und den Empfehlungen ohne Partner (Hundeschulen, Salon &
// Betreuung): Umkreis-Hinweis, die nahen Partner, die Empfehlungen, dann "Weiter weg".
function PartnerChapter({ id, title, lede, emptyHint, partner, promotions, fallback, limit, onShowAll }) {
  const { near, far } = splitByDistance(partner)
  const groups = limitGroups([near, promotions, far], limit)
  const [nearShown, promotionsShown, farShown] = groups
  const total = partner.length + promotions.length

  return (
    <DiscoverChapter id={id} title={title} lede={lede} showAll={showAllFor(onShowAll, total, countItems(groups))}>
      {fallback && <FallbackNote />}
      {total === 0 ? (
        <PartnerListHint>{emptyHint}</PartnerListHint>
      ) : (
        <>
          <CardList partners={nearShown} promotions={promotionsShown} />
          {farShown.length > 0 && (
            <FarAway>
              <CardList partners={farShown} />
            </FarAway>
          )}
        </>
      )}
    </DiscoverChapter>
  )
}

export function HundeschulenSection({ data, limit, onShowAll }) {
  return (
    <PartnerChapter
      id="entdecken-hundeschulen"
      title={tabLabel('hundeschulen')}
      lede="Partner-Hundeschulen mit ihren Kursen und Angeboten."
      emptyHint="Noch keine Hundeschulen in der Nähe"
      partner={data.hundeschulPartner}
      promotions={data.hundeschulPromotions}
      fallback={data.fallback.hundeschulen}
      limit={limit}
      onShowAll={onShowAll}
    />
  )
}

// Phase P2: Hundesalons und Betreuung (Hundesitter, Tagesstätte, Pension) - gleicher Aufbau.
export function SalonSection({ data, limit, onShowAll }) {
  return (
    <PartnerChapter
      id="entdecken-salon"
      title={tabLabel('salon')}
      lede="Hundesalons, Hundesitter, Tagesstätten und Pensionen."
      emptyHint="Noch keine Hundesalons oder Betreuung in der Nähe"
      partner={data.salonPartner}
      promotions={data.salonPromotions}
      fallback={data.fallback.salon}
      limit={limit}
      onShowAll={onShowAll}
    />
  )
}

// Empfehlungen (bereich "begleiter", z. B. Patenschaften) stehen nach Tierheimen und Tieren im Umkreis,
// aber VOR "Weiter weg" - sonst läsen sie sich (auch per Überschriften-Navigation) als weit entfernt.
export function BegleiterSection({ data, limit, onShowAll }) {
  const { begleiterPartner: partner, begleiterTiere: tiere, begleiterPromotions: promotions } = data
  const shelters = splitByDistance(partner)
  const animals = splitByDistance(tiere)
  const groups = limitGroups([shelters.near, animals.near, promotions, shelters.far, animals.far], limit)
  const [sheltersNear, animalsNear, promotionsShown, sheltersFar, animalsFar] = groups
  const total = partner.length + tiere.length + promotions.length

  return (
    <DiscoverChapter
      id="entdecken-begleiter"
      title={tabLabel('begleiter')}
      lede="Tierheime, Vermittlungsstellen und Tiere, die ein Zuhause suchen."
      showAll={showAllFor(onShowAll, total, countItems(groups))}
    >
      <p className="discover-trust-note">
        <Icon name="check" />
        Hier findet ihr nur Tierheime und Vermittlungsstellen – keine Züchter.
      </p>
      {data.fallback.begleiter && <FallbackNote />}
      {total === 0 ? (
        <PartnerListHint>Noch keine Tierheime oder Vermittlungsstellen in der Nähe</PartnerListHint>
      ) : (
        <>
          <CardList partners={sheltersNear} animals={animalsNear} promotions={promotionsShown} />
          {sheltersFar.length + animalsFar.length > 0 && (
            <FarAway>
              <CardList partners={sheltersFar} animals={animalsFar} />
            </FarAway>
          )}
        </>
      )}
      <InternalLink to="/umgebung" className="discover-more-link">
        Mehr in der Nähe
        <span className="visually-hidden"> (Tierheime, Vermittlungsstellen und Hundeschulen)</span>
        <span aria-hidden="true"> →</span>
      </InternalLink>
    </DiscoverChapter>
  )
}

export function FutterSection({ data, limit, onShowAll }) {
  const [shown] = limitGroups([data.futter], limit)
  return (
    <DiscoverChapter
      id="entdecken-futter"
      title={tabLabel('futter')}
      lede="Klar gekennzeichnet: was eine Empfehlung ist und was eine Anzeige."
      showAll={showAllFor(onShowAll, data.futter.length, shown.length)}
    >
      {data.futter.length === 0 ? (
        <DiscoverEmpty icon="star">Noch keine Futter-Empfehlungen – schaut bald wieder vorbei.</DiscoverEmpty>
      ) : (
        <PromotionList items={shown} />
      )}
    </DiscoverChapter>
  )
}

// Unterstützen: unter "Alle" nur der Aufruf und die ersten Empfehlungen (compact) - Transparenzbericht und
// Spendenlinks der Tierheime stehen im eigenen Reiter, "Alle anzeigen" führt dorthin.
export function SupportSection({ data, limit, onShowAll }) {
  const support = data.unterstuetzen
  const compact = Number.isFinite(limit)
  const [promotions] = limitGroups([support.promotions], limit)
  const hidesMore = compact && (promotions.length < support.promotions.length || donationsOf(support).length > 0 || Boolean(support.bericht))
  const showAll = onShowAll && hidesMore ? { count: sectionCounts(data).unterstuetzen, onClick: onShowAll } : null

  return (
    <DiscoverChapter id="entdecken-unterstuetzen" title={tabLabel('unterstuetzen')} lede="Tieren in Vermittlung helfen – und sehen, wohin das Geld geht." showAll={showAll}>
      <SupportBlock support={{ ...support, promotions }} compact={compact} />
    </DiscoverChapter>
  )
}
