import Icon from '../Icon.jsx'
import { getLang, t } from '../../lib/i18n/index.js'

// „Weiter“ heißt hier „weiter abspielen“ - auf Englisch nicht „Next“ (so steht „Weiter“ im übrigen Wörterbuch).
const resumeLabel = () => (getLang() === 'en' ? 'Resume' : 'Weiter')

function ControlButton({ icon, label, onClick, disabled = false, className = '' }) {
  return (
    <button
      type="button"
      className={`frame-control ${className}`.trim()}
      onClick={onClick}
      aria-label={t(label)}
      title={t(label)}
      disabled={disabled}
    >
      <Icon name={icon} />
    </button>
  )
}

// Steuerung unten in der Mitte: Zurück, Pause/Weiter, Vor - daneben Vollbild, Einstellungen und Beenden. Unsichtbar heißt
// hier nur durchsichtig: per Tab bleibt alles erreichbar, und der Fokus holt die Leiste zurück (Bilderrahmen.jsx). Eine
// Gruppe, keine "toolbar": die Pfeiltasten blättern in der Diashow, nicht zwischen den Knöpfen.
export default function FrameControls({ visible, paused, fullscreen, canStep, onPrev, onTogglePause, onNext, onFullscreen, onSettings, onExit }) {
  return (
    <div className={`frame-controls${visible ? ' is-visible' : ''}`} role="group" aria-label={t('Bilderrahmen steuern')}>
      <div className="frame-controls-group">
        <ControlButton icon="chevronLeft" label="Zurück" onClick={onPrev} disabled={!canStep} />
        <ControlButton
          icon={paused ? 'play' : 'pause'}
          label={paused ? resumeLabel() : 'Pause'}
          onClick={onTogglePause}
          className="frame-control-main"
        />
        <ControlButton icon="chevronRight" label="Vor" onClick={onNext} disabled={!canStep} />
      </div>
      <div className="frame-controls-group">
        {fullscreen.supported && (
          <ControlButton
            icon={fullscreen.active ? 'shrink' : 'expand'}
            label={fullscreen.active ? 'Vollbild beenden' : 'Vollbild'}
            onClick={fullscreen.toggle}
          />
        )}
        <ControlButton icon="settings" label="Einstellungen" onClick={onSettings} />
        {onExit && <ControlButton icon="close" label="Beenden" onClick={onExit} />}
      </div>
    </div>
  )
}
