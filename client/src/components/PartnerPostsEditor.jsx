import { useEffect, useState } from 'react'
import { api } from '../api'
import { useIsDemo } from '../lib/demo.js'
import { DEMO_HINT } from '../lib/partnerProfile.js'
import { LIMIT_HINT, MAX_POSTS, POSTS_HINT, allowedBereiche } from '../lib/partnerPosts.js'
import Icon from './Icon.jsx'
import PartnerPostForm from './PartnerPostForm.jsx'
import PartnerPostRow from './PartnerPostRow.jsx'
import { useToast } from './Toast.jsx'

const DEMO_HINT_ID = 'partner-posts-demo-hint'
const NO_BEREICH_HINT = 'Für euren Partner-Typ gibt es noch keinen Bereich in „Entdecken“ – schreibt uns gern.'

// Eigene Beiträge (Phase P2) - auf /beitraege (Partner) bzw. als Reiter "Beiträge" im Profil (Tierheim):
// oben Hinweis und Zähler "x von 20", dann entweder das Formular (Anlegen/Bearbeiten) oder die Liste,
// neueste zuerst (wie der Server sie liefert). typ: Partner-Typ (me.partner.typ) für die erlaubten Bereiche.
// In der Demo ist alles sichtbar, aber gesperrt.
export default function PartnerPostsEditor({ typ }) {
  const isDemo = useIsDemo()
  const toast = useToast()
  const [posts, setPosts] = useState(undefined)
  const [loadError, setLoadError] = useState(null)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(null) // null, 'new' oder ein Beitrag
  const count = posts?.length ?? 0
  const isFull = count >= MAX_POSTS
  const hasBereich = allowedBereiche(typ).length > 0

  useEffect(() => {
    let cancelled = false
    api.partnerArea
      .posts()
      .then((list) => {
        if (!cancelled) setPosts(Array.isArray(list) ? list : [])
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [])

  function replacePost(saved) {
    setPosts((list) => list.map((item) => (item.id === saved.id ? saved : item)))
  }

  function handleSaved(saved, { created }) {
    setPosts((list) => (created ? [saved, ...list] : list.map((item) => (item.id === saved.id ? saved : item))))
    setEditing(null)
    setError(null)
    toast(created ? 'Eingereicht – nach der Freigabe ist der Beitrag sichtbar.' : 'Gespeichert – der Beitrag wird erneut geprüft.')
  }

  async function handleDelete(post) {
    setError(null)
    try {
      await api.partnerArea.deletePost(post.id)
      setPosts((list) => list.filter((item) => item.id !== post.id))
      toast('Beitrag gelöscht.')
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <section className="partner-posts" aria-labelledby="partner-posts-title">
      <div className="partner-posts-head">
        <div>
          <h2 id="partner-posts-title">Eure Beiträge</h2>
          <p className="partner-posts-hint">{POSTS_HINT}</p>
        </div>
        <span className="pill partner-posts-count" aria-live="polite">
          {count} von {MAX_POSTS}
        </span>
      </div>

      {editing ? (
        <PartnerPostForm
          key={editing === 'new' ? 'new' : editing.id}
          post={editing === 'new' ? null : editing}
          typ={typ}
          onSaved={handleSaved}
          onChanged={replacePost}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <div className="partner-posts-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setEditing('new')}
            disabled={isDemo || isFull || !hasBereich || posts === undefined}
            aria-describedby={isDemo ? DEMO_HINT_ID : undefined}
          >
            <Icon name="plus" /> Beitrag anlegen
          </button>
          {isDemo && (
            <p id={DEMO_HINT_ID} className="field-hint">
              {DEMO_HINT}
            </p>
          )}
          {!isDemo && isFull && <p className="field-hint">{LIMIT_HINT}</p>}
          {!isDemo && !hasBereich && <p className="field-hint">{NO_BEREICH_HINT}</p>}
        </div>
      )}

      {error && !editing && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {loadError && (
        <div className="error-banner" role="alert">
          {loadError}
        </div>
      )}
      {posts === undefined && !loadError && <p className="muted">Lade …</p>}
      {!editing && posts?.length === 0 && (
        <p className="empty-state partner-posts-empty">Noch keine Beiträge – kündigt Kurse, Aktionen oder Termine an.</p>
      )}
      {!editing && count > 0 && (
        <ul className="partner-post-list">
          {posts.map((post) => (
            <PartnerPostRow
              key={post.id}
              post={post}
              onEdit={setEditing}
              onDelete={handleDelete}
              demoHintId={isDemo ? DEMO_HINT_ID : undefined}
            />
          ))}
        </ul>
      )}
    </section>
  )
}
