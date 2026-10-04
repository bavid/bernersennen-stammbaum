import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import ConfirmButton from '../ConfirmButton.jsx'
import Icon from '../Icon.jsx'
import HinweisEintrag from './HinweisEintrag.jsx'
import { useReadOnlyHint } from '../../lib/demo.js'
import { HOME_LABEL, START_ROUTE } from '../../lib/areas.js'
import { requestGroups } from '../../lib/erlebtMit.js'
import { hinweisGroups, hinweisItems, startLineText } from '../../lib/glocke.js'

const FOCUSABLE = 'button:not(:disabled), a[href]'

// In einer Familie oder zu Besuch: die Hinweise gehören zu „Mein Zuhause“ - dort lassen sie sich beantworten.
function AwayFromHome({ total, onNavigate }) {
  return (
    <div className="hinweis-away">
      <p>{total > 0 ? `${startLineText(total)} warten in „${HOME_LABEL}“.` : 'Alles erledigt – nichts Neues.'}</p>
      {total > 0 && (
        <Link to={START_ROUTE} className="btn btn-ghost btn-compact" onClick={onNavigate}>
          Zu „{HOME_LABEL}“
        </Link>
      )}
    </div>
  )
}

function Liste({ glocke, groups, onNavigate }) {
  const readOnlyHint = useReadOnlyHint()
  const { lists, readOnly, isBusy, actions } = glocke
  return (
    <div className="hinweis-panel">
      {requestGroups(lists.anfragen).map((group) => (
        <ConfirmButton
          key={group.zuhauseId}
          label={`Alle ${group.count} von „${group.zuhause}“ ablehnen`}
          confirmLabel="Wirklich alle ablehnen?"
          icon="close"
          className="btn-compact hinweis-reject-all"
          disabled={readOnly || isBusy(`zuhause-${group.zuhauseId}`)}
          onConfirm={() => actions.rejectAllFrom(group)}
        />
      ))}
      {groups.map((group) => (
        <section key={group.key} className="hinweis-group">
          {group.label && <h3 className="hinweis-group-label">{group.label}</h3>}
          <ul className="hinweis-list" role="list">
            {group.items.map((item) => (
              <HinweisEintrag key={item.key} item={item} busy={isBusy(item.key)} disabled={readOnly} actions={actions} onNavigate={onNavigate} />
            ))}
          </ul>
        </section>
      ))}
      {readOnly && <p className="field-hint">{readOnlyHint}</p>}
    </div>
  )
}

function Inhalt({ glocke, groups, onNavigate }) {
  const { atHome, lists, loading, error, total, loadLists } = glocke
  if (!atHome) return <AwayFromHome total={total} onNavigate={onNavigate} />
  if (error) {
    return (
      <div className="hinweis-error">
        <p className="error-banner" role="alert">
          {error}
        </p>
        <button type="button" className="btn btn-ghost btn-compact" onClick={loadLists}>
          Nochmal versuchen
        </button>
      </div>
    )
  }
  // Noch nichts geladen - oder nur eine leere Liste von vorhin, während die neue unterwegs ist.
  if (!lists || (loading && groups.length === 0)) {
    return (
      <p className="hinweis-loading muted" aria-busy="true">
        Lädt …
      </p>
    )
  }
  if (groups.length === 0) {
    return (
      <p className="hinweis-empty">
        <Icon name="check" />
        Alles erledigt – nichts Neues.
      </p>
    )
  }
  return <Liste glocke={glocke} groups={groups} onNavigate={onNavigate} />
}

// Inhalt der Hinweis-Glocke (am Desktop im Fenster unter der Glocke, am Handy im Blatt von unten): eine ruhige Liste,
// neueste zuerst, „Neu“/„Früher“ nur, wenn es beides gibt (lib/glocke.js). Die Rückmeldung einer Aktion steht hier im
// Fenster (ein Toast läge am Handy unter dem Blatt). Verschwindet der eben bediente Hinweis, bleibt der Fokus im Fenster
// (beim nächsten Knopf, sonst auf dem Fenster selbst). glocke: useGlocke(); onNavigate: ein Link führt weg (schließen).
export default function HinweisPanel({ glocke, onNavigate }) {
  const rootRef = useRef(null)
  const { lists, feedback, busy } = glocke
  const groups = lists ? hinweisGroups(hinweisItems(lists)) : []
  const itemCount = groups.reduce((sum, group) => sum + group.items.length, 0)

  useEffect(() => {
    const root = rootRef.current
    const active = document.activeElement
    if (!root?.isConnected || (active && active !== document.body && active !== document.documentElement)) return
    ;(root.querySelector(`.hinweis-item ${FOCUSABLE}`) || root.querySelector(FOCUSABLE) || root).focus()
  }, [itemCount, busy.length, feedback])

  return (
    <div className="hinweis-panel-root" ref={rootRef} tabIndex={-1}>
      {feedback?.kind === 'error' && (
        <p className="error-banner hinweis-feedback-error" role="alert">
          {feedback.text}
        </p>
      )}
      <Inhalt glocke={glocke} groups={groups} onNavigate={onNavigate} />
      <p className="hinweis-feedback" role="status">
        {feedback?.kind === 'ok' ? feedback.text : ''}
      </p>
    </div>
  )
}
