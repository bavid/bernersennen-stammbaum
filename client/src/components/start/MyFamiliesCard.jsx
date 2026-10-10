import { Link } from 'react-router-dom'
import { useTheme } from '../../themes/ThemeProvider.jsx'
import Icon from '../Icon.jsx'
import { FAMILIES_ROUTE, groupRoute } from '../../lib/areas.js'
import { roleLabel } from '../../lib/roles.js'
import { animalCountText } from '../../lib/animalCounts.js'
import { t } from '../../lib/i18n/index.js'

// "Meine Familien" am Rand von Start (Phase W): die Familien des Haushalts (me.memberships) mit der eigenen Rolle und
// derselben Zählung wie überall ("21 Tiere · davon 4 von euch", lib/animalCounts.js), je ein Link zur Gruppenseite. Ohne
// Familie ein leiser Weg zu "Familien" (beitreten oder gründen).
export default function MyFamiliesCard({ memberships = [] }) {
  const { words } = useTheme()
  return (
    <section className="card start-card start-families" aria-labelledby="start-families-title">
      <h2 id="start-families-title" className="start-card-title">
        {t('Meine {groups}', { groups: words.groups })}
      </h2>
      {memberships.length === 0 ? (
        <p className="muted">
          {words.noGroupConnected} <Link to={FAMILIES_ROUTE}>{t('{group} beitreten oder gründen', { group: words.group })}</Link>
        </p>
      ) : (
        <ul className="start-families-list" role="list">
          {memberships.map((membership) => (
            <li key={membership.id}>
              <Link to={groupRoute(membership.id)} className="start-family-link">
                <span className="start-family-name">{membership.name}</span>
                {roleLabel(words, membership.rolle) && <span className="start-family-role">{roleLabel(words, membership.rolle)}</span>}
                {animalCountText(membership, words) && <span className="start-family-count">{animalCountText(membership, words)}</span>}
                <Icon name="chevronRight" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
