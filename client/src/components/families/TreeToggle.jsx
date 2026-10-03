import { Link, useLocation } from 'react-router-dom'
import Icon from '../Icon.jsx'

// Phase V3: im Auftritt mit Familien-Ansicht (Standard) öffnet ?ansicht=stammbaum den Stammbaum - sobald es ihn gibt.
// "Stammbaum" steht hier bewusst wörtlich (nicht in den Theme-Wörtern, die im Standard ohne Zucht-Wortschatz
// auskommen): so heißt der Zusatz ausdrücklich, und er erscheint erst nach einer Verpaarung oder mit Eltern.
export const TREE_PARAM = 'ansicht'
export const TREE_VALUE = 'stammbaum'
export const TREE_HINT = 'Sobald ihr eine Verpaarung eintragt, entsteht hier euer Stammbaum.'

// Knopf im Kopf der Familienbande: "Stammbaum öffnen" (Familien-Ansicht, Stammbaum vorhanden) bzw. im Baum "Zurück
// zu den Familien". Beides sind Links (Adresse mit bzw. ohne ?ansicht=stammbaum) - Zurück im Browser funktioniert.
// mode: lib/familyGroups.js overviewMode.
export default function TreeToggle({ mode, treeAvailable }) {
  const { pathname } = useLocation()
  if (mode === 'tree') {
    return (
      <Link to={{ pathname }} className="btn btn-ghost btn-lg">
        <Icon name="arrowLeft" />
        Zurück zu den Familien
      </Link>
    )
  }
  if (mode !== 'families' || !treeAvailable) return null
  return (
    <Link to={{ pathname, search: `?${TREE_PARAM}=${TREE_VALUE}` }} className="btn btn-ghost btn-lg">
      <Icon name="tree" />
      Stammbaum öffnen
    </Link>
  )
}
