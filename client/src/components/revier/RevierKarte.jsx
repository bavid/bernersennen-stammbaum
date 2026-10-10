import { useId } from 'react'
import { Link } from 'react-router-dom'
import AreaAvatar from '../AreaAvatar.jsx'
import Avatar from '../Avatar.jsx'
import Icon from '../Icon.jsx'
import { Button, Card } from '../ui/index.js'
import FolgenKnopf from './FolgenKnopf.jsx'
import { ortZeile, profilPath } from '../../lib/revier.js'
import { useT } from '../../lib/i18n/index.js'

// Ein öffentliches Profil im Radar: Bild, Name, Entfernungsstufe (und Ort, wenn gezeigt), die Tiere und die neueste
// Erinnerung - dazu „Ansehen“ und „Folgen“. onFolgen(slug, folgeIch) meldet den neuen Stand nach oben.
export default function RevierKarte({ profil, onFolgen }) {
  const t = useT()
  const titleId = useId()
  const zeile = ortZeile(profil)
  return (
    <Card as="li" className="revier-karte" aria-labelledby={titleId}>
      <header className="revier-karte-kopf">
        <AreaAvatar name={profil.name} bild={profil.bild} size="md" />
        <div>
          <h3 id={titleId}>
            <Link to={profilPath(profil.slug)}>{profil.name}</Link>
          </h3>
          {zeile && (
            <span className="revier-ort">
              <Icon name="mapPin" />
              {zeile}
            </span>
          )}
        </div>
      </header>
      {profil.tiere?.length > 0 && (
        <ul className="revier-tiere" role="list" aria-label={t('Tiere')}>
          {profil.tiere.map((tier, index) => (
            <li key={`${tier.name}-${index}`}>
              <Avatar dog={{ name: tier.name, foto_url: tier.foto }} size={32} />
              {tier.name}
            </li>
          ))}
        </ul>
      )}
      {profil.neueste && (
        <p className="revier-neueste">
          <Icon name="book" />
          {t('Zuletzt: {titel}', { titel: profil.neueste.titel })}
        </p>
      )}
      <footer className="revier-karte-fuss">
        <Button as={Link} to={profilPath(profil.slug)} variant="ghost" size="sm">
          {t('Ansehen')}
        </Button>
        <FolgenKnopf slug={profil.slug} folgeIch={profil.folgeIch} onChange={(next) => onFolgen?.(profil.slug, next)} />
      </footer>
    </Card>
  )
}
