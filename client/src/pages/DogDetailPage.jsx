import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api } from '../api'
import TimelineList from '../components/TimelineList.jsx'
import TimelineEntryForm from '../components/TimelineEntryForm.jsx'

export default function DogDetailPage() {
  const { id } = useParams()
  const [dog, setDog] = useState(null)
  const [entries, setEntries] = useState([])
  const [error, setError] = useState(null)

  async function load() {
    const [dogData, timelineData] = await Promise.all([api.getDog(id), api.listTimeline(id)])
    setDog(dogData)
    setEntries(timelineData)
  }

  useEffect(() => {
    load().catch((err) => setError(err.message))
  }, [id])

  if (error) return <div className="error-banner">{error}</div>
  if (!dog) return <p className="empty-state">Lade...</p>

  const geburtsjahr = dog.geburtsdatum ? new Date(dog.geburtsdatum).getFullYear() : null

  return (
    <div>
      <div className="page-header">
        <div className="eyebrow">
          <Link to="/stammbaum">← Zurück zum Stammbaum</Link>
        </div>
        <h1>{dog.name}</h1>
        <p className="dog-card-meta">
          {dog.geschlecht === 'ruede' ? 'Rüde' : 'Hündin'}
          {geburtsjahr ? ` · geb. ${geburtsjahr}` : ''}
          {dog.farbe_markings ? ` · ${dog.farbe_markings}` : ''}
        </p>
      </div>

      <div className="card" style={{ display: 'flex', gap: 'var(--space-6)', marginBottom: 'var(--space-8)' }}>
        {dog.foto_url && (
          <img
            src={dog.foto_url}
            alt={dog.name}
            style={{ width: '9rem', height: '9rem', objectFit: 'cover', borderRadius: 'var(--radius-md)' }}
          />
        )}
        <div>
          {dog.beschreibung && <p>{dog.beschreibung}</p>}
          <p className="dog-card-meta">
            Mutter:{' '}
            {dog.mother ? (
              <Link to={`/hund/${dog.mother.id}`}>{dog.mother.name}</Link>
            ) : (
              dog.mother_freitext || 'unbekannt'
            )}
          </p>
          <p className="dog-card-meta">
            Vater:{' '}
            {dog.father ? (
              <Link to={`/hund/${dog.father.id}`}>{dog.father.name}</Link>
            ) : (
              dog.father_freitext || 'unbekannt'
            )}
          </p>
        </div>
      </div>

      <h2>Timeline</h2>
      <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
        <TimelineList entries={entries} />
      </div>

      <h2>Neuer Eintrag</h2>
      <div className="card">
        <TimelineEntryForm dogId={dog.id} onCreated={(entry) => setEntries([entry, ...entries])} />
      </div>
    </div>
  )
}
