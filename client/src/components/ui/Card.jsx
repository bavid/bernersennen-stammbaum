import { cx, pick } from './classNames.js'

// Box-System: die eine Karte für alles, was eine Fläche braucht. flat = Rand ohne Schatten (Listen in Karten),
// raised = Album-Karte (Vorgabe), tinted = leicht getönt (Hinweise, Hervorhebung), interactive = hebt sich beim
// Zeigen und zeigt den Fokus, wenn ein Link oder Knopf darin den Fokus hat. Stil: styles/ui.css.
export const CARD_VARIANTS = ['flat', 'raised', 'tinted', 'interactive']
export const CARD_PADS = ['sm', 'md', 'lg']
export const CARD_TAGS = ['section', 'div', 'article', 'li']

export default function Card({ variant = 'raised', pad = 'md', as = 'div', className, children, ...rest }) {
  const Tag = pick(as, CARD_TAGS, 'div')
  const classes = cx(
    'ui-card',
    `ui-card--${pick(variant, CARD_VARIANTS, 'raised')}`,
    `ui-card--pad-${pick(pad, CARD_PADS, 'md')}`,
    className
  )
  return (
    <Tag className={classes} {...rest}>
      {children}
    </Tag>
  )
}
