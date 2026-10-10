import { useCallback, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Icon from '../Icon.jsx'
import { FOLIE_PARAM, clampFolie } from '../../lib/vorstellung.js'
import { t } from '../../lib/i18n/index.js'
import { Button } from '../ui/index.js'

// Gemeinsame Folien-Mechanik für /vorstellung und /netzwerk: ?folie=N (1-basiert, begrenzt), Pfeiltasten,
// Weiter/Zurück und Punkte. Stil: styles/vorstellung.css (Klassen vorstellung-nav, vorstellung-dots).

const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

export function useFolie(anzahl) {
  const [params, setParams] = useSearchParams()
  const aktuell = clampFolie(params.get(FOLIE_PARAM), anzahl)
  const gehZu = useCallback(
    (nummer) => setParams({ [FOLIE_PARAM]: String(clampFolie(nummer, anzahl)) }, { replace: true }),
    [setParams, anzahl]
  )

  useEffect(() => {
    function onKey(event) {
      if (event.altKey || event.ctrlKey || event.metaKey || TYPING_TAGS.has(event.target?.tagName)) return
      if (event.key === 'ArrowRight') gehZu(aktuell + 1)
      if (event.key === 'ArrowLeft') gehZu(aktuell - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [aktuell, gehZu])

  return { aktuell, gehZu }
}

export function FolienNav({ aktuell, anzahl, gehZu, ende = { to: '/', label: 'Zur Startseite' } }) {
  return (
    <nav className="vorstellung-nav" aria-label={t('Folien durchklicken')}>
      <Button type="button" variant="ghost" disabled={aktuell === 1} onClick={() => gehZu(aktuell - 1)}>
        <Icon name="arrowLeft" /> {t('Zurück')}
      </Button>
      <span className="vorstellung-count muted">{t('Folie {n} von {total}', { n: aktuell, total: anzahl })}</span>
      {aktuell === anzahl ? (
        <Button to={ende.to} as={Link}>
          {t(ende.label)} <Icon name="arrowRight" />
        </Button>
      ) : (
        <Button type="button" onClick={() => gehZu(aktuell + 1)}>
          {t('Weiter')} <Icon name="arrowRight" />
        </Button>
      )}
    </nav>
  )
}

export function FolienDots({ folien, aktuell, onSelect }) {
  return (
    <ul className="vorstellung-dots" aria-label={t('Folien')}>
      {folien.map((folie, index) => (
        <li key={folie.id}>
          <button
            type="button"
            aria-label={t('Folie {n}: {titel}', { n: index + 1, titel: t(folie.eyebrow) })}
            aria-current={index + 1 === aktuell ? 'step' : undefined}
            onClick={() => onSelect(index + 1)}
          />
        </li>
      ))}
    </ul>
  )
}
