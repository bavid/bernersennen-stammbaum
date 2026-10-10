import Icon from '../Icon.jsx'
import { cx, pick } from './classNames.js'

// Box-System: kleiner Stand-Anzeiger. Der Ton trägt die Bedeutung nie allein - der Text sagt sie immer mit
// (WCAG 1.4.1). Töne: ok, wartet, gesperrt, neu, anzeige; ohne Ton neutral. Farben: palettes.css --tone-*.
export const CHIP_TONES = ['neutral', 'ok', 'wartet', 'gesperrt', 'neu', 'anzeige']

export default function Chip({ tone = 'neutral', icon, className, children, ...rest }) {
  const safeTone = pick(tone, CHIP_TONES, 'neutral')
  return (
    <span className={cx('ui-chip', safeTone !== 'neutral' && `ui-chip--${safeTone}`, className)} {...rest}>
      {icon && <Icon name={icon} aria-hidden="true" />}
      {children}
    </span>
  )
}
