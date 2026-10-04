import Icon from '../Icon.jsx'
import SearchHighlight from './SearchHighlight.jsx'
import { HOME_LABEL, isHouseholdIdentity } from '../../lib/areas.js'
import { formatDateShort } from '../../lib/dates.js'
import { TYPE_LABELS } from '../../lib/partnerTypes.js'
import { roleLabel } from '../../lib/roles.js'
import { speciesNoun } from '../../lib/timeline.js'
import { useTheme } from '../../themes/ThemeProvider.jsx'

// Inhalt einer Zeile im Suchergebnis je Gruppe (components/search/SearchResults.jsx stellt das role="option" drumherum).

// Wo der Treffer liegt: das eigene Zuhause heißt „Mein Zuhause“ (beim klassischen Familien-Login der Name der Familie).
function areaLabel(bereich, family) {
  if (bereich.art === 'eigen' && isHouseholdIdentity(family)) return HOME_LABEL
  return bereich.name
}

function AreaChip({ bereich, family }) {
  return <span className={`search-chip is-${bereich.art}`}>{areaLabel(bereich, family)}</span>
}

// wrap: der Titel darf zwei Zeilen haben (Auszug eines Zettels - der Treffer steht oft erst nach einigen Wörtern).
function Lines({ title, sub, meta, wrap = false }) {
  return (
    <span className="search-option-text">
      <span className={wrap ? 'search-option-title is-wrap' : 'search-option-title'}>{title}</span>
      {sub && <span className="search-option-sub">{sub}</span>}
      {meta && <span className="search-option-meta">{meta}</span>}
    </span>
  )
}

function Thumb({ src, letter, memorial = false, icon }) {
  return (
    <span className={`search-thumb${memorial ? ' is-memorial' : ''}`} aria-hidden="true">
      {src ? <img src={src} alt="" loading="lazy" /> : icon ? <Icon name={icon} /> : <span>{letter}</span>}
    </span>
  )
}

const join = (...parts) => parts.filter(Boolean).join(' · ')

function AnimalRow({ item, query, family }) {
  const sub = (
    <>
      {speciesNoun(item.tierart)}
      {item.rasse && (
        <>
          {' · '}
          <SearchHighlight text={item.rasse} query={query} />
        </>
      )}
      {item.zuhause && ` · bei ${item.zuhause}`}
    </>
  )
  return (
    <>
      <Thumb src={item.fotoUrl} letter={([...(item.name || '?')][0] || '?').toUpperCase()} memorial={item.inErinnerung} />
      <Lines title={<SearchHighlight text={item.name} query={query} />} sub={sub} meta={<AreaChip bereich={item.bereich} family={family} />} />
    </>
  )
}

function MemoryRow({ item, query, family }) {
  return (
    <>
      <Thumb icon="book" />
      <Lines
        title={<SearchHighlight text={item.titel} query={query} />}
        sub={item.auszug && <SearchHighlight text={item.auszug} query={query} />}
        meta={
          <>
            {join(item.tier?.name, formatDateShort(item.datum))} <AreaChip bereich={item.bereich} family={family} />
          </>
        }
      />
    </>
  )
}

function NoteRow({ item, query, family }) {
  const termin = item.terminDatum && `Termin ${formatDateShort(item.terminDatum)}${item.terminZeit ? `, ${item.terminZeit} Uhr` : ''}`
  return (
    <>
      <Thumb icon={item.terminDatum ? 'calendar' : 'pin'} />
      <Lines
        wrap
        title={<SearchHighlight text={item.auszug} query={query} />}
        meta={
          <>
            {termin} <AreaChip bereich={item.bereich} family={family} />
          </>
        }
      />
    </>
  )
}

function FamilyRow({ item, query }) {
  const { words } = useTheme()
  const sub = item.art === 'besuch' ? 'Befreundetes Zuhause' : roleLabel(words, item.rolle)
  return (
    <>
      <Thumb icon={item.art === 'besuch' ? 'home' : 'users'} />
      <Lines title={<SearchHighlight text={item.name} query={query} />} sub={sub} />
    </>
  )
}

function PartnerRow({ item, query }) {
  return (
    <>
      <Thumb src={item.logoUrl} icon="globe" />
      <Lines title={<SearchHighlight text={item.name} query={query} />} sub={join(TYPE_LABELS[item.typ], item.ort)} />
    </>
  )
}

function ShortcutRow({ item, query }) {
  return (
    <>
      <Thumb icon={item.icon} />
      <Lines title={<SearchHighlight text={item.label} query={query} />} />
    </>
  )
}

const ROWS = {
  tiere: AnimalRow,
  erinnerungen: MemoryRow,
  pinnwand: NoteRow,
  familien: FamilyRow,
  partner: PartnerRow,
  abkuerzungen: ShortcutRow
}

export default function SearchOption({ option, query, family }) {
  if (option.kind === 'expand') {
    return <span className="search-option-expand">Alle {option.count} anzeigen</span>
  }
  if (option.kind === 'recent') {
    return (
      <>
        <Thumb icon="clock" />
        <Lines title={option.item.query} />
      </>
    )
  }
  const Row = ROWS[option.group]
  return Row ? <Row item={option.item} query={query} family={family} /> : null
}
