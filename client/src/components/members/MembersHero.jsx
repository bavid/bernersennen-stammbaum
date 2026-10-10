import { Link } from 'react-router-dom'
import { useTheme } from '../../themes/ThemeProvider.jsx'
import RoleBadge from '../RoleBadge.jsx'
import { SETTINGS_ROUTE, animalsRoute } from '../../lib/areas.js'
import { t } from '../../lib/i18n/index.js'

// Kopf der Seite "Mitglieder" (/mitglieder beim klassischen Familien-Login): Rolle, kurze Erklärung, Kennzahlen. Auf der
// Gruppenseite (Reiter "Mitglieder", Phase W) steht stattdessen deren eigener Kopf. stats: { mitglieder, geteilt } oder
// null (noch nicht geladen); demoHint: Hinweis der Demo oder null.
export default function MembersHero({ family, myRole, stats, demoHint }) {
  const { words } = useTheme()
  return (
    <header className="page-hero">
      <div>
        <span className="eyebrow">{words.group}</span>
        <div className="page-title-row">
          <h1>{t('Mitglieder')}</h1>
          <RoleBadge rolle={myRole} className="members-my-role" />
        </div>
        {/* Audit V7a: "Eine Familie ist nie öffentlich." steht gleich darunter in "Wer sieht was?" - hier nicht doppelt. */}
        <p className="page-lede">{t('Wer zu „{name}“ gehört – und wer was darf.', { name: family.name })}</p>
        <p className="hero-hint members-hero-links">
          <Link to={animalsRoute(family)}>{t('← Zu den {animals}', { animals: words.animals })}</Link>
          {/* Phase W, Schritt 2: Name, Leitung, Schlüssel und Auflösen stehen in den Einstellungen. */}
          <Link to={`${SETTINGS_ROUTE}?bereich=familien`}>{words.groupSettings}</Link>
        </p>
        {/* Phase U: der Demo-Hinweis gehört zum Kopf - nicht als eigene Zeile zwischen Kopf und erster Karte. */}
        {demoHint && <p className="field-hint members-demo-hint">{demoHint}</p>}
      </div>
      {stats && (
        <div className="page-hero-side">
          <dl className="stats">
            <div>
              <dt>{stats.mitglieder === 1 ? t('Mitglied') : t('Mitglieder')}</dt>
              <dd>{stats.mitglieder}</dd>
            </div>
            <div>
              <dt>{t('geteilte Tiere')}</dt>
              <dd>{stats.geteilt}</dd>
            </div>
          </dl>
        </div>
      )}
    </header>
  )
}
