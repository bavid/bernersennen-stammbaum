import { DiscoverEmpty } from './DiscoverChapter.jsx'
import { BegleiterSection, FutterSection, HundeschulenSection, SalonSection, SupportSection } from './DiscoverSections.jsx'
import { InternalLink } from './PreviewLink.jsx'
import { t } from '../lib/i18n/index.js'
import { ALL_TAB, PREVIEW_LIMIT, SECTION_KEYS, isSectionEmpty, sectionCounts } from '../lib/discoverTabs.js'

const SECTIONS = {
  hundeschulen: HundeschulenSection,
  salon: SalonSection,
  begleiter: BegleiterSection,
  futter: FutterSection,
  unterstuetzen: SupportSection
}

// Inhalt des gewählten Reiters in "Entdecken" (Phase U): ein Bereich ganz - samt eigenem Leerzustand -
// oder unter "Alle" jeder Bereich mit Inhalt, je höchstens PREVIEW_LIMIT Einträge und "Alle anzeigen".
// Leere Bereiche bleiben unter "Alle" weg (ihr Reiter zeigt 0); ist alles leer, steht ein Hinweis da.
export default function DiscoverPanel({ data, tab, onShowAll }) {
  if (tab !== ALL_TAB) {
    const Section = SECTIONS[tab]
    return <Section data={data} limit={Infinity} />
  }

  const counts = sectionCounts(data)
  const keys = SECTION_KEYS.filter((key) => !isSectionEmpty(key, data, counts))
  if (keys.length === 0) {
    return (
      <DiscoverEmpty>
        {t('Hier ist gerade noch nichts – versucht einen größeren Umkreis oder schaut in die')}{' '}
        <InternalLink to="/partner">{t('Partnerliste')}</InternalLink>.
      </DiscoverEmpty>
    )
  }
  return keys.map((key) => {
    const Section = SECTIONS[key]
    return <Section key={key} data={data} limit={PREVIEW_LIMIT} onShowAll={() => onShowAll(key)} />
  })
}
