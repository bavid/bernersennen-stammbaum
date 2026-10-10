import SearchOption from './SearchOption.jsx'
import { t } from '../../lib/i18n/index.js'

// Ergebnisliste der Suche nach dem Muster "Combobox mit Listbox" (WAI-ARIA APG): der Fokus bleibt im Eingabefeld, die
// aktive Option nennt aria-activedescendant dort (SearchPanel). Je Gruppe eine kleine Überschrift (role="group" mit
// aria-labelledby). Mausklicks nehmen dem Feld den Fokus nicht (mousedown ohne Standardaktion).
export default function SearchResults({ id, sections, activeId, onActivate, queryFor, family, busy }) {
  return (
    <div id={id} role="listbox" aria-label="Suchergebnisse" className="search-results" aria-busy={busy || undefined} hidden={sections.length === 0}>
      {sections.map((section) => {
        const titleId = `${id}-${section.key}-titel`
        return (
          <div key={section.key} role="group" aria-labelledby={titleId} className="search-group">
            <div id={titleId} role="presentation" className="search-group-title">
              {section.title}
            </div>
            <ul role="presentation" className="search-group-list">
              {section.options.map((option) => (
                <li
                  key={option.id}
                  id={option.id}
                  role="option"
                  aria-selected={option.id === activeId}
                  className={`search-option is-${option.kind}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onActivate(option)}
                >
                  <SearchOption option={option} query={queryFor(section.key)} family={family} />
                </li>
              ))}
            </ul>
            {section.more && (
              <p role="presentation" className="search-group-more">
                {t('Es gibt noch mehr Treffer – sucht etwas genauer.')}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}
