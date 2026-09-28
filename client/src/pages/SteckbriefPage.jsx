import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import ThemeMark from '../components/ThemeMark.jsx'
import Avatar from '../components/Avatar.jsx'
import ExpandableText from '../components/ExpandableText.jsx'
import PublicFooter from '../components/PublicFooter.jsx'
import Icon from '../components/Icon.jsx'
import { ageText, formatDayMonth } from '../lib/dates.js'
import { groupByYear, speciesSexLabel } from '../lib/timeline.js'
import { kategorieLabel } from '../lib/shelter.js'
import { isExternalUrl, isValidPhone, telHref } from '../lib/format.js'

const SHARE_COPIED_MS = 2000

function NotFound() {
  return (
    <div className="public-page steckbrief-missing">
      <div className="card empty-state">
        <ThemeMark size={56} />
        <h1>Diesen Steckbrief gibt es nicht</h1>
        <p className="muted">Vielleicht ist er nicht mehr aktuell, oder der Link ist veraltet.</p>
        <Link className="btn btn-primary" to="/partner">
          Zur Partnerliste
        </Link>
      </div>
      <PublicFooter />
    </div>
  )
}

// Ein einzelner öffentlicher Eintrag - Klartext wie im internen Timeline.jsx (Entry), aber ohne Autor,
// Bearbeiten-Knopf oder Kommentare: die öffentliche API liefert davon bewusst nichts mit (Datenschutz).
function PublicEntry({ entry }) {
  const kategorie = kategorieLabel(entry.kategorie)
  return (
    <article className="entry-card">
      <header className="entry-head">
        <div>
          <h3 className="entry-title">
            {entry.titel}
            {kategorie ? <span className="kategorie-badge">{kategorie}</span> : null}
          </h3>
        </div>
      </header>
      {entry.text && <ExpandableText text={entry.text} className="entry-text" lines={6} />}
      {entry.fotoUrls?.length > 0 && (
        <div className={`entry-photos count-${Math.min(entry.fotoUrls.length, 4)}`}>
          {entry.fotoUrls.map((url) => (
            <span key={url} className="entry-photo">
              <img src={url} alt="" loading="lazy" />
            </span>
          ))}
        </div>
      )}
    </article>
  )
}

// Öffentliche Chronik als Zeitleiste, jahresweise gruppiert wie die interne Timeline (gleiche CSS-
// Klassen, gleiches Aussehen) - eigene, schlanke Darstellung statt Timeline.jsx, weil die öffentlichen
// Einträge eine andere Form haben (kein autor_name/id/comments, fotoUrls statt foto_urls).
function PublicChronicle({ entries }) {
  if (!entries.length) return null
  const groups = groupByYear(entries)
  return (
    <section className="chronicle" aria-labelledby="steckbrief-chronicle-title">
      <span className="eyebrow">Chronik</span>
      <h2 id="steckbrief-chronicle-title">Was bisher geschah</h2>
      <ol className="timeline">
        {groups.map((group) => (
          <li key={group.year} className="timeline-year">
            <h3 className="timeline-year-label">{group.year}</h3>
            <ol className="timeline-items">
              {group.items.map((item, index) => (
                <li key={`${item.datum}-${index}`} className="timeline-item timeline-item-entry">
                  <time className="timeline-date" dateTime={item.datum}>
                    {formatDayMonth(item.datum)}
                  </time>
                  <span className="timeline-node" aria-hidden="true" />
                  <PublicEntry entry={item} />
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ol>
    </section>
  )
}

function ShelterBox({ shelter }) {
  return (
    <section className="card steckbrief-shelter">
      <div className="steckbrief-shelter-head">
        {shelter.logoUrl && <img src={shelter.logoUrl} alt={`Logo von ${shelter.name}`} className="partner-logo" />}
        <div>
          <span className="eyebrow">Tierheim</span>
          <h2>{shelter.name}</h2>
        </div>
      </div>
      <p className="steckbrief-shelter-note">Die Vermittlung läuft direkt über das Tierheim.</p>
      <div className="partner-portal-contact">
        <h3>Anfrage direkt beim Tierheim</h3>
        <ul>
          {isExternalUrl(shelter.website) && (
            <li>
              <Icon name="globe" />
              <a href={shelter.website} target="_blank" rel="noopener noreferrer">
                {shelter.website}
              </a>
            </li>
          )}
          {shelter.kontakt_email && (
            <li>
              <Icon name="mail" />
              <a href={`mailto:${shelter.kontakt_email}`}>{shelter.kontakt_email}</a>
            </li>
          )}
          {isValidPhone(shelter.kontakt_telefon) && (
            <li>
              <Icon name="phone" />
              <a href={telHref(shelter.kontakt_telefon)}>{shelter.kontakt_telefon}</a>
            </li>
          )}
        </ul>
        {isExternalUrl(shelter.vermittlung_url) && (
          <a href={shelter.vermittlung_url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
            Zur Vermittlungsseite
          </a>
        )}
      </div>
      <Link className="btn btn-primary btn-block" to={`/p/${shelter.slug}`}>
        Zum Portal von {shelter.name}
      </Link>
    </section>
  )
}

// /t/:slug - der öffentliche Steckbrief eines Tiers in Vermittlung (Phase T Task 5). Kein Login, immer
// noindex (auch die 404-Antwort: der Server setzt X-Robots-Tag, hier zusätzlich das Meta-Tag im head -
// siehe server/routes/publicAnimals.js). Kontakt läuft ausschließlich über das Tierheim, nie über die App.
export default function SteckbriefPage({ slug }) {
  const [animal, setAnimal] = useState(undefined) // undefined: lädt, null: nicht gefunden
  const [shareCopied, setShareCopied] = useState(false)

  // Gilt für die ganze Seite, auch während des Ladens und im 404-Fall - deshalb unbedingt, nicht erst
  // nach dem Laden gesetzt. Wird beim Verlassen wieder entfernt (Steckbriefe sind nur hier noindex).
  useEffect(() => {
    const meta = document.createElement('meta')
    meta.setAttribute('name', 'robots')
    meta.setAttribute('content', 'noindex')
    document.head.appendChild(meta)
    return () => {
      document.head.removeChild(meta)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setAnimal(undefined)
    api
      .publicAnimal(slug)
      .then((data) => {
        if (!cancelled) setAnimal(data)
      })
      .catch(() => {
        if (!cancelled) setAnimal(null)
      })
    return () => {
      cancelled = true
    }
  }, [slug])

  useEffect(() => {
    if (!shareCopied) return undefined
    const timer = setTimeout(() => setShareCopied(false), SHARE_COPIED_MS)
    return () => clearTimeout(timer)
  }, [shareCopied])

  if (animal === undefined) {
    return (
      <div className="splash" aria-busy="true">
        <ThemeMark size={72} />
      </div>
    )
  }

  if (animal === null) return <NotFound />

  const age = animal.geburtsdatum ? ageText(animal.geburtsdatum) : null
  const shareUrl = `${window.location.origin}/t/${slug}`
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  async function handleShare() {
    if (canShare) {
      try {
        await navigator.share({ title: animal.name, url: shareUrl })
      } catch {
        // Abgebrochen oder nicht unterstützt - nichts zu tun.
      }
      return
    }
    try {
      await navigator.clipboard.writeText(shareUrl)
      setShareCopied(true)
    } catch {
      // Ohne Zwischenablage-Recht bleibt der Link in der Adressleiste sichtbar.
    }
  }

  return (
    <div className="public-page steckbrief-page">
      <header className="dog-hero steckbrief-hero">
        <div className="dog-hero-photo">
          <Avatar dog={{ foto_url: animal.fotoUrl, name: animal.name }} size={320} className="dog-hero-fallback" />
        </div>
        <div className="dog-hero-body">
          <span className="eyebrow">{speciesSexLabel(animal.tierart, animal.geschlecht)}</span>
          <h1>{animal.name}</h1>
          <dl className="facts">
            <div>
              <dt>Rasse</dt>
              <dd>{animal.rasse || <span className="muted">nicht angegeben</span>}</dd>
            </div>
            <div>
              <dt>Alter</dt>
              <dd>{age || <span className="muted">unbekannt</span>}</dd>
            </div>
          </dl>
          {animal.beschreibung && <ExpandableText text={animal.beschreibung} className="dog-hero-description" lines={4} />}
          <button type="button" className={`btn ${shareCopied ? 'btn-ink' : 'btn-ghost'}`} onClick={handleShare}>
            <Icon name={shareCopied ? 'check' : 'share'} />
            {shareCopied ? 'Link kopiert' : 'Teilen'}
          </button>
        </div>
      </header>

      <PublicChronicle entries={animal.entries || []} />

      <ShelterBox shelter={animal.shelter} />

      <PublicFooter />
    </div>
  )
}
