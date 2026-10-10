import { useEffect, useState } from 'react'
import { api } from '../../api'
import { Button, EmptyState } from '../ui/index.js'
import RevierEintrag from './RevierEintrag.jsx'
import { useT } from '../../lib/i18n/index.js'

// „Aus deinem Revier“: die neuesten öffentlichen Erinnerungen der Profile, denen ihr folgt - seitenweise („Mehr zeigen“).
export default function RevierFeed() {
  const t = useT()
  const [eintraege, setEintraege] = useState(null)
  const [weiter, setWeiter] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function load(vor = null) {
    setBusy(true)
    try {
      const data = await api.revier.feed(vor)
      setEintraege((current) => (vor ? [...(current || []), ...data.eintraege] : data.eintraege))
      setWeiter(data.weiter)
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  if (error) {
    return (
      <div className="error-banner" role="alert">
        {error}
      </div>
    )
  }
  if (!eintraege) return <p className="muted">{t('Lädt …')}</p>
  if (eintraege.length === 0) {
    return (
      <EmptyState icon="heart" title={t('Noch nichts aus eurem Revier.')}>
        {t('Folgt Profilen in der Nähe – ihre neuen Erinnerungen erscheinen dann hier.')}
      </EmptyState>
    )
  }
  return (
    <section className="revier-feed">
      <ul className="revier-eintraege" role="list" aria-live="polite">
        {eintraege.map((eintrag) => (
          <RevierEintrag key={eintrag.id} eintrag={eintrag} />
        ))}
      </ul>
      {weiter && (
        <Button variant="ghost" aria-busy={busy || undefined} onClick={() => !busy && load(weiter)}>
          {t('Mehr zeigen')}
        </Button>
      )}
    </section>
  )
}
