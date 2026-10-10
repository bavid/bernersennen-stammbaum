import { Link } from 'react-router-dom'
import AreaAvatar from '../AreaAvatar.jsx'
import { Card } from '../ui/index.js'
import { formatDateShort } from '../../lib/dates.js'
import { profilPath } from '../../lib/revier.js'
import { useT } from '../../lib/i18n/index.js'

// Eine öffentliche Erinnerung (Profilseite und „Aus deinem Revier“): erstes Foto, Titel, Datum, Tier, Text - im Feed
// dazu, von welchem Profil sie kommt. Ohne Autor-Namen: der Server schickt keinen.
export default function RevierEintrag({ eintrag }) {
  const t = useT()
  const foto = eintrag.fotos?.[0]
  return (
    <Card as="li" pad="sm" className="revier-eintrag">
      {foto && <img className="revier-eintrag-foto" src={foto} alt={t('Foto: {titel}', { titel: eintrag.titel })} loading="lazy" decoding="async" />}
      <div className="revier-eintrag-text">
        {eintrag.profil && (
          <Link className="revier-eintrag-profil" to={profilPath(eintrag.profil.slug)}>
            <AreaAvatar name={eintrag.profil.name} bild={eintrag.profil.bild} size="sm" />
            {eintrag.profil.name}
          </Link>
        )}
        <h3>{eintrag.titel}</h3>
        <span className="settings-row-sub">
          {formatDateShort(eintrag.datum)} · {eintrag.tier?.name}
        </span>
        {eintrag.text && <p className="revier-eintrag-body">{eintrag.text}</p>}
      </div>
    </Card>
  )
}
