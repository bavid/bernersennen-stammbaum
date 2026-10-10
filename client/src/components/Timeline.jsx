import { Link } from 'react-router-dom'
import { useTheme } from '../themes/ThemeProvider.jsx'
import Icon from './Icon.jsx'
import Avatar from './Avatar.jsx'
import CommentThread from './CommentThread.jsx'
import ExpandableText from './ExpandableText.jsx'
import EntryPhotos from './EntryPhotos.jsx'
import ErlebtMitChips from './erlebtMit/ErlebtMitChips.jsx'
import MirroredEntry from './erlebtMit/MirroredEntry.jsx'
import { dogLabel } from '../lib/timeline.js'
import { groupBySeason } from '../lib/seasons.js'
import { ageText, formatDayMonth } from '../lib/dates.js'
import { kategorieLabel } from '../lib/shelter.js'
import { t } from '../lib/i18n/index.js'

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
  const { words } = useTheme()
  const age = birthDate ? ageText(birthDate, item.datum) : null
  const kategorie = kategorieLabel(item.kategorie)
  return (
    <article className="entry-card">
      <header className="entry-head">
        <div>
          <h3 className="entry-title">
            {item.titel}
            {kategorie ? <span className="kategorie-badge">{t(kategorie)}</span> : null}
            {item.is_public ? (
              <span className="public-badge" title={t('Im Steckbrief sichtbar')} aria-label={t('Im Steckbrief sichtbar')}>
                <Icon name="globe" />
                {t('öffentlich')}
              </span>
            ) : null}
            {item.privat ? (
              <span className="privat-badge" title={t('Nur für euch')} aria-label={t('Privat – nur für euch')}>
                <Icon name="lock" />
                {t('privat')}
              </span>
            ) : null}
          </h3>
          <p className="entry-meta">
            {t('von {name}', { name: item.autor_name })}
            {age ? ` · ${t('{age} alt', { age })}` : ''}
          </p>
          {/* herkunft_name kommt nur bei umgezogenen Einträgen mit (server-seitiger JOIN auf
              herkunft_family_id, siehe Phase T Task 4/Server-Ergänzung) - sonst bleibt die Zeile weg. */}
          {item.herkunft_name && <p className="entry-herkunft muted">{t('aus {name}', { name: item.herkunft_name })}</p>}
        </div>
        {canEdit && (
          <button type="button" className="icon-btn" onClick={() => onEdit(item)} aria-label={t('„{title}“ bearbeiten', { title: item.titel })}>
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
            noun={words.greeting}
            plural={words.greetings}
            verb={words.greetingAction}
            placeholder={`${words.greetingAction} …`}
            onAdd={(payload) => onAddComment(item, payload)}
            onDelete={(comment) => onDeleteComment(item, comment)}
            canDelete={canDeleteComment ? (comment) => canDeleteComment(item, comment) : undefined}
          />
        </div>
      )}
    </article>
  )
}

// Kapitel nach Jahreszeiten (B+ Familienalbum): „Herbst 2026“ in Handschrift über den Erinnerungen eines Kapitels.
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
  const groups = groupBySeason(items)
  return (
    <ol className="timeline">
      {groups.map((group) => (
        <li key={group.key} className="timeline-year timeline-chapter">
          {group.label && <h3 className="timeline-year-label timeline-chapter-label hand">{group.label}</h3>}
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
