import Icon from '../Icon.jsx'

// Kopf eines Abschnitts der Familienbande (Phase V3): Symbol je Art, Überschrift, eine leise Zeile darunter und
// rechts optional ein Knopf (Familie öffnen, …).
const ICONS = { zuhause: 'home', familie: 'users', bereich: 'home', freunde: 'heart' }

export default function FamilyGroupHead({ id, kind, title, meta, children }) {
  return (
    <div className="family-group-head">
      <span className={`family-group-icon is-${kind}`} aria-hidden="true">
        <Icon name={ICONS[kind] || 'home'} />
      </span>
      <div className="family-group-title">
        <h2 id={id}>{title}</h2>
        {meta && <p className="family-group-meta">{meta}</p>}
      </div>
      {children && <div className="family-group-actions">{children}</div>}
    </div>
  )
}
