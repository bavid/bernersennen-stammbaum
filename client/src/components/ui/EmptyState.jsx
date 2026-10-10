import Icon from '../Icon.jsx'
import { cx } from './classNames.js'

// Box-System: ruhiger Hinweis, wenn noch nichts da ist - ein Bild-Zeichen, ein Satz, höchstens eine Aktion.
// role="status" nur auf Wunsch (live), wenn der Zustand nach einer Aktion erscheint. Stil: styles/ui.css.
export default function EmptyState({ icon = 'paw', title, children, action, live = false, className }) {
  return (
    <div className={cx('ui-empty', className)} role={live ? 'status' : undefined}>
      {icon && (
        <span className="ui-empty-icon" aria-hidden="true">
          <Icon name={icon} />
        </span>
      )}
      {title && <p className="ui-empty-title">{title}</p>}
      {children && <p className="ui-empty-text">{children}</p>}
      {action && <div className="ui-empty-action">{action}</div>}
    </div>
  )
}
