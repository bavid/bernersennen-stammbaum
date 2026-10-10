import { useState } from 'react'
import Avatar from '../Avatar.jsx'
import { Card, EmptyState } from '../ui/index.js'
import { displayName } from '../../lib/timeline.js'
import { previewFor } from '../../lib/sichtbarkeit.js'
import { useT } from '../../lib/i18n/index.js'

function targetsOf(family, guests) {
  return [
    ...(family.memberships || []).map((membership) => ({ kind: 'familie', id: membership.id, name: membership.name })),
    ...guests.map((guest) => ({ kind: 'gast', id: guest.id, name: guest.name }))
  ]
}

function PreviewList({ target, rows }) {
  const t = useT()
  if (rows.length === 0) return <EmptyState icon="lock" title={t('{name} sieht keines eurer Tiere.', { name: target.name })} />
  return (
    <ul className="sicht-vorschau-list" role="list">
      {rows.map(({ dog, erinnerungen, privat }) => (
        <li key={dog.id}>
          <Avatar dog={dog} size={40} />
          <div>
            <strong>{displayName(dog)}</strong>
            <span className="settings-row-sub">
              {t('{n} Erinnerungen sichtbar', { n: erinnerungen })}
              {privat > 0 && ` · ${t('{n} private nicht', { n: privat })}`}
            </span>
          </div>
        </li>
      ))}
    </ul>
  )
}

// Ansicht „So sieht es …“: eine Familie oder einen Gast wählen - darunter, welche eigenen Tiere sie sehen und wie viele
// Erinnerungen davon (nur lesen; es gilt derselbe Freigabe-Zustand wie unter „Tiere“). Private zählen nie mit.
export default function VorschauAnsicht({ family, data, matrix }) {
  const t = useT()
  const targets = targetsOf(family, data.guests)
  const [key, setKey] = useState(targets[0] ? `${targets[0].kind}-${targets[0].id}` : '')
  const target = targets.find((item) => `${item.kind}-${item.id}` === key) || null
  if (targets.length === 0) return <EmptyState icon="users" title={t('Noch keine Familie und keine Gäste – eure Tiere sehen nur ihr.')} />
  const rows = previewFor(target, data.animals, matrix.sharesOf, data.counts)
  return (
    <section className="settings-group" aria-labelledby="sicht-vorschau-title">
      <label className="field">
        <span className="field-label" id="sicht-vorschau-title">
          {t('So sieht es …')}
        </span>
        <select value={key} onChange={(event) => setKey(event.target.value)}>
          {targets.map((item) => (
            <option key={`${item.kind}-${item.id}`} value={`${item.kind}-${item.id}`}>
              {item.kind === 'gast' ? t('{name} (Gast)', { name: item.name }) : item.name}
            </option>
          ))}
        </select>
      </label>
      {target && (
        <Card variant="flat" pad="sm" className="sicht-vorschau">
          <p className="muted">
            {target.kind === 'gast'
              ? t('{name} sieht als Gast nur lesend – ändern kann er nichts.', { name: target.name })
              : t('Alle in {name} sehen:', { name: target.name })}
          </p>
          <PreviewList target={target} rows={rows} />
        </Card>
      )}
    </section>
  )
}
