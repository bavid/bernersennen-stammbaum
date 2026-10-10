import { Link, useLocation } from 'react-router-dom'
import Icon from '../Icon.jsx'
import { t } from '../../lib/i18n/index.js'

// Phase V3: im Auftritt mit Familien-Ansicht (Standard) öffnet ?ansicht=stammbaum den Stammbaum - sobald es ihn gibt.
// "Stammbaum" steht hier bewusst wörtlich (nicht in den Theme-Wörtern, die im Standard ohne Zucht-Wortschatz
// auskommen): so heißt der Zusatz ausdrücklich, und er erscheint erst nach einer Verpaarung oder mit Eltern.
export const TREE_PARAM = 'ansicht'
export const TREE_VALUE = 'stammbaum'

// Leiser Link im Kopf der Familienbande (Familienbande 2: nach "Tier hinzufügen" und "Jemanden einladen" die dritte,
// ruhigste Aktion): "Stammbaum & Nachwuchs" (Familien-Ansicht, Stammbaum vorhanden) bzw. im Baum "Zurück zu den
// Familien". Beides sind Links (Adresse mit bzw. ohne ?ansicht=stammbaum) - Zurück im Browser funktioniert.
// mode: lib/familyGroups.js overviewMode.
export default function TreeToggle({ mode, treeAvailable }) {
  const { pathname } = useLocation()
  if (mode === 'tree') {
    return (
      <Link to={{ pathname }} className="hero-link">
        <Icon name="arrowLeft" />
        {t('Zurück zu den Familien')}
      </Link>
    )
  }
  if (mode !== 'families' || !treeAvailable) return null
  return (
    <Link to={{ pathname, search: `?${TREE_PARAM}=${TREE_VALUE}` }} className="hero-link">
      <Icon name="tree" />
      {t('Stammbaum & Nachwuchs')}
    </Link>
  )
}
