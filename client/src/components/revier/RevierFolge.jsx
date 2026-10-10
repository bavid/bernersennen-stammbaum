import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api'
import AreaAvatar from '../AreaAvatar.jsx'
import { useToast } from '../Toast.jsx'
import { Button, EmptyState } from '../ui/index.js'
import FolgenKnopf from './FolgenKnopf.jsx'
import { useIsDemo } from '../../lib/demo.js'
import { profilPath } from '../../lib/revier.js'
import { useT } from '../../lib/i18n/index.js'

function Ausgeblendete({ profile, onEinblenden }) {
  const t = useT()
  const readOnly = useIsDemo()
  if (profile.length === 0) return null
  return (
    <details className="revier-ausgeblendet">
      <summary>{t('Ausgeblendete Profile ({n})', { n: profile.length })}</summary>
      <ul className="settings-list" role="list">
        {profile.map((profil) => (
          <li key={profil.slug} className="settings-row">
            <span className="settings-row-main">{profil.name}</span>
            <Button variant="ghost" size="sm" disabled={readOnly} onClick={() => onEinblenden(profil.slug)}>
              {t('Wieder zeigen')}
            </Button>
          </li>
        ))}
      </ul>
    </details>
  )
}

// „Ich folge“: die gefolgten Profile (Entfolgen direkt hier) und, eingeklappt, die für mich ausgeblendeten.
export default function RevierFolge() {
  const t = useT()
  const toast = useToast()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([api.revier.folge(), api.revier.ausgeblendet()])
      .then(([folge, ausgeblendet]) => setData({ folge: folge.profile, ausgeblendet: ausgeblendet.profile }))
      .catch((err) => setError(err.message))
  }, [])

  async function einblenden(slug) {
    try {
      await api.revier.einblenden(slug)
      setData((current) => ({ ...current, ausgeblendet: current.ausgeblendet.filter((p) => p.slug !== slug) }))
    } catch (err) {
      toast(err.message)
    }
  }

  const entfolgt = (slug) => setData((current) => ({ ...current, folge: current.folge.filter((p) => p.slug !== slug) }))

  if (error) {
    return (
      <div className="error-banner" role="alert">
        {error}
      </div>
    )
  }
  if (!data) return <p className="muted">{t('Lädt …')}</p>
  return (
    <section className="revier-folge">
      {data.folge.length === 0 ? (
        <EmptyState icon="users" title={t('Ihr folgt noch niemandem.')}>
          {t('Unter „In der Nähe“ findet ihr Tiere aus eurer Nachbarschaft.')}
        </EmptyState>
      ) : (
        <ul className="settings-list" role="list">
          {data.folge.map((profil) => (
            <li key={profil.slug} className="settings-row revier-folge-zeile">
              <Link className="settings-row-main revier-folge-name" to={profilPath(profil.slug)}>
                <AreaAvatar name={profil.name} bild={profil.bild} size="sm" />
                {profil.name}
              </Link>
              <FolgenKnopf slug={profil.slug} folgeIch onChange={() => entfolgt(profil.slug)} />
            </li>
          ))}
        </ul>
      )}
      <Ausgeblendete profile={data.ausgeblendet} onEinblenden={einblenden} />
    </section>
  )
}
