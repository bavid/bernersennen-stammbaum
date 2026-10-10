import { useState } from 'react'
import { api } from '../../api'
import AreaAvatar from '../AreaAvatar.jsx'
import Avatar from '../Avatar.jsx'
import Icon from '../Icon.jsx'
import { useToast } from '../Toast.jsx'
import { Button, Card, EmptyState } from '../ui/index.js'
import FolgenKnopf from './FolgenKnopf.jsx'
import RevierEintrag from './RevierEintrag.jsx'
import { useIsDemo } from '../../lib/demo.js'
import { followerZeile } from '../../lib/revier.js'
import { useT } from '../../lib/i18n/index.js'
import '../../styles/revier.css'

function Kopf({ profil, vorschau, onChange }) {
  const t = useT()
  const toast = useToast()
  const readOnly = useIsDemo()
  const fremd = !vorschau && !profil.eigenes

  async function toggleAusblenden() {
    try {
      if (profil.ausgeblendet) await api.revier.einblenden(profil.slug)
      else await api.revier.ausblenden(profil.slug)
      onChange({ ausgeblendet: !profil.ausgeblendet, folgeIch: false })
    } catch (err) {
      toast(err.message)
    }
  }

  return (
    <header className="revier-profil-kopf">
      <AreaAvatar name={profil.name} bild={profil.bild} size="lg" />
      <div className="revier-profil-titel">
        <h1>{profil.name}</h1>
        {profil.ort && (
          <span className="revier-ort">
            <Icon name="mapPin" />
            {profil.ort}
          </span>
        )}
        {profil.text && <p className="revier-profil-text">{profil.text}</p>}
        <p className="settings-row-sub">{followerZeile(profil.follower)}</p>
      </div>
      {fremd && (
        <div className="revier-profil-aktionen">
          {!profil.ausgeblendet && <FolgenKnopf slug={profil.slug} folgeIch={profil.folgeIch} size="md" onChange={(folgeIch) => onChange({ folgeIch })} />}
          <Button variant="ghost" size="sm" disabled={readOnly} onClick={toggleAusblenden}>
            <Icon name={profil.ausgeblendet ? 'eye' : 'eyeOff'} />
            {profil.ausgeblendet ? t('Wieder einblenden') : t('Für mich ausblenden')}
          </Button>
        </div>
      )}
    </header>
  )
}

function Tiere({ tiere }) {
  const t = useT()
  if (tiere.length === 0) return null
  return (
    <section aria-labelledby="revier-tiere-titel">
      <h2 id="revier-tiere-titel" className="revier-abschnitt">
        {t('Tiere')}
      </h2>
      <ul className="revier-tiere revier-tiere--gross" role="list">
        {tiere.map((tier, index) => (
          <li key={`${tier.name}-${index}`}>
            <Avatar dog={{ name: tier.name, foto_url: tier.foto }} size={56} />
            <span>
              <strong>{tier.name}</strong>
              {tier.rasse && <span className="settings-row-sub">{tier.rasse}</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

// Ein öffentliches Profil, genau wie es andere sehen: Kopf (Bild, Name, Ort nur wenn gezeigt, Text, Folgende), Tiere und
// die öffentlichen Erinnerungen mit „Mehr zeigen“. vorschau (Einstellungen › „Mein Profil für andere“): ohne Knöpfe.
// onMore(weiter) lädt die nächste Seite; onChange(patch) übernimmt Folgen/Ausblenden.
export default function RevierProfil({ profil, vorschau = false, onMore, onChange = () => {} }) {
  const t = useT()
  const [busy, setBusy] = useState(false)

  async function more() {
    if (busy || !onMore) return
    setBusy(true)
    try {
      await onMore(profil.weiter)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card as="article" className="revier-profil">
      <Kopf profil={profil} vorschau={vorschau} onChange={onChange} />
      <Tiere tiere={profil.tiere || []} />
      <section aria-labelledby="revier-eintraege-titel">
        <h2 id="revier-eintraege-titel" className="revier-abschnitt">
          {t('Öffentliche Erinnerungen')}
        </h2>
        {profil.eintraege.length === 0 ? (
          <EmptyState icon="book" title={t('Noch keine öffentlichen Erinnerungen.')} />
        ) : (
          <ul className="revier-eintraege" role="list">
            {profil.eintraege.map((eintrag) => (
              <RevierEintrag key={eintrag.id} eintrag={eintrag} />
            ))}
          </ul>
        )}
        {profil.weiter && onMore && (
          <Button variant="ghost" aria-busy={busy || undefined} onClick={more}>
            {t('Mehr zeigen')}
          </Button>
        )}
      </section>
    </Card>
  )
}
