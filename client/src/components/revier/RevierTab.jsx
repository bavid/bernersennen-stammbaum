import { useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../Icon.jsx'
import RevierRadar from './RevierRadar.jsx'
import RevierFeed from './RevierFeed.jsx'
import RevierFolge from './RevierFolge.jsx'
import { REVIER_ANSICHTEN, REVIER_SETTINGS_PATH } from '../../lib/revier.js'
import { useT } from '../../lib/i18n/index.js'
import '../../styles/revier.css'

// Entdecken › „Mein Revier“ (Phase M): drei ruhige Ansichten statt einer langen Seite - In der Nähe (Radar), Aus deinem
// Revier (Feed der gefolgten Profile) und Ich folge. Unten der Weg zum eigenen öffentlichen Profil (Einstellungen).
export default function RevierTab({ plz, onPlzChange }) {
  const t = useT()
  const [ansicht, setAnsicht] = useState('naehe')
  return (
    <div className="revier">
      <p className="revier-lede">{t('Tiere aus eurer Nachbarschaft – nur von Menschen, die ihr Profil selbst öffentlich zeigen.')}</p>
      <div className="revier-chips revier-ansichten" role="group" aria-label={t('Mein Revier')}>
        {REVIER_ANSICHTEN.map((item) => (
          <button key={item.key} type="button" className="chip" aria-pressed={ansicht === item.key} onClick={() => setAnsicht(item.key)}>
            {t(item.label)}
          </button>
        ))}
      </div>
      {ansicht === 'naehe' && <RevierRadar plz={plz} onPlzChange={onPlzChange} />}
      {ansicht === 'feed' && <RevierFeed />}
      {ansicht === 'folge' && <RevierFolge />}
      <p className="revier-eigenes">
        <Link to={REVIER_SETTINGS_PATH}>
          <Icon name="globe" />
          {t('Euer eigenes öffentliches Profil einstellen')}
        </Link>
      </p>
    </div>
  )
}
