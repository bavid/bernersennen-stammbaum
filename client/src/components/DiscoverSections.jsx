import { Link } from 'react-router-dom'
import Icon from './Icon.jsx'
import PartnerCard from './PartnerCard.jsx'
import AnimalAdoptionCard from './AnimalAdoptionCard.jsx'
import PromotionCard from './PromotionCard.jsx'
import SupportBlock from './SupportBlock.jsx'
import DiscoverChapter, { DiscoverEmpty, DiscoverSubheading, FallbackNote } from './DiscoverChapter.jsx'
import { splitByDistance } from '../lib/discover.js'

// Die vier Kapitel des Reiters "Entdecken" - jedes bekommt seine Daten bereits normalisiert
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

function PromotionList({ items }) {
  if (items.length === 0) return null
  return (
    <ul className="promotion-list">
      {items.map((promotion) => (
        <li key={promotion.id}>
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

function PartnerListHint({ children }) {
  return (
    <DiscoverEmpty>
      {children} – schaut in die <Link to="/partner">Partnerliste</Link>.
    </DiscoverEmpty>
  )
}

export function HundeschulenSection({ partner, promotions, fallback }) {
  const { near, far } = splitByDistance(partner)
  const isEmpty = partner.length === 0 && promotions.length === 0

  return (
    <DiscoverChapter id="entdecken-hundeschulen" number="01" title="Hundeschule gesucht?" lede="Partner-Hundeschulen, Kurse und Angebote.">
      {fallback && <FallbackNote />}
      {isEmpty ? (
        <PartnerListHint>Noch keine Hundeschulen in der Nähe</PartnerListHint>
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

export function BegleiterSection({ partner, tiere, fallback }) {
  const shelters = splitByDistance(partner)
  const animals = splitByDistance(tiere)
  const isEmpty = partner.length === 0 && tiere.length === 0
  const hasFar = shelters.far.length > 0 || animals.far.length > 0

  return (
    <DiscoverChapter
      id="entdecken-begleiter"
      number="02"
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
          {hasFar && (
            <FarAway>
              <PartnerList items={shelters.far} />
              <AnimalList items={animals.far} />
            </FarAway>
          )}
        </>
      )}
      <Link to="/umgebung" className="discover-more-link">
        Mehr in der Nähe
        <span className="visually-hidden"> (Tierheime, Vermittlungsstellen und Hundeschulen)</span>
        <span aria-hidden="true"> →</span>
      </Link>
    </DiscoverChapter>
  )
}

export function FutterSection({ futter }) {
  return (
    <DiscoverChapter
      id="entdecken-futter"
      number="03"
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
    <DiscoverChapter id="entdecken-unterstuetzen" number="04" title="Unterstützen" lede="Tieren in Vermittlung helfen – und sehen, wohin das Geld geht.">
      <SupportBlock support={support} />
    </DiscoverChapter>
  )
}
