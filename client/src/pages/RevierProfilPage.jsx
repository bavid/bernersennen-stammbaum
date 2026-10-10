import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api'
import Icon from '../components/Icon.jsx'
import RevierProfil from '../components/revier/RevierProfil.jsx'
import { EmptyState } from '../components/ui/index.js'
import { useNoIndex } from '../hooks/useNoIndex.js'
import { DISCOVER_REVIER_PATH } from '../lib/revier.js'
import { useT } from '../lib/i18n/index.js'

// /revier/:slug (Phase M, nur angemeldet): ein öffentliches Profil aus „Mein Revier“. Nie in Suchmaschinen (noindex hier
// und X-Robots-Tag am Server); ausgeschaltet oder gesperrt -> „gibt es nicht (mehr)“.
export default function RevierProfilPage() {
  const t = useT()
  const { slug } = useParams()
  const [profil, setProfil] = useState(null)
  const [error, setError] = useState(null)
  useNoIndex()

  useEffect(() => {
    let active = true
    setProfil(null)
    setError(null)
    api.revier
      .profil(slug)
      .then((data) => active && setProfil(data))
      .catch((err) => active && setError(err))
    return () => {
      active = false
    }
  }, [slug])

  async function more(vor) {
    const next = await api.revier.profil(slug, vor)
    setProfil((current) => ({ ...current, eintraege: [...current.eintraege, ...next.eintraege], weiter: next.weiter }))
  }

  return (
    <div className="page revier-seite">
      <Link className="back-link" to={DISCOVER_REVIER_PATH}>
        <Icon name="arrowLeft" />
        {t('Mein Revier')}
      </Link>
      {error && error.status === 404 && <EmptyState icon="compass" title={t('Dieses Profil gibt es nicht (mehr).')} />}
      {error && error.status !== 404 && (
        <div className="error-banner" role="alert">
          {error.message}
        </div>
      )}
      {!profil && !error && <p className="muted">{t('Lädt …')}</p>}
      {profil && <RevierProfil profil={profil} onMore={more} onChange={(patch) => setProfil((current) => ({ ...current, ...patch }))} />}
    </div>
  )
}
