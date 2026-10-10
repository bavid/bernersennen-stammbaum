import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import PublicHeader from '../components/PublicHeader.jsx'
import LocationPicker from '../components/LocationPicker.jsx'
import PublicFooter from '../components/PublicFooter.jsx'
import Icon from '../components/Icon.jsx'
import EntdeckenCard from '../components/entdecken/EntdeckenCard.jsx'
import EntdeckenSuche from '../components/entdecken/EntdeckenSuche.jsx'
import useEntdecken, { DEFAULT_RADIUS, START_SUCHE } from '../components/entdecken/useEntdecken.js'
import { t } from '../lib/i18n/index.js'
import { Button, EmptyState } from '../components/ui/index.js'

const PLZ_LENGTH = 5
const INCOMPLETE_PLZ_ERROR = 'Bitte eine 5-stellige Postleitzahl eingeben.'
const LIST_ID = 'entdecken-treffer'

// /partner – öffentliches Entdecken (von der Startseite „Entdecken“): Tierheime, Hundeschulen, Salons und mehr. Suche nach
// Name/Art/Ort, Typ-Umschalter, „In der Nähe“ per PLZ + Umkreis (LocationPicker) und oben der Abschnitt „Deutschlandweit“
// (vom Team freigegebene Partner, unabhängig von der PLZ). Der Server filtert, sortiert und teilt in Seiten
// (server/routes/publicEntdecken.js); „Mehr laden“ hängt die nächste Seite an. Kein Tracking, keine fremde Werbung.
// Ohne Sitzung mit dem schlanken öffentlichen Kopf und Fuß, angemeldet (inApp, App.jsx) in der normalen Hülle der App.

function CardList({ items, id }) {
  return (
    <ul className="entdecken-list" id={id}>
      {items.map((partner) => (
        <li key={partner.slug}>
          <EntdeckenCard partner={partner} />
        </li>
      ))}
    </ul>
  )
}

function trefferTitle(applied) {
  return applied.plz ? t('In der Nähe von {ort}', { ort: applied.plz }) : t('Alle Einträge')
}

function Treffer({ entdecken }) {
  const { result, applied, loadingMore, loadMore } = entdecken
  if (!result.treffer.length) {
    if (result.deutschlandweit.length) return null
    return (
      <EmptyState icon="search" title={t('Nichts gefunden')} live>
        {applied.plz ? t('Versucht es mit einem größeren Umkreis oder einer anderen Art.') : t('Versucht es mit einem anderen Suchwort oder einer anderen Art.')}
      </EmptyState>
    )
  }
  return (
    <section className="entdecken-section" aria-labelledby="entdecken-treffer-title">
      <h2 id="entdecken-treffer-title" className="entdecken-section-title">
        {trefferTitle(applied)} <span className="entdecken-count">{t(result.gesamt === 1 ? '1 Treffer' : '{n} Treffer', { n: result.gesamt })}</span>
      </h2>
      <CardList items={result.treffer} id={LIST_ID} />
      {result.mehr && (
        <div className="entdecken-more">
          <Button type="button" variant="ghost" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? t('Lädt …') : t('Mehr laden')}
          </Button>
        </div>
      )}
    </section>
  )
}

function Deutschlandweit({ items }) {
  if (!items.length) return null
  return (
    <section className="entdecken-section entdecken-weit" aria-labelledby="entdecken-weit-title">
      <h2 id="entdecken-weit-title" className="entdecken-section-title">
        <Icon name="globe" /> {t('Deutschlandweit')}
      </h2>
      <p className="muted entdecken-section-lede">{t('Für alle da, egal wo ihr wohnt – vom Team freigegeben.')}</p>
      <CardList items={items} />
    </section>
  )
}

export default function PartnersPage({ inApp = false }) {
  const entdecken = useEntdecken()
  const { applied, loading, error, load, setError } = entdecken
  const [q, setQ] = useState('')
  const [plz, setPlz] = useState('')
  const [radius, setRadius] = useState(DEFAULT_RADIUS)

  useEffect(() => {
    load(START_SUCHE)
    // Nur beim ersten Laden – danach lösen Suche, Umschalter und Ortswahl aus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleLocationSubmit(event) {
    event.preventDefault()
    // Eine angefangene PLZ (1-4 Ziffern) gilt nicht stillschweigend als „überall“ (Finding 10).
    if (plz.length > 0 && plz.length < PLZ_LENGTH) {
      setError(INCOMPLETE_PLZ_ERROR)
      return false
    }
    load({ ...applied, q, plz: plz.length === PLZ_LENGTH ? plz : null, radius })
    return true
  }

  return (
    <div className={`partners-page entdecken-page ${inApp ? 'public-in-app' : 'public-page'}`}>
      {!inApp && <PublicHeader />}
      <div className="partners-hero">
        <span className="eyebrow">{t('Tierheime, Hundeschulen & mehr')}</span>
        <h1>{t('Entdecken')}</h1>
        <p className="page-lede">
          {t('Hier findet ihr Tierheime, Hundeschulen, Salons und mehr – sichtbar, weil sie mitmachen. Keine fremde Werbung, kein Tracking, kein Datenhandel.')}
        </p>
      </div>

      <EntdeckenSuche
        q={q}
        typ={applied.typ}
        onQChange={setQ}
        onSubmit={() => load({ ...applied, q: q.trim() })}
        onTypChange={(typ) => load({ ...applied, q: q.trim(), typ })}
        controls={LIST_ID}
      />
      <LocationPicker
        plz={plz}
        radius={radius}
        onPlzChange={setPlz}
        onRadiusChange={setRadius}
        onSubmit={handleLocationSubmit}
        collapsible
        applied={applied}
        allowEverywhere
      />

      {error && (
        <div className="error-banner" role="alert">
          {t(error)}
        </div>
      )}

      {loading ? (
        <p className="muted" aria-busy="true">
          {t('Lädt …')}
        </p>
      ) : (
        <>
          <Deutschlandweit items={entdecken.result.deutschlandweit} />
          <Treffer entdecken={entdecken} />
        </>
      )}

      {/* Phase 5 Task 4: Weg zur Infoseite für künftige Partner (PartnerInfoPage, /partner-werden). */}
      <aside className="partners-cta card" aria-labelledby="partners-cta-title">
        <div>
          <h2 id="partners-cta-title">{t('Ihr seid Hundeschule, Tierheim, Hundesalon oder Betreuung?')}</h2>
          <p className="muted">{t('Ein eigenes Profil bei uns ist heute kostenlos – mit Portal, Einblicken und Einladungscodes.')}</p>
        </div>
        <Button to="/partner-werden" as={Link}>
          {t('Partner werden')} <Icon name="arrowRight" />
        </Button>
      </aside>

      {!inApp && <PublicFooter geoNames />}
    </div>
  )
}
