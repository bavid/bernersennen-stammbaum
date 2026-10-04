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
// eigenen Reiter unbegrenzt) und onShowAll (nur unter "Alle": "Alle anzeigen" wechselt den Reiter). Audit W: unter "Alle"
// (endliches limit) kompakt - Karten ohne Anzeigen, Einblicke, Termin und Bilder, Bereiche ohne Kurztext; das alles steht
// im eigenen Reiter.

// Alle Karten eines Bereichs in EINEM Raster, in dieser Reihenfolge: Partner, Tiere, Empfehlungen ohne Partner (Tiere
// neben ihren Tierheimen - keine halb leeren Zeilen, eine linke Kante, gleiche Spalten). Phase V1: ein Partner = eine
// Karte (PartnerDiscoverCard) mit seinen Anzeigen und Einblicken; mit Anzeigen darf sie am Desktop zwei Spalten
// breit sein (has-anzeigen).
function CardList({ partners = [], animals = [], promotions = [], compact = false }) {
  if (partners.length + animals.length + promotions.length === 0) return null
  return (
    <ul className="partner-list discover-card-list">
      {partners.map((partner) => (
        <li key={`partner-${partner.id}`} className={!compact && partner.anzeigen?.length > 0 ? 'has-anzeigen' : undefined}>
          <PartnerDiscoverCard partner={partner} compact={compact} />
        </li>
      ))}
      {animals.map((animal) => (
        <li key={`animal-${animal.slug}`}>
          <AnimalAdoptionCard animal={animal} />
        </li>
      ))}
      {promotions.map((promotion) => (
        <li key={`promotion-${promotion.id}`}>
          <PromotionCard promotion={promotion} compact={compact} />
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

// "Alle anzeigen" nur, wenn es mehr gibt als gezeigt - und nur unter "Alle" (dort gibt es onShowAll). hidden: die kompakte
// Karte lässt etwas weg (Anzeigen oder Einblicke eines Partners) - dann führt "Mehr" ohne Zahl dorthin (alle Karten stehen
// ja schon da).
function showAllFor(onShowAll, total, shown, hidden = false) {
  if (!onShowAll) return null
  if (total > shown) return { count: total, onClick: onShowAll }
  return hidden ? { count: null, onClick: onShowAll } : null
}

function hidesPartnerExtras(partners) {
  return partners.some((partner) => partner.anzeigen?.length > 0 || partner.einblicke?.length > 0)
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
  const compact = Number.isFinite(limit)
  const hidden = compact && hidesPartnerExtras([...nearShown, ...farShown])

  return (
    <DiscoverChapter id={id} title={title} lede={lede} compact={compact} showAll={showAllFor(onShowAll, total, countItems(groups), hidden)}>
      {fallback && <FallbackNote />}
      {total === 0 ? (
        <PartnerListHint>{emptyHint}</PartnerListHint>
      ) : (
        <>
          <CardList partners={nearShown} promotions={promotionsShown} compact={compact} />
          {farShown.length > 0 && (
            <FarAway>
              <CardList partners={farShown} compact={compact} />
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
  const compact = Number.isFinite(limit)
  const hidden = compact && hidesPartnerExtras([...sheltersNear, ...sheltersFar])

  return (
    <DiscoverChapter
      id="entdecken-begleiter"
      title={tabLabel('begleiter')}
      lede="Tierheime, Vermittlungsstellen und Tiere, die ein Zuhause suchen."
      compact={compact}
      showAll={showAllFor(onShowAll, total, countItems(groups), hidden)}
    >
      {!compact && (
        <p className="discover-trust-note">
          <Icon name="check" />
          Hier findet ihr nur Tierheime und Vermittlungsstellen – keine Züchter.
        </p>
      )}
      {data.fallback.begleiter && <FallbackNote />}
      {total === 0 ? (
        <PartnerListHint>Noch keine Tierheime oder Vermittlungsstellen in der Nähe</PartnerListHint>
      ) : (
        <>
          <CardList partners={sheltersNear} animals={animalsNear} promotions={promotionsShown} compact={compact} />
          {sheltersFar.length + animalsFar.length > 0 && (
            <FarAway>
              <CardList partners={sheltersFar} animals={animalsFar} compact={compact} />
            </FarAway>
          )}
        </>
      )}
    </DiscoverChapter>
  )
}

export function FutterSection({ data, limit, onShowAll }) {
  const [shown] = limitGroups([data.futter], limit)
  const compact = Number.isFinite(limit)
  return (
    <DiscoverChapter
      id="entdecken-futter"
      title={tabLabel('futter')}
      lede="Klar gekennzeichnet: was eine Empfehlung ist und was eine Anzeige."
      compact={compact}
      showAll={showAllFor(onShowAll, data.futter.length, shown.length)}
    >
      {data.futter.length === 0 ? (
        <DiscoverEmpty icon="star">Noch keine Futter-Empfehlungen – schaut bald wieder vorbei.</DiscoverEmpty>
      ) : (
        <PromotionList items={shown} compact={compact} />
      )}
    </DiscoverChapter>
  )
}

// Unterstützen: unter "Alle" nur der Aufruf und die erste Empfehlung (compact, Audit W: eine statt PREVIEW_LIMIT - der
// Aufruf ist schon groß) - Transparenzbericht und Spendenlinks der Tierheime stehen im eigenen Reiter, "Alle anzeigen"
// führt dorthin.
const SUPPORT_PREVIEW_LIMIT = 1

export function SupportSection({ data, limit, onShowAll }) {
  const support = data.unterstuetzen
  const compact = Number.isFinite(limit)
  const [promotions] = limitGroups([support.promotions], compact ? Math.min(limit, SUPPORT_PREVIEW_LIMIT) : limit)
  const hidesMore = compact && (promotions.length < support.promotions.length || donationsOf(support).length > 0 || Boolean(support.bericht))
  const showAll = onShowAll && hidesMore ? { count: sectionCounts(data).unterstuetzen, onClick: onShowAll } : null

  return (
    <DiscoverChapter
      id="entdecken-unterstuetzen"
      title={tabLabel('unterstuetzen')}
      lede="Tieren in Vermittlung helfen – und sehen, wohin das Geld geht."
      compact={compact}
      showAll={showAll}
    >
      <SupportBlock support={{ ...support, promotions }} compact={compact} />
    </DiscoverChapter>
  )
}
