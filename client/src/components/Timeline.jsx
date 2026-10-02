import { Link } from 'react-router-dom'
import Icon from './Icon.jsx'
import Avatar from './Avatar.jsx'
import CommentThread from './CommentThread.jsx'
import ExpandableText from './ExpandableText.jsx'
import EntryPhotos from './EntryPhotos.jsx'
import ErlebtMitChips from './erlebtMit/ErlebtMitChips.jsx'
import MirroredEntry from './erlebtMit/MirroredEntry.jsx'
import { dogLabel, groupByYear } from '../lib/timeline.js'
import { ageText, formatDayMonth } from '../lib/dates.js'
import { kategorieLabel } from '../lib/shelter.js'

// Kein eigenes Einzugs-/Abschieds-Icon vorhanden – 'pin' (Stecknadel, "hier verankert") und
// 'logout' (Tür mit Pfeil, "geht") aus Icon.jsx passen inhaltlich am besten.
const MILESTONE_ICONS = { birth: 'star', breeding: 'heart', litter: 'sprout', arrival: 'pin', farewell: 'logout' }

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
        <EntryPhotos urls={item.foto_urls} onOpenPhoto={onOpenPhoto} />
      </div>
    </div>
  )
}

function Entry({ item, birthDate, canEdit, onEdit, onOpenPhoto, onAddComment, onDeleteComment, canDeleteComment }) {
  const age = birthDate ? ageText(birthDate, item.datum) : null
  const kategorie = kategorieLabel(item.kategorie)
  return (
    <article className="entry-card">
      <header className="entry-head">
        <div>
          <h3 className="entry-title">
            {item.titel}
            {kategorie ? <span className="kategorie-badge">{kategorie}</span> : null}
            {item.is_public ? (
              <span className="public-badge" title="Im Steckbrief sichtbar" aria-label="Im Steckbrief sichtbar">
                <Icon name="globe" />
                öffentlich
              </span>
            ) : null}
            {item.privat ? (
              <span className="privat-badge" title="Privater Eintrag" aria-label="Privater Eintrag">
                <Icon name="lock" />
                privat
              </span>
            ) : null}
          </h3>
          <p className="entry-meta">
            von {item.autor_name}
            {age ? ` · ${age} alt` : ''}
          </p>
          {/* herkunft_name kommt nur bei umgezogenen Einträgen mit (server-seitiger JOIN auf
              herkunft_family_id, siehe Phase T Task 4/Server-Ergänzung) - sonst bleibt die Zeile weg. */}
          {item.herkunft_name && <p className="entry-herkunft muted">aus {item.herkunft_name}</p>}
        </div>
        {canEdit && (
          <button type="button" className="icon-btn" onClick={() => onEdit(item)} aria-label={`„${item.titel}“ bearbeiten`}>
            <Icon name="edit" />
          </button>
        )}
      </header>
      {item.text && <ExpandableText text={item.text} className="entry-text" lines={6} />}
      <EntryPhotos urls={item.foto_urls} onOpenPhoto={onOpenPhoto} />
      <ErlebtMitChips tags={item.erlebt_mit} />
      {onAddComment && (
        <div className="entry-comments">
          <CommentThread
            items={item.comments || []}
            noun="Kommentar"
            plural="Kommentare"
            verb="Kommentieren"
            placeholder="Dein Kommentar …"
            onAdd={(payload) => onAddComment(item, payload)}
            onDelete={(comment) => onDeleteComment(item, comment)}
            canDelete={canDeleteComment ? (comment) => canDeleteComment(item, comment) : undefined}
          />
        </div>
      )}
    </article>
  )
}

// mirror (Phase V2, optional): { onOpenOrigin(item)?, onHide(item)?, hideDisabled } für gespiegelte Einträge
// ("Erlebt mit", item.gespiegelt) - die erscheinen ohne Bearbeiten und Kommentare.
export default function Timeline({
  items,
  birthDate,
  highlightKey,
  canEdit,
  onEdit,
  onOpenPhoto,
  onAddComment,
  onDeleteComment,
  canDeleteComment,
  mirror = {}
}) {
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
                {item.type === 'entry' && item.gespiegelt ? (
                  <MirroredEntry
                    item={item}
                    onOpenPhoto={onOpenPhoto}
                    onOpenOrigin={mirror.canOpenOrigin?.(item) ? mirror.onOpenOrigin : undefined}
                    onHide={mirror.onHide}
                    hideDisabled={mirror.hideDisabled}
                  />
                ) : item.type === 'entry' ? (
                  <Entry
                    item={item}
                    birthDate={birthDate}
                    canEdit={canEdit}
                    onEdit={onEdit}
                    onOpenPhoto={onOpenPhoto}
                    onAddComment={onAddComment}
                    onDeleteComment={onDeleteComment}
                    canDeleteComment={canDeleteComment}
                  />
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
