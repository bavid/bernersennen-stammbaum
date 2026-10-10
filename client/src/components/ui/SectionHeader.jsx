import { cx } from './classNames.js'

// Box-System: Kopf eines Abschnitts - Titel (h2 bis h4), optional eine Zeile Erklärung und rechts eine Aktion
// (z. B. ein Button). Mit id lässt sich der Abschnitt per aria-labelledby benennen. Stil: styles/ui.css.
const LEVELS = [2, 3, 4]

export default function SectionHeader({ title, id, level = 2, description, action, className }) {
  const Heading = `h${LEVELS.includes(level) ? level : 2}`
  return (
    <header className={cx('ui-section-header', className)}>
      <div className="ui-section-header-text">
        <Heading id={id} className="ui-section-header-title">
          {title}
        </Heading>
        {description && <p className="ui-section-header-desc">{description}</p>}
      </div>
      {action && <div className="ui-section-header-action">{action}</div>}
    </header>
  )
}
