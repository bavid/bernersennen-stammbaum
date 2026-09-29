import Icon from './Icon.jsx'
import ConfirmButton from './ConfirmButton.jsx'
import FreigabeChip from './FreigabeChip.jsx'
import { POST_BEREICH_LABELS, clickCount } from '../lib/partnerPosts.js'
import { formatZeitraum } from '../lib/adminMarketing.js'
import { isPartnerMedia } from '../lib/discover.js'

// Ein eigener Beitrag in der Liste (PartnerPostsEditor): Freigabe (bei "Abgelehnt" samt Grund), aktiv,
// Zeitraum und die anonymen Klicks, dazu Bearbeiten und Löschen. demoHintId: in der Demo sind beide
// Knöpfe gesperrt, der Hinweis erklärt warum.
export default function PartnerPostRow({ post, onEdit, onDelete, demoHintId }) {
  const isDemo = Boolean(demoHintId)
  const rejected = post.freigabe === 'abgelehnt'

  return (
    <li className={`partner-post card${rejected ? ' is-rejected' : ''}`}>
      {isPartnerMedia(post.bildUrl) && <img src={post.bildUrl} alt="" className="partner-post-image" loading="lazy" />}
      <div className="partner-post-body">
        <div className="partner-post-chips">
          <FreigabeChip freigabe={post.freigabe} />
          <span className={`pill partner-post-aktiv${post.aktiv ? ' is-aktiv' : ''}`}>{post.aktiv ? 'Aktiv' : 'Inaktiv'}</span>
          <span className="partner-post-bereich">{POST_BEREICH_LABELS[post.bereich] || post.bereich}</span>
        </div>
        <h3>{post.titel}</h3>
        {post.text && <p className="partner-post-text">{post.text}</p>}
        {rejected && post.ablehnungsgrund && (
          <p className="partner-post-reason">
            <Icon name="alert" />
            <span>
              <strong>Grund:</strong> {post.ablehnungsgrund}
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
        <div className="partner-post-actions">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => onEdit(post)}
            disabled={isDemo}
            aria-describedby={demoHintId}
            aria-label={`${post.titel} bearbeiten`}
          >
            <Icon name="edit" />
            Bearbeiten
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
