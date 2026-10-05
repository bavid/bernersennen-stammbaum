import { Children, createContext, useContext, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { DATENSCHUTZ_SECTIONS, EXPAND_ALL_PARAM, isForcedOpen, sectionTitle } from '../../lib/legalSections.js'

// Audit W (N7): der Datenschutz ist ein langer Rechtstext. Jeder Abschnitt zeigt zuerst nur seinen ersten Absatz, der Rest
// steht hinter „Mehr“ - im Dokument (hidden), damit Suche im Browser, Tests und Vorlesen nach dem Aufklappen alles finden.
// ?alles=1 öffnet alle Abschnitte, eine Sprungmarke (#tierheime) genau ihren; dann gibt es keinen Knopf.
const LegalContext = createContext({ expandAll: false, hash: '' })

export function LegalProvider({ children }) {
  const [searchParams] = useSearchParams()
  const { hash } = useLocation()
  const expandAll = searchParams.get(EXPAND_ALL_PARAM) === '1'
  return <LegalContext.Provider value={{ expandAll, hash }}>{children}</LegalContext.Provider>
}

// Kompaktes Inhaltsverzeichnis: eine Sprungmarke je Abschnitt, als fließende Liste.
export function LegalToc() {
  return (
    <nav className="legal-toc" aria-label="Inhalt">
      <ol>
        {DATENSCHUTZ_SECTIONS.map((section) => (
          <li key={section.id}>
            <a href={`#${section.id}`}>{section.title}</a>
          </li>
        ))}
      </ol>
    </nav>
  )
}

// id: aus lib/legalSections.js (Überschrift und Sprungmarke folgen daraus). children: die Absätze des Abschnitts.
export default function LegalSection({ id, children }) {
  const forced = isForcedOpen(id, useContext(LegalContext))
  const [open, setOpen] = useState(false)
  const [first, ...rest] = Children.toArray(children)
  const expanded = forced || open
  const restId = `${id}-mehr`

  return (
    <section id={id} className="legal-section">
      <h2>{sectionTitle(id)}</h2>
      {first}
      {rest.length > 0 && (
        <>
          <div id={restId} className="legal-section-rest" hidden={!expanded}>
            {rest}
          </div>
          {!forced && (
            <button type="button" className="legal-more" aria-expanded={expanded} aria-controls={restId} onClick={() => setOpen(!open)}>
              {expanded ? 'Weniger' : 'Mehr'}
            </button>
          )}
        </>
      )}
    </section>
  )
}
