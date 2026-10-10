import { forwardRef } from 'react'
import { Link } from 'react-router-dom'
import Avatar from './Avatar.jsx'
import { useTheme } from '../themes/ThemeProvider.jsx'
import Icon from './Icon.jsx'
import { displayName, isKnownSex, sexLabel, shortName, speciesLabel } from '../lib/timeline.js'
import { yearOf } from '../lib/dates.js'
import { t } from '../lib/i18n/index.js'

const SPECIES_BADGE = { katze: '🐈', anderes: '🐾' }

// Zeile unter Name und Geschlecht: Herkunft eines geteilten Tiers, die Familie eines fremden Elternteils, "lebt mit …"
// oder die Zahl der Einträge. Im Raster der Familienbande (grid, Familienbande 2) nur die Herkunft - und die nur, wo
// nicht ohnehin nach diesem Zuhause gefiltert ist (showOrigin).
function CardTag({ dog, variant, livesWithLabel, showOrigin }) {
  const { words } = useTheme()
  if (dog.shared_from && showOrigin) {
    // Im Raster bleibt die Zeile einzeilig (gekürzt) - der volle Name steht dann im Tooltip.
    const title = variant === 'grid' ? t('aus {name}', { name: dog.shared_from }) : undefined
    return (
      <span className="dog-card-tag dog-card-shared" title={title}>
        {t('aus {name}', { name: dog.shared_from })}
      </span>
    )
  }
  if (variant === 'grid') return null
  if (dog.external) return <span className="dog-card-tag">{dog.familyName}</span>
  if (livesWithLabel) return <span className="dog-card-tag dog-card-housemate">{livesWithLabel}</span>
  if (!(dog.timeline_count > 0)) return null
  return (
    <span className="dog-card-tag">
      {dog.timeline_count} {dog.timeline_count === 1 ? words.entry : words.entries}
    </span>
  )
}

// variant: 'full' (Standard), 'lane' (etwas kleiner, Mitbewohner-Reihe), 'mini' (eingeklappte Generation),
// 'grid' (Raster der Familienbande, ohne Einträge-Zähler). showOrigin: "aus …" an geteilten Tieren (Standard: ja).
const DogCard = forwardRef(function DogCard(
  { dog, livesWithLabel, highlighted, dimmed, onHover, variant = 'full', showOrigin = true },
  ref
) {
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
          {/* Zu wenig Platz für einen Text-Tag – hier reicht das Haus-Symbol mit Titel; der Text für
              Screenreader steckt als visuell verstecktes Kind im Symbol (ein aria-label an einem
              nicht-interaktiven <span> wird nicht von jedem Screenreader vorgelesen). */}
          {dog.shared_from && (
            <span className="dog-mini-badge" title={t('aus {name}', { name: dog.shared_from })}>
              <Icon name="home" />
              <span className="visually-hidden">{t('aus {name}', { name: dog.shared_from })}</span>
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
    variant === 'grid' && 'is-grid',
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
          {/* Geschlecht „weiß ich nicht“: weder Punkt noch Hündin/Rüde - nur die Art. */}
          {isKnownSex(dog.geschlecht) && <span className={`sex-dot sex-${dog.geschlecht}`} aria-hidden="true" />}
          <span className="sex-label">{sexLabel(dog.geschlecht, dog.tierart) || speciesLabel(dog.tierart)}</span>
          {year && <span>{year}</span>}
        </span>
        <CardTag dog={dog} variant={variant} livesWithLabel={livesWithLabel} showOrigin={showOrigin} />
      </span>
    </Link>
  )
})

export default DogCard
