import { cx, pick } from './classNames.js'

// Box-System: Knopf über den vorhandenen .btn-Klassen (styles/components.css - dort bleibt der Stil).
// Mit href wird ein Link daraus, mit as eine eigene Komponente (z. B. Link aus react-router-dom).
export const BUTTON_VARIANTS = ['primary', 'ghost', 'ink', 'danger']
export const BUTTON_SIZES = ['sm', 'md', 'lg']
const SIZE_CLASS = { sm: 'btn-compact', md: '', lg: 'btn-lg' }

export default function Button({ variant = 'primary', size = 'md', block = false, as, href, type, className, children, ...rest }) {
  const classes = cx(
    'btn',
    `btn-${pick(variant, BUTTON_VARIANTS, 'primary')}`,
    SIZE_CLASS[pick(size, BUTTON_SIZES, 'md')],
    block && 'btn-block',
    className
  )
  if (as) {
    const Component = as
    return (
      <Component className={classes} href={href} {...rest}>
        {children}
      </Component>
    )
  }
  if (href) {
    return (
      <a className={classes} href={href} {...rest}>
        {children}
      </a>
    )
  }
  return (
    <button type={type || 'button'} className={classes} {...rest}>
      {children}
    </button>
  )
}
