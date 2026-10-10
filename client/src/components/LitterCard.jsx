import { Link } from 'react-router-dom'
import Avatar from './Avatar.jsx'
import Icon from './Icon.jsx'
import { useTheme } from '../themes/ThemeProvider.jsx'
import { ageText, formatDateLong, relativeTime } from '../lib/dates.js'
import { LITTER_BIRTHDAY_SOON_DAYS, YOUNG_STAGE_KEY, nextLitterBirthday } from '../lib/litters.js'
import { displayName } from '../lib/timeline.js'
import { t } from '../lib/i18n/index.js'

function Parent({ parent, role }) {
  if (!parent) return <span className="litter-parent is-unknown">{t('{role} unbekannt', { role })}</span>
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
  const when = birthday.daysUntil === 0 ? t('heute') : birthday.daysUntil === 1 ? t('morgen') : t('in {n} Tagen', { n: birthday.daysUntil })
  return (
    <div className="litter-birthday" role="status">
      <Icon name="star" />
      <span>
        {words.litterBirthday} {when}: <strong>{birthday.age === 1 ? t('{n} Jahr', { n: birthday.age }) : t('{n} Jahre', { n: birthday.age })}</strong>
      </span>
      <button type="button" className="btn btn-ghost litter-meet" onClick={onPlanMeeting}>
        <Icon name="pin" /> {t('Treffen planen')}
      </button>
    </div>
  )
}

// Beschriftung der Altersstufe (lib/litters.js ageBucket) erst beim Anzeigen übersetzt - "Mit 3 Jahren" mit Zahl.
function stageLabel(stage) {
  const years = /^jahr-(\d+)$/.exec(stage.key)?.[1]
  return years && years !== '1' ? t('Mit {n} Jahren', { n: years }) : t(stage.label)
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
          <span className="muted">{t('Noch keine {entries}', { entries: words.entries })}</span>
        )}
      </span>
    </Link>
  )
}

// Ein Wurf: Eltern, Geschwister mit ihrem Neuesten, Fotos im gleichen Alter, Verpaarung und Geburtstag - die Wörter
// aus dem Auftritt (Phase U: "Nachwuchs"/"Verpaarung"/"Ganz klein").
// cardRef: "Mehr anzeigen" auf der Nachwuchs-Seite setzt den Fokus auf die erste nachgeladene Karte (tabIndex -1).
export default function LitterCard({ litter, latest, stages, onPlanMeeting, onOpenPhoto, cardRef }) {
  const { words } = useTheme()
  const birthday = nextLitterBirthday(litter.birthDate)
  const soon = birthday && birthday.daysUntil <= LITTER_BIRTHDAY_SOON_DAYS
  const title = litter.birthDate
    ? t('{litter} vom {date}', { litter: words.litter, date: formatDateLong(litter.birthDate) })
    : t('{litter} (Geburtstag unbekannt)', { litter: words.litter })
  const count = litter.puppies.length

  return (
    <article ref={cardRef} className="litter-card" aria-label={title} tabIndex={cardRef ? -1 : undefined}>
      <header className="litter-head">
        <div>
          <h2 className="litter-title">{title}</h2>
          <p className="litter-meta">
            {count === 1 ? t('{n} Tier {inGroup}', { n: count, inGroup: words.inGroup }) : t('{n} Geschwister {inGroup}', { n: count, inGroup: words.inGroup })}
            {litter.birthDate && ` · ${t('heute {age} alt', { age: ageText(litter.birthDate) })}`}
          </p>
        </div>
        <div className="litter-parents" aria-label={t('Eltern')}>
          <Parent parent={litter.mother} role={t('Mutter')} />
          <Icon name="heart" />
          <Parent parent={litter.father} role={t('Vater')} />
        </div>
      </header>

      {soon && <BirthdayBadge birthday={birthday} onPlanMeeting={() => onPlanMeeting(litter, birthday)} />}

      <div className="litter-siblings">
        {litter.puppies.map((dog) => (
          <Sibling key={dog.id} dog={dog} latest={latest.get(dog.id)} />
        ))}
      </div>

      {stages.length > 0 && (
        <section className="litter-stages" aria-label={t('Fotos im gleichen Alter')}>
          {stages.map((stage) => (
            <div key={stage.key} className="litter-stage">
              <h3 className="litter-stage-label">{stage.key === YOUNG_STAGE_KEY ? words.youngStage : stageLabel(stage)}</h3>
              <div className="litter-stage-photos">
                {stage.photos.map((photo) => (
                  <figure key={photo.dog.id} className="litter-photo">
                    <button type="button" onClick={() => onOpenPhoto(photo.url)} aria-label={t('Foto von {name} vergrößern', { name: displayName(photo.dog) })}>
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
          <Icon name="heart" /> {t('{mating} am {date}', { mating: words.mating, date: formatDateLong(litter.breeding.datum) })}
          {litter.breeding.wurf_info && <span className="muted"> · {litter.breeding.wurf_info}</span>}
        </p>
      )}
    </article>
  )
}
