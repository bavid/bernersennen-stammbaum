import { Link } from 'react-router-dom'

export default function DogCard({ dog }) {
  const geburtsjahr = dog.geburtsdatum ? new Date(dog.geburtsdatum).getFullYear() : null

  return (
    <Link to={`/hund/${dog.id}`} className="dog-card">
      {dog.foto_url ? (
        <img className="dog-card-photo" src={dog.foto_url} alt={dog.name} />
      ) : (
        <div className="dog-card-photo" aria-hidden="true" />
      )}
      <div>
        <p className="dog-card-name">{dog.name}</p>
        <p className="dog-card-meta">
          {dog.geschlecht === 'ruede' ? 'Rüde' : 'Hündin'}
          {geburtsjahr ? ` · geb. ${geburtsjahr}` : ''}
        </p>
      </div>
    </Link>
  )
}
