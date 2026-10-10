import { useEffect, useState } from 'react'
import { api } from '../api'
import { useToast } from './Toast.jsx'
import { Button, Chip, EmptyState } from './ui/index.js'

// Admin › Inhalte & Freigaben › „Öffentliche Profile“ (Phase M „Mein Revier“, server/routes/adminRevier.js): alle
// eingeschalteten oder gesperrten Profile - ohne PLZ - mit dem Not-Aus „Ausschalten“ (sofort überall unsichtbar) und
// „Wieder zulassen“. Melden und Kommentare kommen in Schritt 2.
export default function AdminRevier() {
  const toast = useToast()
  const [profile, setProfile] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(null)

  useEffect(() => {
    api.revier
      .adminListe()
      .then((data) => setProfile(data.profile))
      .catch((err) => setError(err.message))
  }, [])

  async function toggle(profil) {
    setBusy(profil.slug)
    try {
      const result = await api.revier.adminSperre(profil.slug, !profil.gesperrt)
      setProfile((current) => current.map((item) => (item.slug === profil.slug ? { ...item, gesperrt: result.gesperrt } : item)))
    } catch (err) {
      toast(err.message)
    } finally {
      setBusy(null)
    }
  }

  if (error) return <div className="error-banner" role="alert">{error}</div>
  if (!profile) return <p className="muted">Lade …</p>
  if (profile.length === 0) return <EmptyState icon="globe" title="Noch keine öffentlichen Profile." />
  return (
    <section className="admin-card" aria-labelledby="admin-revier-titel">
      <h2 id="admin-revier-titel">Öffentliche Profile („Mein Revier“)</h2>
      <p className="muted">Ausschalten wirkt sofort: Profil, Erinnerungen und Fotos sind für alle anderen unsichtbar.</p>
      <ul className="settings-list" role="list">
        {profile.map((profil) => (
          <li key={profil.slug} className="settings-row">
            <div className="settings-row-main">
              <strong>{profil.name}</strong>
              <span className="settings-row-sub">
                {profil.tiere} Tiere · {profil.eintraege} Erinnerungen · {profil.follower} Folgende
              </span>
              <span>
                {profil.gesperrt ? <Chip tone="gesperrt" icon="lock">Ausgeschaltet</Chip> : <Chip tone="ok">Sichtbar</Chip>}
                {profil.isDemo && <Chip>Demo</Chip>}
              </span>
            </div>
            <Button variant={profil.gesperrt ? 'ghost' : 'danger'} size="sm" aria-busy={busy === profil.slug || undefined} onClick={() => toggle(profil)}>
              {profil.gesperrt ? 'Wieder zulassen' : 'Ausschalten'}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  )
}
