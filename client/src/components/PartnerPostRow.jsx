import Icon from './Icon.jsx'
import ConfirmButton from './ConfirmButton.jsx'
import FreigabeChip from './FreigabeChip.jsx'
import FreigabeVerlauf from './FreigabeVerlauf.jsx'
import { POST_BEREICH_LABELS, clickCount } from '../lib/partnerPosts.js'
import { formatZeitraum } from '../lib/adminMarketing.js'
import { isPartnerMedia } from '../lib/discover.js'
import { latestVerlauf } from '../lib/freigabeVerlauf.js'
import { relativeTime } from '../lib/dates.js'

// Ein eigener Beitrag in der Liste (PartnerPostsEditor): Freigabe als einziges Badge (bei "Abgelehnt" samt Grund),
// daneben Bereich und aktiv/inaktiv als ruhige Meta-Zeile, Zeitraum und die anonymen Klicks, dazu Bearbeiten und
// Löschen. V-Fehler 3: ein abgelehnter Beitrag bietet ausdrücklich "Erneut einreichen" (öffnet das Formular mit dem
// Grund oben), und der Verlauf steht als kleine, zugeklappte Zeitleiste mit dem jüngsten Eintrag darunter.
// demoHintId: in der Demo sind beide Knöpfe gesperrt, der Hinweis erklärt warum.
export default function PartnerPostRow({ post, onEdit, onDelete, demoHintId }) {
  const isDemo = Boolean(demoHintId)
  const rejected = post.freigabe === 'abgelehnt'
  const latest = latestVerlauf(post.verlauf)

  return (
    <li className={`partner-post card${rejected ? ' is-rejected' : ''}`}>
      {isPartnerMedia(post.bildUrl) && <img src={post.bildUrl} alt="" className="partner-post-image" loading="lazy" />}
      <div className="partner-post-body">
        <div className="partner-post-chips">
          <FreigabeChip freigabe={post.freigabe} />
          <span className="partner-post-kind">
            <span className="partner-post-bereich">{POST_BEREICH_LABELS[post.bereich] || post.bereich}</span>
            {' · '}
            <span className={`partner-post-aktiv${post.aktiv ? ' is-aktiv' : ''}`}>{post.aktiv ? 'Aktiv' : 'Inaktiv'}</span>
          </span>
        </div>
        <h3>{post.titel}</h3>
        {post.text && <p className="partner-post-text">{post.text}</p>}
        {rejected && post.ablehnungsgrund && (
          <p className="partner-post-reason">
            <Icon name="alert" />
            <span>
              <strong>Grund:</strong> {post.ablehnungsgrund} Bitte anpassen und erneut einreichen.
            </span>
          </p>
        )}
        <dl className="partner-post-meta">
          <div>
            <dt>Zeitraum</dt>
            <dd>{formatZeitraum(post.start, post.ende)}</dd>
          </div>
          <div>
            <dt>Klicks 7 Tage / gesamt</dt>
            <dd className="partner-post-clicks">
              {clickCount(post.clicks7)} / {clickCount(post.clicksTotal)}
            </dd>
          </div>
        </dl>
        {latest && (
          <details className="partner-post-verlauf">
            <summary>
              Verlauf
              <span className="partner-post-verlauf-latest">
                {' · '}
                {latest.label}
                {typeof latest.createdAt === 'string' ? `, ${relativeTime(latest.createdAt)}` : ''}
              </span>
            </summary>
            <FreigabeVerlauf verlauf={post.verlauf} />
          </details>
        )}
        <div className="partner-post-actions">
          <button
            type="button"
            className={`btn ${rejected ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => onEdit(post)}
            disabled={isDemo}
            aria-describedby={demoHintId}
            aria-label={`${post.titel} ${rejected ? 'erneut einreichen' : 'bearbeiten'}`}
          >
            <Icon name="edit" />
            {rejected ? 'Erneut einreichen' : 'Bearbeiten'}
          </button>
          <ConfirmButton
            onConfirm={() => onDelete(post)}
            label="Löschen"
            confirmLabel="Wirklich löschen?"
            ariaLabel={`${post.titel} löschen`}
            disabled={isDemo}
            describedBy={demoHintId}
          />
        </div>
      </div>
    </li>
  )
}
