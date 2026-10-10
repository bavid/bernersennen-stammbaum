import { accountInitial } from '../lib/accountMenu.js'
import { cx } from './ui/classNames.js'

// Rundes Bild eines Zuhauses bzw. einer Familie (server/lib/profil.js, /me: bild) - ohne Bild der Anfangsbuchstabe des
// Namens (per CSS aus data-initial - so bleibt der Text daneben sauber). Rein schmückend (aria-hidden): der Name steht
// immer daneben. size: 'sm' (Listen), 'md' (Menü), 'lg' (Kopf).
// Stil: styles/avatar.css.
export default function AreaAvatar({ name, bild, size = 'md', className }) {
  return (
    <span
      className={cx('area-avatar', `area-avatar--${size}`, bild && 'has-bild', className)}
      data-initial={bild ? undefined : accountInitial(name)}
      aria-hidden="true"
    >
      {bild && <img src={bild} alt="" loading="lazy" decoding="async" />}
    </span>
  )
}
