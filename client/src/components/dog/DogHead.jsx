import { useTheme } from '../../themes/ThemeProvider.jsx'
import Avatar from '../Avatar.jsx'
import Icon from '../Icon.jsx'
import DogMoreMenu from './DogMoreMenu.jsx'
import { displayName, shortName } from '../../lib/timeline.js'
import { dogHeadLine } from '../../lib/dogProfile.js'

// Kompakter Kopf der Tierseite (Phase W, Schritt 2 - Muster Profilseite): Bild (vergrößerbar), Name, eine Zeile
// "Rasse · Alter · bei euch seit …", für ein geteiltes eigenes Tier der Chip "Sichtbar in: …" (führt zu "Wer sieht …?")
// und die Knöpfe Erzählen · Bearbeiten · ⋯ (nur wer schreiben darf). badge: z. B. der Besuchs-Chip.
export default function DogHead({ dog, canWrite, visibleIn, menuItems, badge, onShowVisibility, onTell, onEdit, onOpenPhoto }) {
  const { words } = useTheme()
  const line = dogHeadLine(dog, !dog.canEdit ? { ownerName: dog.familyName } : undefined)
  const name = displayName(dog)
  return (
    <header className="dog-head">
      <div className="dog-head-photo">
        {dog.foto_url ? (
          <button type="button" onClick={() => onOpenPhoto(dog.foto_url)} aria-label="Porträt vergrößern">
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
        {visibleIn.length > 0 && (
          <button type="button" className="chip dog-head-visible" onClick={onShowVisibility}>
            <Icon name="users" />
            Sichtbar in: {visibleIn.join(', ')}
          </button>
        )}
      </div>

      {/* Am Handy unter Bild und Name über die ganze Breite, mit der kurzen Beschriftung (words.tellActionShort). */}
      {(canWrite || menuItems.length > 0) && (
        <div className="dog-head-actions">
          {canWrite && (
            <button type="button" className="btn btn-primary dog-head-tell" onClick={onTell}>
              <Icon name="plus" />
              <span className="is-long">{words.tellAction}</span>
              <span className="is-short">{words.tellActionShort}</span>
            </button>
          )}
          {canWrite && (
            <button type="button" className="btn btn-ghost" onClick={onEdit}>
              <Icon name="edit" />
              Bearbeiten
            </button>
          )}
          <DogMoreMenu name={name} items={menuItems} />
        </div>
      )}
    </header>
  )
}
