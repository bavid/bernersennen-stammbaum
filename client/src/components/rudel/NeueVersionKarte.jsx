import { Link } from 'react-router-dom'
import Icon from '../Icon.jsx'
import { Button } from '../ui/index.js'
import { useT } from '../../lib/i18n/index.js'
import { safeHinweisLink } from '../../lib/hinweise.js'
import useNeueVersionUrl from '../../hooks/useNeueVersionUrl.js'

export const EINLADUNG_PFAD = '/admin-schreiben?thema=einladung'

// Rudel-Instanz (lib/instanzModus.js): deutlich sagen, dass es eine neue Version gibt - auf der Anmeldung und auf dem
// Start. Der Link kommt vom Server (GET /api/config neueVersionUrl, server/lib/rudelNeueVersion.js); ohne ihn nichts.
// Angemeldet führt „Einladung anfragen“ ins Feedback-Formular mit vorausgefülltem Text (pages/ContactAdminPage.jsx).
export default function NeueVersionKarte({ angemeldet = false }) {
  const t = useT()
  const url = safeHinweisLink(useNeueVersionUrl())
  if (!url) return null

  return (
    <section className="neue-version" aria-labelledby="neue-version-titel">
      <p className="neue-version-chip">
        <Icon name="megaphone" /> {t('Neu')}
      </p>
      <h2 id="neue-version-titel">{t('Es gibt eine neue Version')}</h2>
      <p>
        {t('Familie auf Pfoten ist neu gebaut – noch in Entwicklung. In etwa einem Monat ziehen wir euch mit allem um, euer Stammbaum bleibt.')}
      </p>
      <div className="neue-version-aktionen">
        <Button href={url} target="_blank" rel="noopener noreferrer">
          {t('Neue Version ansehen')} <Icon name="external" />
        </Button>
        {angemeldet && (
          <Button as={Link} to={EINLADUNG_PFAD} variant="ghost">
            <Icon name="send" /> {t('Einladung anfragen')}
          </Button>
        )}
      </div>
      {!angemeldet && (
        <p className="neue-version-fuss muted">{t('Eine Einladung für ein eigenes Zuhause fragt ihr nach dem Anmelden über „Feedback“ an.')}</p>
      )}
    </section>
  )
}
