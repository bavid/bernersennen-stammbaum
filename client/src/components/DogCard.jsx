import { forwardRef } from 'react'
import { Link } from 'react-router-dom'
import Avatar from './Avatar.jsx'
import Icon from './Icon.jsx'
import { displayName, sexLabel, shortName } from '../lib/timeline.js'
import { yearOf } from '../lib/dates.js'

const SPECIES_BADGE = { katze: '🐈', anderes: '🐾' }

// variant: 'full' (Standard), 'lane' (etwas kleiner, Mitbewohner-Reihe), 'mini' (eingeklappte Generation)
const DogCard = forwardRef(function DogCard({ dog, livesWithLabel, highlighted, dimmed, onHover, variant = 'full' }, ref) {
  const year = yearOf(dog.geburtsdatum)
  const badge = SPECIES_BADGE[dog.tierart]
  const hoverProps = {
    onMouseEnter: () => onHover?.(dog.id),
    onMouseLeave: () => onHover?.(null),
    onFocus: () => onHover?.(dog.id),
    onBlur: () => onHover?.(null)
  }

  if (variant === 'mini') {
    const name = dog.name_unbekannt ? displayName(dog) : shortName(dog.name)
    return (
      <Link
        ref={ref}
        to={`/tier/${dog.id}`}
        className={['dog-mini', highlighted && 'is-highlighted', dimmed && 'is-dimmed'].filter(Boolean).join(' ')}
        title={displayName(dog)}
        {...hoverProps}
      >
        <span className="dog-mini-avatar">
          <Avatar dog={dog} size={40} />
          {/* Zu wenig Platz für einen Text-Tag – hier reicht das Haus-Symbol mit Titel/aria-label */}
          {dog.shared_from && (
            <span className="dog-mini-badge" title={`aus ${dog.shared_from}`} aria-label={`aus ${dog.shared_from}`}>
              <Icon name="home" />
            </span>
          )}
        </span>
        <span className="dog-mini-name">{name}</span>
      </Link>
    )
  }

  const classes = [
    'dog-card',
    variant === 'lane' && 'is-lane',
    dog.external && 'is-external',
    dog.name_unbekannt && 'is-unknown',
    livesWithLabel && 'is-housemate',
    highlighted && 'is-highlighted',
    dimmed && 'is-dimmed'
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <Link
      ref={ref}
      to={`/tier/${dog.id}`}
      className={classes}
      {...hoverProps}
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
        {dog.shared_from ? (
          <span className="dog-card-tag dog-card-shared">aus {dog.shared_from}</span>
        ) : dog.external ? (
          <span className="dog-card-tag">{dog.familyName}</span>
        ) : livesWithLabel ? (
          <span className="dog-card-tag dog-card-housemate">{livesWithLabel}</span>
        ) : (
          dog.timeline_count > 0 && (
            <span className="dog-card-tag">
              {dog.timeline_count} {dog.timeline_count === 1 ? 'Eintrag' : 'Einträge'}
            </span>
          )
        )}
      </span>
    </Link>
  )
})

export default DogCard
