import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import ConfirmButton from '../ConfirmButton.jsx'
import Icon from '../Icon.jsx'
import HinweisEintrag from './HinweisEintrag.jsx'
import { useReadOnlyHint } from '../../lib/demo.js'
import { HOME_LABEL, START_ROUTE } from '../../lib/areas.js'
import { requestGroups } from '../../lib/erlebtMit.js'
import { hinweisGroups, hinweisItems, startLineText } from '../../lib/glocke.js'
import { t } from '../../lib/i18n/index.js'
import { Button } from '../ui/index.js'

const FOCUSABLE = 'button:not(:disabled), a[href]'

// In einer Familie oder zu Besuch: die Hinweise gehören zu „Mein Zuhause“ - dort lassen sie sich beantworten.
function AwayFromHome({ total, onNavigate }) {
  return (
    <div className="hinweis-away">
      <p>{total > 0 ? t('{hinweise} warten in „{home}“.', { hinweise: startLineText(total), home: t(HOME_LABEL) }) : t('Alles erledigt – nichts Neues.')}</p>
      {total > 0 && (
        <Button to={START_ROUTE} as={Link} variant="ghost" size="sm" onClick={onNavigate}>
          {t('Zu „{home}“', { home: t(HOME_LABEL) })}
        </Button>
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
          label={t('Alle {n} von „{zuhause}“ ablehnen', { n: group.count, zuhause: group.zuhause })}
          confirmLabel={t('Wirklich alle ablehnen?')}
          icon="close"
          className="btn-compact hinweis-reject-all"
          disabled={readOnly || isBusy(`zuhause-${group.zuhauseId}`)}
          onConfirm={() => actions.rejectAllFrom(group)}
        />
      ))}
      {groups.map((group) => (
        <section key={group.key} className="hinweis-group">
          {group.label && <h3 className="hinweis-group-label">{t(group.label)}</h3>}
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
        <Button type="button" variant="ghost" size="sm" onClick={loadLists}>
          {t('Nochmal versuchen')}
        </Button>
      </div>
    )
  }
  // Noch nichts geladen - oder nur eine leere Liste von vorhin, während die neue unterwegs ist.
  if (!lists || (loading && groups.length === 0)) {
    return (
      <p className="hinweis-loading muted" aria-busy="true">
        {t('Lädt …')}
      </p>
    )
  }
  if (groups.length === 0) {
    return (
      <p className="hinweis-empty">
        <Icon name="check" />
        {t('Alles erledigt – nichts Neues.')}
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
