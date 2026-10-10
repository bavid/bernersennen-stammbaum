import { useId } from 'react'
import { Link } from 'react-router-dom'
import Avatar from '../Avatar.jsx'
import Icon from '../Icon.jsx'
import ShareSwitch from '../shares/ShareSwitch.jsx'
import { GUEST_SHARE_HINT } from '../shares/FamilyShareCard.jsx'
import { Button, Card, Chip, EmptyState } from '../ui/index.js'
import { displayName } from '../../lib/timeline.js'
import { framesFor } from '../../lib/sichtbarkeit.js'
import { SETTINGS_ROUTE } from '../../lib/areas.js'
import { revierStand } from '../../lib/revier.js'
import { useT } from '../../lib/i18n/index.js'

function FamilySwitches({ dog, memberships, matrix, readOnly }) {
  const t = useT()
  if (memberships.length === 0) return <p className="muted">{t('Noch in keiner Familie – sehen nur ihr und eure Gäste.')}</p>
  return (
    <ul className="share-switches" role="list" aria-label={t('{name} zeigen in', { name: displayName(dog) })}>
      {memberships.map((membership) => {
        const checked = matrix.sharesOf(dog.id).includes(membership.id)
        const guestOnly = membership.rolle === 'gast' && !checked
        return (
          <li key={membership.id}>
            <ShareSwitch
              label={membership.name}
              checked={checked}
              disabled={readOnly || guestOnly}
              busy={matrix.isSaving(dog.id)}
              hint={guestOnly ? t(GUEST_SHARE_HINT) : null}
              onChange={(next) => matrix.toggle(dog.id, membership.id, next)}
            />
          </li>
        )
      })}
    </ul>
  )
}

// Gäste, Tierheim, Bilderrahmen und „Öffentlich“ - je eine ruhige Zeile; nur das Tierheim hat einen Schalter.
function OtherViewers({ dog, data, sicht, readOnly }) {
  const t = useT()
  const shelter = data.shelters[dog.id]
  const frames = framesFor(dog.id, data.frames)
  const guests = data.guests.length
  const stand = revierStand(data.revier)
  const imRevier = stand.aktiv && stand.tiere.has(dog.id)
  return (
    <ul className="sicht-lines" role="list">
      <li>
        <Icon name="eye" />
        {guests === 0 ? t('Keine Gäste') : t(guests === 1 ? '1 Gast sieht {name} (nur lesen)' : '{n} Gäste sehen {name} (nur lesen)', { n: guests, name: displayName(dog) })}
      </li>
      {shelter && (
        <li className="sicht-line-switch">
          <ShareSwitch
            label={t('{shelter} darf mitlesen', { shelter: shelter.name })}
            checked={shelter.liestMit}
            disabled={readOnly}
            busy={sicht.isBusy(`shelter-${dog.id}`)}
            onChange={(next) => sicht.setShelterReading(dog.id, next)}
          />
        </li>
      )}
      {frames.length > 0 && (
        <li>
          <Icon name="frame" />
          {t('Bilderrahmen: {names}', { names: frames.map((frame) => frame.name).join(', ') })}
        </li>
      )}
      <li className={imRevier ? undefined : 'muted'}>
        <Icon name="globe" />
        {imRevier ? t('Im öffentlichen Profil (Mein Revier)') : t('Kein öffentlicher Steckbrief')}
      </li>
    </ul>
  )
}

function AnimalCard({ dog, family, data, matrix, readOnly, sicht, onShowMemories }) {
  const t = useT()
  const titleId = useId()
  const counts = data.counts[dog.id] || { privat: 0, geteilt: 0 }
  const shared = matrix.sharesOf(dog.id).length > 0
  return (
    <Card as="li" className="sicht-tier" aria-labelledby={titleId}>
      <header className="sicht-tier-head">
        <Avatar dog={dog} size={48} />
        <div>
          <h3 id={titleId}>{displayName(dog)}</h3>
          <Chip tone={shared ? 'ok' : 'neutral'} icon={shared ? 'users' : 'lock'}>
            {shared ? t('In Familien zu sehen') : t('In keiner Familie')}
          </Chip>
        </div>
      </header>
      <FamilySwitches dog={dog} memberships={family.memberships || []} matrix={matrix} readOnly={readOnly} />
      <OtherViewers dog={dog} data={data} sicht={sicht} readOnly={readOnly} />
      <footer className="sicht-tier-foot">
        <span>{t('{privat} private · {geteilt} geteilte Erinnerungen', counts)}</span>
        <Button variant="ghost" size="sm" onClick={() => onShowMemories(dog.id)}>
          {t('Erinnerungen ansehen')}
        </Button>
      </footer>
    </Card>
  )
}

// Ansicht „Tiere“: je eigenem Tier, wer es sieht - Familien mit einem Schalter (PUT /api/dogs/:id/shares), Gäste,
// Tierheim (PUT /shelter-share), Bilderrahmen - und wie viele seiner Erinnerungen privat bzw. geteilt sind.
// focusDogId (?tier= von der Tierseite): nur dieses Tier, mit dem Weg zurück zu allen.
export default function TiereAnsicht({ family, data, matrix, readOnly, sicht, focusDogId, onShowMemories }) {
  const t = useT()
  const focused = data.animals.filter((dog) => dog.id === focusDogId)
  const animals = focused.length ? focused : data.animals
  if (data.animals.length === 0) return <EmptyState icon="paw" title={t('Noch keine eigenen Tiere')} />
  return (
    <>
      {focused.length > 0 && (
        <Link className="back-link" to={`${SETTINGS_ROUTE}?bereich=sichtbarkeit`}>
          <Icon name="arrowLeft" />
          {t('Alle Tiere')}
        </Link>
      )}
      <ul className="sicht-tiere" role="list">
        {animals.map((dog) => (
          <AnimalCard key={dog.id} dog={dog} family={family} data={data} matrix={matrix} readOnly={readOnly} sicht={sicht} onShowMemories={onShowMemories} />
        ))}
      </ul>
    </>
  )
}
