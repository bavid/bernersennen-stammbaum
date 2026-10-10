import { useTheme } from '../../themes/ThemeProvider.jsx'
import Avatar from '../Avatar.jsx'
import Icon from '../Icon.jsx'
import DogMoreMenu from './DogMoreMenu.jsx'
import { displayName, shortName } from '../../lib/timeline.js'
import { dogHeadLine, originLine, stayOwnerName } from '../../lib/dogProfile.js'
import { t } from '../../lib/i18n/index.js'
import { Button } from '../ui/index.js'

// Optionen für die Zeile unter dem Namen: mit Herkunftszeile (originLine) ohne „seit …“ - das steht dann in den Infos.
function headLineOptions(dog, family, origin) {
  if (origin) return { ownerName: dog.familyName, stay: false }
  const ownerName = stayOwnerName(dog, family)
  return ownerName ? { ownerName } : undefined
}

// Kompakter Kopf der Tierseite (Phase W, Schritt 2 - Muster Profilseite): Bild (vergrößerbar), Name, eine Zeile
// "Rasse · Alter · bei euch seit …", für ein geteiltes eigenes Tier der Chip "Sichtbar in: …" (führt zu "Wer sieht …?")
// und die Knöpfe Erzählen · Bearbeiten · ⋯ (nur wer schreiben darf). showTell: im Reiter Chronik steht das Erzählen-Feld
// direkt darunter - dann kein zweiter Knopf im Kopf. badge: z. B. der Besuchs-Chip.
// Ein Tier, das nicht euch gehört, sagt darunter, wo es lebt und wie ihr es seht (originLine: "lebt bei Zuhause Möwenweg ·
// geteilt mit euch über Familie Sonnenhang"). family: der aktive Bereich.
export default function DogHead({ dog, family, canWrite, showTell = true, visibleIn, menuItems, badge, onShowVisibility, onTell, onEdit, onOpenPhoto }) {
  const { words } = useTheme()
  const origin = originLine(dog, family)
  const line = dogHeadLine(dog, headLineOptions(dog, family, origin))
  const name = displayName(dog)
  return (
    <header className={`dog-head${line.memorial ? ' is-memorial' : ''}`}>
      <div className="dog-head-photo">
        {dog.foto_url ? (
          <button type="button" onClick={() => onOpenPhoto(dog.foto_url)} aria-label={t('Porträt vergrößern')}>
            <img src={dog.foto_url} alt={dog.name} width="160" height="160" />
          </button>
        ) : (
          <Avatar dog={dog} size={160} className="dog-head-fallback" />
        )}
      </div>

      <div className="dog-head-body">
        {badge}
        <h1 className={dog.name_unbekannt ? 'is-unknown' : undefined}>{name}</h1>
        {!dog.name_unbekannt && dog.name !== shortName(dog.name) && <p className="dog-head-fullname">{dog.name}</p>}
        {line.text && (
          <p className={`dog-head-line${line.memorial ? ' is-memorial' : ''}`}>
            {line.memorial && <Icon name="heart" />} {line.text}
          </p>
        )}
        {origin && (
          <p className="dog-head-origin">
            <Icon name="home" /> {origin}
          </p>
        )}
        {visibleIn.length > 0 && (
          <button type="button" className="chip dog-head-visible" onClick={onShowVisibility}>
            <Icon name="users" />
            {t('Sichtbar in: {names}', { names: visibleIn.join(', ') })}
          </button>
        )}
      </div>

      {/* Am Handy unter Bild und Name über die ganze Breite, mit der kurzen Beschriftung (words.tellActionShort). */}
      {(canWrite || menuItems.length > 0) && (
        <div className="dog-head-actions">
          {canWrite && showTell && (
            <Button type="button" className="dog-head-tell" onClick={onTell}>
              <Icon name="plus" />
              <span className="is-long">{words.tellAction}</span>
              <span className="is-short">{words.tellActionShort}</span>
            </Button>
          )}
          {canWrite && (
            <Button type="button" variant="ghost" onClick={onEdit}>
              <Icon name="edit" />
              {t('Bearbeiten')}
            </Button>
          )}
          <DogMoreMenu name={name} items={menuItems} />
        </div>
      )}
    </header>
  )
}
