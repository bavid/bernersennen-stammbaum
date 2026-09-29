import Icon from './Icon.jsx'
import { InternalLink } from './PreviewLink.jsx'
import PartnerCard from './PartnerCard.jsx'
import AnimalAdoptionCard from './AnimalAdoptionCard.jsx'
import PromotionCard, { PromotionList } from './PromotionCard.jsx'
import SupportBlock from './SupportBlock.jsx'
import DiscoverChapter, { DiscoverEmpty, DiscoverSubheading, FallbackNote } from './DiscoverChapter.jsx'
import { splitByDistance } from '../lib/discover.js'

// Die Kapitel des Reiters "Entdecken" - jedes bekommt seine Daten bereits normalisiert
// (lib/discover.js normalizeDiscover), fehlende Abschnitte sind also leere Listen.

// Partnerkarten, optional gefolgt von Empfehlungen im selben Raster (Hundeschulen: Kurse und Angebote
// stehen direkt neben den Schulen statt in einer eigenen, halb leeren Zeile).
function PartnerList({ items, promotions = [] }) {
  if (items.length === 0 && promotions.length === 0) return null
  return (
    <ul className="partner-list">
      {items.map((partner) => (
        <li key={`partner-${partner.id}`}>
          <PartnerCard partner={partner} />
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

function AnimalList({ items }) {
  if (items.length === 0) return null
  return (
    <ul className="shelter-grid discover-animals">
      {items.map((animal) => (
        <li key={animal.slug}>
          <AnimalAdoptionCard animal={animal} />
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

function PartnerListHint({ children }) {
  return (
    <DiscoverEmpty>
      {children} – schaut in die <InternalLink to="/partner">Partnerliste</InternalLink>.
    </DiscoverEmpty>
  )
}

// Kapitel aus Partnerkarten und den Empfehlungen desselben Bereichs (Hundeschulen, Salon & Betreuung):
// Umkreis-Hinweis, die nahen Partner samt Empfehlungen, dann "Weiter weg".
function PartnerChapter({ id, number, title, lede, emptyHint, partner, promotions, fallback }) {
  const { near, far } = splitByDistance(partner)
  const isEmpty = partner.length === 0 && promotions.length === 0

  return (
    <DiscoverChapter id={id} number={number} title={title} lede={lede}>
      {fallback && <FallbackNote />}
      {isEmpty ? (
        <PartnerListHint>{emptyHint}</PartnerListHint>
      ) : (
        <>
          <PartnerList items={near} promotions={promotions} />
          {far.length > 0 && (
            <FarAway>
              <PartnerList items={far} />
            </FarAway>
          )}
        </>
      )}
    </DiscoverChapter>
  )
}

export function HundeschulenSection({ partner, promotions, fallback }) {
  return (
    <PartnerChapter
      id="entdecken-hundeschulen"
      number="01"
      title="Hundeschule gesucht?"
      lede="Partner-Hundeschulen, Kurse und Angebote."
      emptyHint="Noch keine Hundeschulen in der Nähe"
      partner={partner}
      promotions={promotions}
      fallback={fallback}
    />
  )
}

// Phase P2: Hundesalons und Betreuung (Hundesitter, Tagesstätte, Pension) - eigenes Kapitel nach den
// Hundeschulen, gleicher Aufbau.
export function SalonSection({ partner, promotions, fallback }) {
  return (
    <PartnerChapter
      id="entdecken-salon"
      number="02"
      title="Salon & Betreuung"
      lede="Hundesalons, Hundesitter, Tagesstätten und Pensionen."
      emptyHint="Noch keine Hundesalons oder Betreuung in der Nähe"
      partner={partner}
      promotions={promotions}
      fallback={fallback}
    />
  )
}

// Empfehlungen (bereich "begleiter", z. B. Patenschaften) stehen nach Tierheimen und Tieren im Umkreis,
// aber VOR "Weiter weg" - sonst läsen sie sich (auch per Überschriften-Navigation) als weit entfernt.
export function BegleiterSection({ partner, tiere, promotions, fallback }) {
  const shelters = splitByDistance(partner)
  const animals = splitByDistance(tiere)
  const isEmpty = partner.length === 0 && tiere.length === 0 && promotions.length === 0
  const hasFar = shelters.far.length > 0 || animals.far.length > 0

  return (
    <DiscoverChapter
      id="entdecken-begleiter"
      number="03"
      title="Neuer Begleiter gesucht?"
      lede="Tierheime, Vermittlungsstellen und Tiere, die ein Zuhause suchen."
    >
      <p className="discover-trust-note">
        <Icon name="check" />
        Hier findet ihr nur Tierheime und Vermittlungsstellen – keine Züchter.
      </p>
      {fallback && <FallbackNote />}
      {isEmpty ? (
        <PartnerListHint>Noch keine Tierheime oder Vermittlungsstellen in der Nähe</PartnerListHint>
      ) : (
        <>
          <PartnerList items={shelters.near} />
          <AnimalList items={animals.near} />
          <PromotionList items={promotions} />
          {hasFar && (
            <FarAway>
              <PartnerList items={shelters.far} />
              <AnimalList items={animals.far} />
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

export function FutterSection({ futter }) {
  return (
    <DiscoverChapter
      id="entdecken-futter"
      number="04"
      title="Futter-Empfehlungen"
      lede="Klar gekennzeichnet: was eine Empfehlung ist und was eine Anzeige."
    >
      {futter.length === 0 ? (
        <DiscoverEmpty icon="star">Noch keine Futter-Empfehlungen – schaut bald wieder vorbei.</DiscoverEmpty>
      ) : (
        <PromotionList items={futter} />
      )}
    </DiscoverChapter>
  )
}

export function SupportSection({ support }) {
  return (
    <DiscoverChapter id="entdecken-unterstuetzen" number="05" title="Unterstützen" lede="Tieren in Vermittlung helfen – und sehen, wohin das Geld geht.">
      <SupportBlock support={support} />
    </DiscoverChapter>
  )
}
