import Icon from './Icon.jsx'
import PartnerMark from './PartnerMark.jsx'
import { CardVisual } from './PartnerCard.jsx'
import { ExternalLink, InternalLink } from './PreviewLink.jsx'
import { TYPE_LABELS } from '../lib/partnerTypes.js'
import { formatDistanceKm, isExternalUrl } from '../lib/format.js'
import { formatDateLong, formatDateShort, todayIso } from '../lib/dates.js'
import { naechsterTerminText } from '../lib/termine.js'
import { zeitraeumeText } from '../lib/zeitraeume.js'
import {
  PENDING_APPROVAL_LABEL,
  isAllowedMedia,
  isAnzeige,
  isClickUrl,
  isPendingApproval,
  kennzeichnungLabel,
  promotionRel
} from '../lib/discover.js'
import { useIsPreview } from '../lib/preview.js'

// Wie der Server (server/lib/partnerPostOrder.js CARD_ANZEIGEN, lib/einblickPins.js CARD_EINBLICKE): höchstens drei.
const MAX_ANZEIGEN = 3
const MAX_EINBLICKE = 3
const EINBLICK_SIZE = 96

function websiteHref(partner) {
  if (isClickUrl(partner.clickUrl)) return partner.clickUrl
  return isExternalUrl(partner.website) ? partner.website : null
}

// Kopf wie bei PartnerCard: Logo, ohne Logo das neueste Einblick-Foto (teaserFoto), sonst ein ruhiges Symbol.
function CardHead({ partner, preview }) {
  const typeLabel = TYPE_LABELS[partner.typ] || partner.typ
  const teaser = isAllowedMedia(partner.teaserFoto, { preview }) ? partner.teaserFoto : null
  return (
    <div className="partner-card-head">
      <CardVisual partner={partner} teaser={teaser} />
      <div className="partner-card-title">
        <h3>{partner.name}</h3>
        <p className="partner-card-meta">
          <PartnerMark badge={partner.badge} />
          <span>{typeLabel}</span>
          {partner.plz && partner.ort && (
            <span>
              {partner.plz} {partner.ort}
            </span>
          )}
          {typeof partner.distanceKm === 'number' && <span className="partner-card-distance">{formatDistanceKm(partner.distanceKm)}</span>}
          {/* Phase F: steht hier wegen „Überall sichtbar“, nicht wegen der Nähe - ein leiser Hinweis. */}
          {partner.ueberall === true && <span className="partner-card-ueberall">überall sichtbar</span>}
        </p>
      </div>
    </div>
  )
}

// Eine Anzeige als kompakte Zeile: Kennzeichnung zuerst (rechtlich: immer sichtbar, "Anzeige" auffällig), der Titel
// ist der Link über die Klickzählung (rel="sponsored" bei Anzeigen), darunter eine Zeile Text. In der Kundensicht trägt
// ein noch nicht freigegebener Beitrag "Wartet auf Freigabe" und hat keinen Link.
function AdRow({ ad }) {
  const preview = useIsPreview()
  const pending = preview && isPendingApproval(ad)
  const anzeige = isAnzeige(ad.kennzeichnung)
  const hasLink = isClickUrl(ad.clickUrl)

  return (
    <li className={`partner-discover-ad${pending ? ' is-pending' : ''}`}>
      <span className="partner-discover-ad-badges">
        <span className={`promotion-badge${anzeige ? ' promotion-badge-anzeige' : ''}`}>{kennzeichnungLabel(ad)}</span>
        {pending && (
          <span className="promotion-badge promotion-badge-pending">
            <Icon name="clock" />
            {PENDING_APPROVAL_LABEL}
          </span>
        )}
      </span>
      <h4 className="partner-discover-ad-heading">
        {hasLink ? (
          <ExternalLink className="partner-discover-ad-link" href={ad.clickUrl} rel={promotionRel(ad.kennzeichnung)}>
            <span className="partner-discover-ad-title">{ad.titel}</span>
            <Icon name="external" />
            <span className="visually-hidden"> (öffnet in neuem Tab)</span>
          </ExternalLink>
        ) : (
          <span className="partner-discover-ad-title">{ad.titel}</span>
        )}
      </h4>
      {ad.text && <p className="partner-discover-ad-text">{ad.text}</p>}
      <AdTermine zeitraeume={ad.zeitraeume} />
    </li>
  )
}

// Phase V4a: die kommenden Termine einer Anzeige ("Termine: 1.2., 1.3., 5.–10.5.") - ohne kommende nichts.
function AdTermine({ zeitraeume }) {
  const text = zeitraeumeText(zeitraeume, todayIso())
  if (!text) return null
  return (
    <p className="partner-discover-ad-termine">
      <Icon name="calendar" />
      {text}
    </p>
  )
}

// Phase V4a: der nächste Termin aus dem Kalender des Partners ("Sa, 12.10., 10:00 · Welpenspielstunde").
function NextTermin({ termin }) {
  const text = naechsterTerminText(termin)
  if (!text) return null
  return (
    <p className="partner-discover-next">
      <Icon name="calendar" />
      <span>
        <span className="partner-discover-next-label">Nächster Termin:</span> {text}
      </span>
    </p>
  )
}

// Einblicke als drei kleine Fotos mit Datum - nur öffentliche Fotos, in der Kundensicht auch die eigenen über /uploads.
// Ein einzelnes Foto steht größer da (is-single, Audit V7a) - allein in Briefmarken-Größe wirkte es verloren.
function EinblickStrip({ partner, einblicke }) {
  if (einblicke.length === 0) return null
  return (
    <ul className={`partner-discover-einblicke${einblicke.length === 1 ? ' is-single' : ''}`} aria-label={`Einblicke bei ${partner.name}`}>
      {einblicke.map((einblick) => (
        <li key={einblick.id}>
          <figure>
            <img
              src={einblick.fotoUrl}
              alt={einblick.text || `Einblick vom ${formatDateLong(einblick.datum)}`}
              width={EINBLICK_SIZE}
              height={EINBLICK_SIZE}
              loading="lazy"
            />
            <figcaption>
              <time dateTime={einblick.datum}>{formatDateShort(einblick.datum)}</time>
            </figcaption>
          </figure>
        </li>
      ))}
    </ul>
  )
}

// Phase V1: EINE Karte je Partner in "Entdecken" (Hundeschulen, Salon & Betreuung, Neue Begleiter) statt Partner-Karte
// plus einzelner Anzeigen-Karten: oben Logo, Name, Merkmal und Kurzbeschreibung mit "Zum Portal" und "Website",
// darunter bis zu drei Anzeigen des Partners (in seiner Reihenfolge) und seine angepinnten oder neuesten Einblicke.
// Phase V4a: im Kopf eine Zeile "Nächster Termin" (naechsterTermin), an den Anzeigen ihre kommenden Termine.
// Mit Anzeigen darf die Karte am Desktop zwei Spalten breit sein (has-anzeigen, discover.css). In der Kundensicht
// trägt die eigene Karte (vorschau: true) "Das seid ihr".
// compact (Entdecken unter "Alle", Audit W): Kopf, Kurztext (zwei Zeilen) und Links - Anzeigen, Einblicke und der nächste
// Termin stehen im eigenen Reiter.
export default function PartnerDiscoverCard({ partner, compact = false }) {
  const preview = useIsPreview()
  const isOwn = preview && partner.vorschau === true
  const website = websiteHref(partner)
  const anzeigen = compact || !Array.isArray(partner.anzeigen) ? [] : partner.anzeigen.slice(0, MAX_ANZEIGEN)
  const einblicke = (compact || !Array.isArray(partner.einblicke) ? [] : partner.einblicke)
    .filter((einblick) => isAllowedMedia(einblick?.fotoUrl, { preview }))
    .slice(0, MAX_EINBLICKE)
  const classes = ['partner-discover-card', 'partner-card', 'card', anzeigen.length > 0 && 'has-anzeigen', isOwn && 'is-own-preview', compact && 'is-compact']

  return (
    <article className={classes.filter(Boolean).join(' ')}>
      <div className="partner-discover-head">
        {isOwn && (
          <p className="preview-own-badge">
            <Icon name="eye" />
            Das seid ihr
          </p>
        )}
        <CardHead partner={partner} preview={preview} />
        {partner.kurztext && <p className="partner-discover-text">{partner.kurztext}</p>}
        {!compact && <NextTermin termin={partner.naechsterTermin} />}
        <div className="partner-card-links">
          <InternalLink className="btn btn-ghost" to={`/p/${partner.slug}`}>
            Zum Portal
          </InternalLink>
          {website && (
            <ExternalLink className="card-link" href={website}>
              <Icon name="globe" /> Website
            </ExternalLink>
          )}
        </div>
      </div>
      {anzeigen.length > 0 && (
        <ul className="partner-discover-ads" aria-label={`Anzeigen von ${partner.name}`}>
          {anzeigen.map((ad) => (
            <AdRow key={ad.id} ad={ad} />
          ))}
        </ul>
      )}
      <EinblickStrip partner={partner} einblicke={einblicke} />
    </article>
  )
}
