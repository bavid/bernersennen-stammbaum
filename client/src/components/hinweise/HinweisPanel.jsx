import { Link } from 'react-router-dom'
import ConfirmButton from '../ConfirmButton.jsx'
import Icon from '../Icon.jsx'
import HinweisEintrag from './HinweisEintrag.jsx'
import { useReadOnlyHint } from '../../lib/demo.js'
import { HOME_LABEL, START_ROUTE } from '../../lib/areas.js'
import { requestGroups } from '../../lib/erlebtMit.js'
import { hinweisGroups, hinweisItems, startLineText } from '../../lib/glocke.js'

// In einer Familie oder zu Besuch: die Hinweise gehören zu „Mein Zuhause“ - dort lassen sie sich beantworten.
function AwayFromHome({ total, onClose }) {
  return (
    <div className="hinweis-away">
      <p>{total > 0 ? `${startLineText(total)} warten in „${HOME_LABEL}“.` : 'Alles erledigt – nichts Neues.'}</p>
      {total > 0 && (
        <Link to={START_ROUTE} className="btn btn-ghost btn-compact" onClick={onClose}>
          Zu „{HOME_LABEL}“
        </Link>
      )}
    </div>
  )
}

// Inhalt der Hinweis-Glocke (am Desktop im Fenster unter der Glocke, am Handy im Blatt von unten): eine ruhige Liste,
// neueste zuerst, „Neu“/„Früher“ nur, wenn es beides gibt (lib/glocke.js). glocke: useGlocke() aus HinweiseProvider.
export default function HinweisPanel({ glocke, onClose }) {
  const readOnlyHint = useReadOnlyHint()
  const { atHome, lists, loading, error, busy, readOnly, actions, total } = glocke

  if (!atHome) return <AwayFromHome total={total} onClose={onClose} />
  if (error) {
    return (
      <p className="error-banner" role="alert">
        {error}
      </p>
    )
  }
  if (!lists) {
    return (
      <p className="hinweis-loading muted" aria-busy="true">
        Lädt …
      </p>
    )
  }

  const groups = hinweisGroups(hinweisItems(lists))
  if (groups.length === 0) {
    return (
      <p className="hinweis-empty">
        <Icon name="check" />
        Alles erledigt – nichts Neues.
      </p>
    )
  }

  return (
    <div className="hinweis-panel" aria-busy={loading || undefined}>
      {requestGroups(lists.anfragen).map((group) => (
        <ConfirmButton
          key={group.zuhauseId}
          label={`Alle ${group.count} von „${group.zuhause}“ ablehnen`}
          confirmLabel="Wirklich alle ablehnen?"
          icon="close"
          className="btn-compact hinweis-reject-all"
          disabled={readOnly || busy === `zuhause-${group.zuhauseId}`}
          onConfirm={() => actions.rejectAllFrom(group)}
        />
      ))}
      {groups.map((group) => (
        <section key={group.key} className="hinweis-group">
          {group.label && <h3 className="hinweis-group-label">{group.label}</h3>}
          <ul className="hinweis-list" role="list">
            {group.items.map((item) => (
              <HinweisEintrag
                key={item.key}
                item={item}
                busy={busy === item.key}
                disabled={readOnly}
                actions={actions}
                onNavigate={onClose}
              />
            ))}
          </ul>
        </section>
      ))}
      {readOnly && <p className="field-hint">{readOnlyHint}</p>}
    </div>
  )
}
