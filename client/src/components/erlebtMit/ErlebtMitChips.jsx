import Icon from '../Icon.jsx'
import { tagLabel } from '../../lib/erlebtMit.js'
import { t } from '../../lib/i18n/index.js'

// "erlebt mit Wilma" am eigenen Eintrag (Phase V2) - sofort sichtbar, noch nicht bestätigte als "(angefragt)".
export default function ErlebtMitChips({ tags }) {
  if (!tags?.length) return null
  return (
    <ul className="erlebt-mit-chips" aria-label={t('Mit dabei')}>
      {tags.map((tag) => (
        <li key={tag.id} className={`chip erlebt-mit-chip${tag.status === 'offen' ? ' is-pending' : ''}`} title={tag.zuhause}>
          <Icon name="paw" />
          {tagLabel(tag)}
        </li>
      ))}
    </ul>
  )
}
