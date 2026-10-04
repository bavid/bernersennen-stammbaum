import { useEffect, useState } from 'react'
import { api } from '../../api'
import ActivityFeed from '../ActivityFeed.jsx'
import StartComposer from '../start/StartComposer.jsx'
import { groupRoute } from '../../lib/areas.js'
import { nextTermin } from '../../lib/notes.js'

// So viele Beiträge zeigt der Reiter "Beiträge" (GET /api/timeline/recent, höchstens 20).
export const GROUP_FEED_LIMIT = 20

// Reiter "Beiträge" der Gruppenseite (Phase W): erzählen (für die Tiere, die hier bearbeitbar sind), der nächste Termin
// der Pinnwand und die neuesten Beiträge des Bereichs. canWrite: ab Mitglied (Phase R) und nie zu Besuch; visiting: zu
// Besuch gibt es keine Pinnwand (der Server liefert Gästen ohnehin eine leere Liste).
export default function GroupPosts({ family, dogs, canWrite, visiting }) {
  const [activity, setActivity] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    Promise.resolve()
      .then(() => Promise.all([api.recentActivity(GROUP_FEED_LIMIT), visiting ? [] : api.listNotes()]))
      .then(([entries, notes]) => {
        if (!cancelled) setActivity({ entries, termin: nextTermin(notes) })
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [visiting])

  function handleCreated(entry) {
    setActivity((current) => ({ ...(current || { termin: null }), entries: [entry, ...(current?.entries || [])] }))
  }

  return (
    <div className="group-posts">
      {canWrite && dogs && <StartComposer family={family} dogs={dogs} onCreated={handleCreated} />}
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {activity && (
        <ActivityFeed
          entries={activity.entries}
          termin={activity.termin}
          limit={GROUP_FEED_LIMIT}
          terminTo={groupRoute(family.id, 'pinnwand')}
          title={visiting ? 'Neuigkeiten' : undefined}
        />
      )}
    </div>
  )
}
