import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Icon from '../Icon.jsx'
import { itemState } from '../AccountMenu.jsx'
import SearchResults from './SearchResults.jsx'
import SearchHints from './SearchHints.jsx'
import useSearchResults from '../../hooks/useSearchResults.js'
import { useTheme } from '../../themes/ThemeProvider.jsx'
import {
  MAX_QUERY_LENGTH,
  SHORTCUT_GROUP,
  buildSections,
  clearRecent,
  countResults,
  flattenOptions,
  groupTitles,
  loadRecent,
  matchShortcuts,
  recentSections,
  resultTarget,
  saveRecent,
  searchableQuery,
  shortcutsFor,
  withRecent
} from '../../lib/search.js'
import { t } from '../../lib/i18n/index.js'

// Native <dialog> fokussiert beim Öffnen das Element mit dem HTML-Attribut autofocus - React setzt für autoFocus keins.
const markAutofocus = (element) => element?.setAttribute('autofocus', '')
const NONE = []

function statusText({ query, results, shortcutHits }) {
  if (!query) return ''
  if (results.status === 'error') return results.error
  if (results.status !== 'done' || results.query !== query) return t('Suche läuft …')
  const count = countResults(results.gruppen, shortcutHits)
  if (count === 1) return t('1 Treffer')
  return count ? t(count === 1 ? '1 Treffer' : '{n} Treffer', { n: count }) : t('Keine Treffer für „{query}“', { query })
}

// Inhalt des Such-Dialogs (SearchButton): Eingabefeld als Combobox, Treffer gruppiert (SearchResults), davor der Verlauf
// dieses Geräts und Tipps. Tastatur: ↑/↓ wandern durch alle Optionen (auch "Alle n anzeigen"), Enter öffnet die aktive -
// ohne aktive die erste -, Escape schließt. Ein Treffer führt per Adresse in seinen Bereich, das AreaGate wechselt dort.
export default function SearchPanel({ family, onClose, onInvite }) {
  const { words } = useTheme()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const baseId = `suche-${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const listId = `${baseId}-liste`
  const hintId = `${baseId}-hinweis`
  const inputRef = useRef(null)
  const [input, setInput] = useState('')
  const [recent, setRecent] = useState(() => loadRecent(family))
  // Aufgeklappte Gruppen und die aktive Option gelten nur für die Treffer, zu denen sie gehören.
  const [expanded, setExpanded] = useState({ query: null, groups: [] })
  const [cursor, setCursor] = useState({ key: null, index: -1 })
  // Enter, bevor die Treffer zu dieser Eingabe da sind: die Suche, deren ersten Treffer es öffnen soll, sobald sie eintreffen.
  const [pendingEnter, setPendingEnter] = useState(null)
  const results = useSearchResults(input)
  const query = searchableQuery(input)
  const shortcuts = useMemo(() => shortcutsFor(family, words), [family, words])
  const shortcutHits = useMemo(() => matchShortcuts(shortcuts, input), [shortcuts, input])
  const openGroups = expanded.query === results.query ? expanded.groups : NONE

  const sections = useMemo(
    () =>
      query
        ? buildSections({ gruppen: results.gruppen, shortcuts: shortcutHits, expanded: openGroups, titles: groupTitles(words), idPrefix: baseId })
        : recentSections(recent, baseId),
    [query, results.gruppen, shortcutHits, openGroups, words, baseId, recent]
  )
  const options = flattenOptions(sections)
  const listKey = `${input}\u0000${results.status}\u0000${results.query ?? ''}`
  const activeIndex = cursor.key === listKey && cursor.index < options.length ? cursor.index : -1
  const active = activeIndex >= 0 ? options[activeIndex] : null

  const activeId = active?.id
  useEffect(() => {
    if (activeId) document.getElementById(activeId)?.scrollIntoView?.({ block: 'nearest' })
  }, [activeId])

  // Sind die Treffer zur Suche hinter einem frühen Enter da, öffnet sich der erste (options/openFirst aus diesem Rendern).
  useEffect(() => {
    if (!pendingEnter || results.query !== pendingEnter || results.status === 'loading') return
    setPendingEnter(null)
    if (results.status === 'done') openFirst()
  }, [pendingEnter, results.query, results.status])

  function move(step) {
    if (options.length === 0) return
    const next = activeIndex < 0 ? (step > 0 ? 0 : options.length - 1) : (activeIndex + step + options.length) % options.length
    setCursor({ key: listKey, index: next })
  }

  // Nicht in der Admin-Ansicht: deren Suchen gehören nicht in den Verlauf auf dem Gerät des Admins.
  function remember() {
    if (!query || family.adminView) return
    const next = withRecent(recent, query)
    setRecent(next)
    saveRecent(family, next)
  }

  function activate(option) {
    if (option.kind === 'expand') {
      setExpanded({ query: results.query, groups: [...openGroups, option.group] })
      setCursor({ key: listKey, index: options.indexOf(option) })
      return
    }
    if (option.kind === 'recent') {
      setInput(option.item.query)
      return
    }
    remember()
    onClose()
    if (option.group !== SHORTCUT_GROUP) navigate(resultTarget(option.group, option.item))
    else if (option.item.action === 'invite') onInvite()
    else navigate(option.item.to, { state: itemState(option.item, pathname) })
  }

  function openFirst() {
    if (options[0]) activate(options[0])
  }

  function handleKeyDown(event) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      move(event.key === 'ArrowDown' ? 1 : -1)
    } else if (event.key === 'Enter') {
      if (!active && !query) return
      event.preventDefault()
      // Ohne aktive Option der erste Treffer - gehören die Treffer noch zur vorigen Eingabe, erst wenn die neuen da sind.
      if (active) activate(active)
      else if (results.query === query && results.status === 'done') openFirst()
      else setPendingEnter(query)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    }
  }

  function retrySearch() {
    results.retry()
    inputRef.current?.focus({ preventScroll: true })
  }

  function resetInput() {
    setInput('')
    inputRef.current?.focus({ preventScroll: true })
  }

  function forgetRecent() {
    clearRecent(family)
    setRecent([])
    inputRef.current?.focus({ preventScroll: true })
  }

  const status = statusText({ query, results, shortcutHits })
  const noHits = query && results.status === 'done' && results.query === query && countResults(results.gruppen, shortcutHits) === 0
  const queryFor = (group) => (group === SHORTCUT_GROUP ? query : results.query)

  return (
    <div className="search-panel">
      <div className="search-field">
        <div className="search-field-box">
          <Icon name="search" />
          <input
            ref={(element) => {
              inputRef.current = element
              markAutofocus(element)
            }}
            autoFocus
            type="text"
            className="search-input"
            role="combobox"
            aria-label={t('Suchbegriff')}
            aria-expanded={sections.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={activeId}
            aria-describedby={hintId}
            placeholder={t('Suchen nach Tieren, Erinnerungen, Familien …')}
            maxLength={MAX_QUERY_LENGTH}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
            value={input}
            onChange={(event) => {
              setInput(event.target.value)
              setPendingEnter(null)
            }}
            onKeyDown={handleKeyDown}
          />
          {input && (
            <button type="button" className="search-clear" aria-label={t('Eingabe löschen')} onClick={resetInput}>
              <Icon name="close" />
            </button>
          )}
        </div>
      </div>
      <p id={hintId} className="visually-hidden">
        {t('Mit den Pfeiltasten durch die Treffer, Eingabetaste öffnet, Escape schließt.')}
      </p>
      {/* Ohne Treffer sagt der Hinweis darunter dasselbe sichtbar - die Meldung bleibt dann nur für Screenreader. */}
      <p role="status" className={noHits ? 'visually-hidden' : 'search-status'}>
        {status}
      </p>
      {results.status === 'error' && (
        <button type="button" className="link-button search-retry" onClick={retrySearch}>
          {t('Noch einmal versuchen')}
        </button>
      )}
      <SearchResults
        id={listId}
        sections={sections}
        activeId={activeId}
        onActivate={activate}
        queryFor={queryFor}
        family={family}
        busy={results.status === 'loading'}
      />
      {!query && recent.length > 0 && (
        <button type="button" className="link-button search-forget" onClick={forgetRecent}>
          {t('Verlauf löschen')}
        </button>
      )}
      {!input.trim() && <SearchHints kind="start" />}
      {input.trim() && !query && <SearchHints kind="short" />}
      {noHits && <SearchHints kind="none" query={query} />}
      {results.unvollstaendig && results.query === query && <SearchHints kind="partial" />}
    </div>
  )
}
