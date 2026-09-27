import { Link } from 'react-router-dom'
import Icon from './Icon.jsx'
import Avatar from './Avatar.jsx'
import { dogLabel, groupByYear } from '../lib/timeline.js'
import { ageText, formatDayMonth } from '../lib/dates.js'

const MILESTONE_ICONS = { birth: 'star', breeding: 'heart', litter: 'sprout' }

function Photos({ urls, onOpenPhoto }) {
  if (!urls?.length) return null
  return (
    <div className={`entry-photos count-${Math.min(urls.length, 4)}`}>
      {urls.map((url) => (
        <button type="button" key={url} className="entry-photo" onClick={() => onOpenPhoto(url)} aria-label="Foto vergrößern">
          <img src={url} alt="" loading="lazy" />
        </button>
      ))}
    </div>
  )
}

function Milestone({ item, onOpenPhoto }) {
  return (
    <div className={`milestone milestone-${item.type}`}>
      <span className="milestone-icon">
        <Icon name={MILESTONE_ICONS[item.type]} />
      </span>
      <div className="milestone-body">
        <p className="milestone-title">{item.titel}</p>
        {item.text && <p className="milestone-text">{item.text}</p>}
        {item.children && (
          <div className="milestone-children">
            {item.children.map((child) => (
              <Link key={child.id} to={`/tier/${child.id}`} className="chip">
                <Avatar dog={child} size={24} />
                {dogLabel(child)}
              </Link>
            ))}
          </div>
        )}
        <Photos urls={item.foto_urls} onOpenPhoto={onOpenPhoto} />
      </div>
    </div>
  )
}

function Entry({ item, birthDate, canEdit, onEdit, onOpenPhoto }) {
  const age = birthDate ? ageText(birthDate, item.datum) : null
  return (
    <article className="entry-card">
      <header className="entry-head">
        <div>
          <h3 className="entry-title">{item.titel}</h3>
          <p className="entry-meta">
            von {item.autor_name}
            {age ? ` · ${age} alt` : ''}
          </p>
        </div>
        {canEdit && (
          <button type="button" className="icon-btn" onClick={() => onEdit(item)} aria-label={`„${item.titel}“ bearbeiten`}>
            <Icon name="edit" />
          </button>
        )}
      </header>
      {item.text && <p className="entry-text">{item.text}</p>}
      <Photos urls={item.foto_urls} onOpenPhoto={onOpenPhoto} />
    </article>
  )
}

export default function Timeline({ items, birthDate, highlightKey, canEdit, onEdit, onOpenPhoto }) {
  const groups = groupByYear(items)
  return (
    <ol className="timeline">
      {groups.map((group) => (
        <li key={group.year} className="timeline-year">
          <h3 className="timeline-year-label">{group.year}</h3>
          <ol className="timeline-items">
            {group.items.map((item) => (
              <li
                key={item.key}
                id={item.key}
                className={`timeline-item timeline-item-${item.type} ${highlightKey === item.key ? 'is-new' : ''}`}
              >
                <time className="timeline-date" dateTime={item.datum}>
                  {formatDayMonth(item.datum)}
                </time>
                <span className="timeline-node" aria-hidden="true" />
                {item.type === 'entry' ? (
                  <Entry item={item} birthDate={birthDate} canEdit={canEdit} onEdit={onEdit} onOpenPhoto={onOpenPhoto} />
                ) : (
                  <Milestone item={item} onOpenPhoto={onOpenPhoto} />
                )}
              </li>
            ))}
          </ol>
        </li>
      ))}
    </ol>
  )
}
