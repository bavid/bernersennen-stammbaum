import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import ThemeMark from '../components/ThemeMark.jsx'
import Avatar from '../components/Avatar.jsx'
import ExpandableText from '../components/ExpandableText.jsx'
import PublicFooter from '../components/PublicFooter.jsx'
import PublicHeader from '../components/PublicHeader.jsx'
import PortalBrandStrip from '../components/PortalBrandStrip.jsx'
import Icon from '../components/Icon.jsx'
import SteckbriefShelterBox from '../components/SteckbriefShelterBox.jsx'
import { ageText, formatDayMonth } from '../lib/dates.js'
import { groupByYear, speciesSexLabel } from '../lib/timeline.js'
import { kategorieLabel } from '../lib/shelter.js'
import { PAUSED_HINT, vermittlungStatusLabel } from '../lib/vermittlung.js'
import { PREVIEW_DISABLED_HINT, PreviewProvider } from '../lib/preview.js'
import { useNoIndex } from '../hooks/useNoIndex.js'
import { t } from '../lib/i18n/index.js'

const SHARE_COPIED_MS = 2000
const PREVIEW_LOAD_ERROR = 'Dieser Steckbrief konnte gerade nicht geladen werden. Bitte versucht es gleich noch einmal.'

// inApp: angemeldet in der Hülle der App (App.jsx) - deren Kopf und Fuß stehen schon da.
function NotFound({ inApp }) {
  return (
    <div className={`steckbrief-missing ${inApp ? 'public-in-app' : 'public-page'}`}>
      {!inApp && <PublicHeader />}
      <div className="card empty-state">
        <ThemeMark size={56} />
        <h1>{t('Diesen Steckbrief gibt es nicht')}</h1>
        <p className="muted">{t('Vielleicht ist er nicht mehr aktuell, oder der Link ist veraltet.')}</p>
        <Link className="btn btn-primary" to="/partner">
          {t('Zur Partnerliste')}
        </Link>
      </div>
      {!inApp && <PublicFooter />}
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
            {kategorie ? <span className="kategorie-badge">{t(kategorie)}</span> : null}
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
      <span className="eyebrow">{t('Chronik')}</span>
      <h2 id="steckbrief-chronicle-title">{t('Was bisher geschah')}</h2>
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

// Vermittlungsstatus unter dem Namen (Phase P): "Verfügbar"/"Reserviert"/"Pausiert" - ein
// pausiertes Tier bleibt öffentlich, bekommt aber den Hinweis, dass es gerade nicht vermittelbar ist.
// Ohne Status (ältere Antwort) erscheint nichts.
function VermittlungStatus({ status }) {
  const label = vermittlungStatusLabel(status)
  if (!label) return null
  return (
    <div className="steckbrief-vermittlung">
      <span className={`chip status-chip status-chip-${status}`}>{t(label)}</span>
      {status === 'pausiert' && <p className="steckbrief-paused-hint">{t(PAUSED_HINT)}</p>}
    </div>
  )
}

// /t/:slug - der öffentliche Steckbrief eines Tiers in Vermittlung (Phase T Task 5). Kein Login, immer
// noindex (auch die 404-Antwort: der Server setzt X-Robots-Tag, hier zusätzlich das Meta-Tag im head -
// siehe server/routes/publicAnimals.js). Kontakt läuft ausschließlich zum Tierheim - direkt oder (Phase P2)
// per "Schreib uns" in dessen Postfach (SteckbriefShelterBox).
// Kundensicht (Phase P1): load liefert den Steckbrief statt api.publicAnimal(slug) (z. B.
// api.partnerArea.previewAnimal, auch für ein noch unveröffentlichtes Tier), preview schaltet Links und
// "Teilen" ab. Feedback-Runde: ohne Sitzung mit dem schlanken öffentlichen Kopf, angemeldet (inApp, App.jsx) in der
// normalen Hülle der App - ohne zweiten Kopf, Fuß oder "Zurück".
export default function SteckbriefPage({ slug, load, preview = false, inApp = false }) {
  const [animal, setAnimal] = useState(undefined) // undefined: lädt, null: nicht gefunden
  const [shareCopied, setShareCopied] = useState(false)

  // Gilt für die ganze Seite, auch während des Ladens und im 404-Fall (hooks/useNoIndex.js). Die Kundensicht
  // ist keine öffentliche Seite - dort bleibt der head unberührt.
  useNoIndex(!preview)

  useEffect(() => {
    let cancelled = false
    setAnimal(undefined)
    const request = typeof load === 'function' ? Promise.resolve().then(() => load()) : api.publicAnimal(slug)
    request
      .then((data) => {
        if (!cancelled) setAnimal(data)
      })
      .catch(() => {
        if (!cancelled) setAnimal(null)
      })
    return () => {
      cancelled = true
    }
  }, [slug, load])

  useEffect(() => {
    if (!shareCopied) return undefined
    const timer = setTimeout(() => setShareCopied(false), SHARE_COPIED_MS)
    return () => clearTimeout(timer)
  }, [shareCopied])

  if (animal === undefined) {
    return preview || inApp ? (
      <p className={`muted ${preview ? 'preview-loading' : 'page-loading'}`} role="status" aria-busy="true">
        {t('Lädt …')}
      </p>
    ) : (
      <div className="splash" aria-busy="true">
        <ThemeMark size={72} />
      </div>
    )
  }

  if (animal === null) {
    return preview ? (
      <div className="error-banner" role="alert">
        {t(PREVIEW_LOAD_ERROR)}
      </div>
    ) : (
      <NotFound inApp={inApp} />
    )
  }

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
    <PreviewProvider value={preview}>
      <SteckbriefContent
        animal={animal}
        slug={slug}
        age={age}
        preview={preview}
        inApp={inApp}
        shareCopied={shareCopied}
        onShare={handleShare}
      />
    </PreviewProvider>
  )
}

// Der geladene Steckbrief. In der Vorschau ist "Teilen" sichtbar, aber deaktiviert - es gäbe (noch) keine
// öffentliche Adresse, und die Kundensicht soll nichts nach außen tragen. Ohne Fußzeile: die Links dort
// würden die Vorschau verlassen - aus demselben Grund auch ohne Kopf mit "Zurück" (PublicHeader). Angemeldet (inApp)
// stehen Kopf und Fuß der App schon da.
function SteckbriefContent({ animal, slug, age, preview, inApp, shareCopied, onShare }) {
  const ownChrome = !preview && !inApp
  return (
    <div className={`steckbrief-page ${inApp ? 'public-in-app' : 'public-page'}`}>
      {ownChrome && <PublicHeader />}
      <div className="dog-hero steckbrief-hero">
        <div className="dog-hero-photo">
          <Avatar dog={{ foto_url: animal.fotoUrl, name: animal.name }} size={320} className="dog-hero-fallback" />
        </div>
        <div className="dog-hero-body">
          <span className="eyebrow">{speciesSexLabel(animal.tierart, animal.geschlecht).split(' · ').map((part) => t(part)).join(' · ')}</span>
          <h1>{animal.name}</h1>
          <VermittlungStatus status={animal.vermittlung_status} />
          <dl className="facts">
            <div>
              <dt>{t('Rasse')}</dt>
              <dd>{animal.rasse || <span className="muted">{t('nicht angegeben')}</span>}</dd>
            </div>
            <div>
              <dt>{t('Alter')}</dt>
              <dd>{age || <span className="muted">{t('unbekannt')}</span>}</dd>
            </div>
          </dl>
          {animal.beschreibung && <ExpandableText text={animal.beschreibung} className="dog-hero-description" lines={4} />}
          {preview ? (
            <button type="button" className="btn btn-ghost" disabled title={t(PREVIEW_DISABLED_HINT)} aria-description={t(PREVIEW_DISABLED_HINT)}>
              <Icon name="share" />
              {t('Teilen')}
            </button>
          ) : (
            <button type="button" className={`btn ${shareCopied ? 'btn-ink' : 'btn-ghost'}`} onClick={onShare}>
              <Icon name={shareCopied ? 'check' : 'share'} />
              {shareCopied ? t('Link kopiert') : t('Teilen')}
            </button>
          )}
        </div>
      </div>

      <PublicChronicle entries={animal.entries || []} />

      <SteckbriefShelterBox shelter={animal.shelter} animalName={animal.name} animalSlug={slug} />

      {/* Feedback-Runde: wie auf dem Portal keine Demo, nur ein leiser Link zur Startseite (dort gibt es die Demo). */}
      {ownChrome && <PortalBrandStrip />}
      {ownChrome && <PublicFooter />}
    </div>
  )
}
