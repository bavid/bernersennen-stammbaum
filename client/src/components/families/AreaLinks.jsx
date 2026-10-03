import { Fragment } from 'react'
import { useTheme } from '../../themes/ThemeProvider.jsx'

// Ein Bereich in der Zeile: ein Link-Knopf zum Hineinwechseln (sichtbar der Name, für Screenreader dahinter, was er
// tut - so bleibt der Name des Knopfs, was man sieht) oder, wo man nicht hineindarf, nur der Name.
function AreaName({ area, onOpenArea }) {
  if (!area.canOpen) return <span>{area.name}</span>
  return (
    <button type="button" className="link-button" onClick={() => onOpenArea(area.id, area.name)}>
      {area.name}
      <span className="visually-hidden"> {area.action}</span>
    </button>
  )
}

// "A", "A und B", "A, B und C"
function AreaNames({ areas, onOpenArea }) {
  return areas.map((area, index) => (
    <Fragment key={area.id}>
      {index > 0 && (index === areas.length - 1 ? ' und ' : ', ')}
      <AreaName area={area} onOpenArea={onOpenArea} />
    </Fragment>
  ))
}

// Familienbande 2: statt eigener Karten für Familien und befreundete Zuhause (die doppelten den Bereichswechsler) eine
// leise Zeile unter dem Raster des eigenen Zuhauses - "Ihr zeigt Tiere auch in Familie Sonnenhang · befreundet mit
// Zuhause Möwenweg". memberships/friends: buildFamilyGroups (nur im eigenen Zuhause gefüllt); onOpenArea(id, name):
// hooks/useOpenArea.js. Ohne beides keine Zeile.
export default function AreaLinks({ memberships = [], friends = [], onOpenArea }) {
  const { words } = useTheme()
  const toGroup = (membership) => ({ id: membership.id, name: membership.title, action: 'öffnen', canOpen: true })
  const showing = memberships.filter((membership) => membership.dogs.length > 0).map(toGroup)
  const memberOnly = memberships.filter((membership) => membership.dogs.length === 0).map(toGroup)
  const homes = friends.map((home) => ({ id: home.id, name: home.name, action: 'besuchen', canOpen: home.canVisit }))
  const parts = [
    { key: 'zeigt', lead: `Ihr zeigt ${words.animals} auch in`, areas: showing },
    { key: 'mitglied', lead: 'Mitglied in', areas: memberOnly },
    { key: 'freunde', lead: 'befreundet mit', areas: homes }
  ].filter((part) => part.areas.length > 0)
  if (parts.length === 0) return null
  return (
    <p className="families-links">
      {parts.map((part, index) => (
        <Fragment key={part.key}>
          {index > 0 && ' · '}
          {part.lead} <AreaNames areas={part.areas} onOpenArea={onOpenArea} />
        </Fragment>
      ))}
    </p>
  )
}
