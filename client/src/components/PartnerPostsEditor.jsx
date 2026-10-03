import { useEffect, useState } from 'react'
import { api } from '../api'
import { useIsDemo, useReadOnlyHint } from '../lib/demo.js'
import { LIMIT_HINT, MAX_POSTS, POSTS_HINT, POSTS_HINT_TRUSTED, TRUSTED_HINT, allowedBereiche, savedMessage } from '../lib/partnerPosts.js'
import Icon from './Icon.jsx'
import PartnerCardOrder from './PartnerCardOrder.jsx'
import PartnerPostForm from './PartnerPostForm.jsx'
import PartnerPostRow from './PartnerPostRow.jsx'
import { useToast } from './Toast.jsx'

const DEMO_HINT_ID = 'partner-posts-demo-hint'
const NO_BEREICH_HINT = 'Für euren Partner-Typ gibt es noch keinen Bereich in „Entdecken“ – schreibt uns gern.'

// Eigene Beiträge (Phase P2) - auf /beitraege (Partner) bzw. als Reiter "Beiträge" im Profil (Tierheim):
// oben Hinweis und Zähler "x von 20", dann entweder das Formular (Anlegen/Bearbeiten) oder - seit Phase V1 unter
// "Eure Karte in Entdecken" (Reihenfolge, PartnerCardOrder) - die Liste, neueste zuerst (wie der Server sie liefert). typ: Partner-Typ (me.partner.typ) für die erlaubten Bereiche.
// vertrauenswuerdig (V-Fehler 3, me.partner.vertrauenswuerdig): Änderungen an freigegebenen Beiträgen gehen sofort
// online - das sagt ein Hinweis oben und das Formular. In der Demo ist alles sichtbar, aber gesperrt.
// showTitle (Audit V7a): auf /beitraege steht direkt darüber die Seitenüberschrift "Beiträge" - dort bleibt "Eure Beiträge"
// nur für Screenreader (benennt den Abschnitt), sichtbar stünde es doppelt. Im Profil-Reiter der Tierheime sichtbar.
export default function PartnerPostsEditor({ typ, vertrauenswuerdig = false, showTitle = true }) {
  const isDemo = useIsDemo()
  const readOnlyHint = useReadOnlyHint()
  const toast = useToast()
  const [posts, setPosts] = useState(undefined)
  const [loadError, setLoadError] = useState(null)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(null) // null, 'new' oder ein Beitrag
  // Phase V1: jede Änderung an den Beiträgen lädt "Eure Karte in Entdecken" (PartnerCardOrder) neu.
  const [version, setVersion] = useState(0)
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

  // Nach einem Bild-Upload: Liste UND das offene Formular bekommen den neuen Stand (z. B. ist ein abgelehnter Beitrag
  // damit schon wieder eingereicht - Hinweis und Knopf im Formular folgen). Das Formular behält seine Eingaben.
  function replacePost(saved) {
    setVersion((current) => current + 1)
    setPosts((list) => list.map((item) => (item.id === saved.id ? saved : item)))
    setEditing((current) => (current && current !== 'new' && current.id === saved.id ? saved : current))
  }

  function handleSaved(saved, { created }) {
    setVersion((current) => current + 1)
    setPosts((list) => (created ? [saved, ...list] : list.map((item) => (item.id === saved.id ? saved : item))))
    setEditing(null)
    setError(null)
    toast(savedMessage(saved, { created }))
  }

  async function handleDelete(post) {
    setError(null)
    try {
      await api.partnerArea.deletePost(post.id)
      setPosts((list) => list.filter((item) => item.id !== post.id))
      setVersion((current) => current + 1)
      toast('Beitrag gelöscht.')
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <section className="partner-posts" aria-labelledby="partner-posts-title">
      <div className="partner-posts-head">
        <div>
          <h2 id="partner-posts-title" className={showTitle ? undefined : 'visually-hidden'}>
            Eure Beiträge
          </h2>
          <p className="partner-posts-hint">{vertrauenswuerdig ? POSTS_HINT_TRUSTED : POSTS_HINT}</p>
          {vertrauenswuerdig && (
            <p className="partner-posts-trusted">
              <Icon name="check" />
              {TRUSTED_HINT}
            </p>
          )}
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
          vertrauenswuerdig={vertrauenswuerdig}
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
              {readOnlyHint}
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
      {!editing && <PartnerCardOrder refreshKey={version} />}
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
