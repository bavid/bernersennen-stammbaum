import { useId } from 'react'
import Icon from './Icon.jsx'

// Aufklappbarer Teil eines Formulars (Erinnerung festhalten: „Mehr“, Neues Tier: „Mehr Angaben“) - zu ist nur der Knopf
// zu sehen, mit einer leisen Zusammenfassung, was darin steht. Der Inhalt entsteht erst beim Aufklappen (seine Werte
// liegen im Formular darüber). open/onToggle steuert das Formular, z. B. um bei einem Fehler darin aufzuklappen.
export default function MehrAngaben({ label = 'Mehr', summary, open, onToggle, children }) {
  const regionId = useId()
  return (
    <div className={`mehr-angaben${open ? ' is-open' : ''}`}>
      <button type="button" className="mehr-angaben-knopf" aria-expanded={open} aria-controls={regionId} onClick={() => onToggle(!open)}>
        <Icon name="chevronDown" />
        <span className="mehr-angaben-label">{label}</span>
        {summary && !open && <span className="mehr-angaben-summary">{summary}</span>}
      </button>
      <div id={regionId} className="mehr-angaben-inhalt" hidden={!open}>
        {open && children}
      </div>
    </div>
  )
}
