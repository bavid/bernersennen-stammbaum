import { forwardRef } from 'react'
import { Link } from 'react-router-dom'
import Avatar from './Avatar.jsx'
import { displayName, sexLabel } from '../lib/timeline.js'
import { yearOf } from '../lib/dates.js'

const SPECIES_BADGE = { katze: '🐈', anderes: '🐾' }

const DogCard = forwardRef(function DogCard({ dog, adoptiveLabel, highlighted, dimmed, onHover }, ref) {
  const year = yearOf(dog.geburtsdatum)
  const badge = SPECIES_BADGE[dog.tierart]
  const classes = [
    'dog-card',
    dog.external && 'is-external',
    dog.name_unbekannt && 'is-unknown',
    adoptiveLabel && 'is-adoptive',
    highlighted && 'is-highlighted',
    dimmed && 'is-dimmed'
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <Link
      ref={ref}
      to={`/hund/${dog.id}`}
      className={classes}
      onMouseEnter={() => onHover?.(dog.id)}
      onMouseLeave={() => onHover?.(null)}
      onFocus={() => onHover?.(dog.id)}
      onBlur={() => onHover?.(null)}
    >
      <span className="dog-card-avatar">
        <Avatar dog={dog} size={60} />
        {badge && (
          <span className="species-badge" aria-hidden="true">
            {badge}
          </span>
        )}
      </span>
      <span className="dog-card-body">
        <span className="dog-card-name">{displayName(dog)}</span>
        {dog.rasse && (
          <span className="dog-card-breed" title={dog.rasse}>
            {dog.rasse}
          </span>
        )}
        <span className="dog-card-meta">
          <span className={`sex-dot sex-${dog.geschlecht}`} aria-hidden="true" />
          <span className="sex-label">{sexLabel(dog.geschlecht, dog.tierart)}</span>
          {year && <span>{year}</span>}
        </span>
        {dog.external && <span className="dog-card-tag">{dog.familyName}</span>}
        {!dog.external && adoptiveLabel && <span className="dog-card-tag dog-card-adoptive">{adoptiveLabel}</span>}
        {!dog.external && !adoptiveLabel && dog.timeline_count > 0 && (
          <span className="dog-card-tag">
            {dog.timeline_count} {dog.timeline_count === 1 ? 'Eintrag' : 'Einträge'}
          </span>
        )}
      </span>
    </Link>
  )
})

export default DogCard
