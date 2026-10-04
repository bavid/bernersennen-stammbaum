import { Link } from 'react-router-dom'
import Avatar from './Avatar.jsx'
import Icon from './Icon.jsx'
import { useTheme } from '../themes/ThemeProvider.jsx'
import { ageText, formatDateLong, relativeTime } from '../lib/dates.js'
import { LITTER_BIRTHDAY_SOON_DAYS, YOUNG_STAGE_KEY, nextLitterBirthday } from '../lib/litters.js'
import { displayName } from '../lib/timeline.js'

function Parent({ parent, role }) {
  if (!parent) return <span className="litter-parent is-unknown">{role} unbekannt</span>
  return parent.dog ? (
    <Link to={`/tier/${parent.id}`} className="litter-parent">
      <Avatar dog={parent.dog} size={28} />
      {parent.name}
    </Link>
  ) : (
    <span className="litter-parent is-text">{parent.name}</span>
  )
}

function BirthdayBadge({ birthday, onPlanMeeting }) {
  const { words } = useTheme()
  const when = birthday.daysUntil === 0 ? 'heute' : birthday.daysUntil === 1 ? 'morgen' : `in ${birthday.daysUntil} Tagen`
  return (
    <div className="litter-birthday" role="status">
      <Icon name="star" />
      <span>
        {words.litterBirthday} {when}: <strong>{birthday.age} {birthday.age === 1 ? 'Jahr' : 'Jahre'}</strong>
      </span>
      <button type="button" className="btn btn-ghost litter-meet" onClick={onPlanMeeting}>
        <Icon name="pin" /> Treffen planen
      </button>
    </div>
  )
}

function Sibling({ dog, latest }) {
  const { words } = useTheme()
  return (
    <Link to={`/tier/${dog.id}`} className="litter-sibling">
      <Avatar dog={dog} size={56} />
      <span className="litter-sibling-body">
        <span className="litter-sibling-name">{displayName(dog)}</span>
        {latest ? (
          <span className="litter-sibling-news">
            <span className="litter-sibling-title">{latest.titel}</span>
            <span className="muted">{relativeTime(latest.created_at)}</span>
          </span>
        ) : (
          <span className="muted">Noch keine {words.entries}</span>
        )}
      </span>
    </Link>
  )
}

// Ein Wurf: Eltern, Geschwister mit ihrem Neuesten, Fotos im gleichen Alter, Deckakt und Geburtstag - die Wörter
// je Auftritt (Phase U: Standard "Nachwuchs"/"Verpaarung"/"Ganz klein", Berner "Wurf"/"Deckakt"/"Als Welpen").
// cardRef: "Mehr anzeigen" auf der Nachwuchs-Seite setzt den Fokus auf die erste nachgeladene Karte (tabIndex -1).
export default function LitterCard({ litter, latest, stages, onPlanMeeting, onOpenPhoto, cardRef }) {
  const { words } = useTheme()
  const birthday = nextLitterBirthday(litter.birthDate)
  const soon = birthday && birthday.daysUntil <= LITTER_BIRTHDAY_SOON_DAYS
  const title = litter.birthDate ? `${words.litter} vom ${formatDateLong(litter.birthDate)}` : `${words.litter} (Geburtstag unbekannt)`
  const count = litter.puppies.length

  return (
    <article ref={cardRef} className="litter-card" aria-label={title} tabIndex={cardRef ? -1 : undefined}>
      <header className="litter-head">
        <div>
          <h2 className="litter-title">{title}</h2>
          <p className="litter-meta">
            {count} {count === 1 ? 'Tier' : 'Geschwister'} {words.inGroup}
            {litter.birthDate && ` · heute ${ageText(litter.birthDate)} alt`}
          </p>
        </div>
        <div className="litter-parents" aria-label="Eltern">
          <Parent parent={litter.mother} role="Mutter" />
          <Icon name="heart" />
          <Parent parent={litter.father} role="Vater" />
        </div>
      </header>

      {soon && <BirthdayBadge birthday={birthday} onPlanMeeting={() => onPlanMeeting(litter, birthday)} />}

      <div className="litter-siblings">
        {litter.puppies.map((dog) => (
          <Sibling key={dog.id} dog={dog} latest={latest.get(dog.id)} />
        ))}
      </div>

      {stages.length > 0 && (
        <section className="litter-stages" aria-label="Fotos im gleichen Alter">
          {stages.map((stage) => (
            <div key={stage.key} className="litter-stage">
              <h3 className="litter-stage-label">{stage.key === YOUNG_STAGE_KEY ? words.youngStage : stage.label}</h3>
              <div className="litter-stage-photos">
                {stage.photos.map((photo) => (
                  <figure key={photo.dog.id} className="litter-photo">
                    <button type="button" onClick={() => onOpenPhoto(photo.url)} aria-label={`Foto von ${displayName(photo.dog)} vergrößern`}>
                      <img src={photo.url} alt="" loading="lazy" />
                    </button>
                    <figcaption>
                      <strong>{displayName(photo.dog)}</strong> · {photo.titel}
                    </figcaption>
                  </figure>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {litter.breeding && (
        <p className="litter-breeding">
          <Icon name="heart" /> {words.mating} am {formatDateLong(litter.breeding.datum)}
          {litter.breeding.wurf_info && <span className="muted"> · {litter.breeding.wurf_info}</span>}
        </p>
      )}
    </article>
  )
}
