import '../../styles/bilderrahmen.css'
import PawMark from '../PawMark.jsx'

// Ruhige Meldung im dunklen Rahmen statt einer Diashow: noch keine Fotos, Rahmen beendet, nicht verbunden, ruht.
// title als Überschrift (h1 - die Seite hat sonst keine), children darunter (Text, Knopf).
export default function FrameMessage({ title, children, tone = 'calm' }) {
  return (
    <div className={`frame-root frame-message is-${tone}`}>
      <div className="frame-message-card" role={tone === 'ended' ? 'alert' : 'status'}>
        <span className="frame-message-mark" aria-hidden="true">
          <PawMark size={40} />
        </span>
        <h1>{title}</h1>
        {children}
      </div>
    </div>
  )
}
