import { useId } from 'react'
import Icon from '../Icon.jsx'
import useMenu from '../../hooks/useMenu.js'
import { t } from '../../lib/i18n/index.js'

// "Weitere Aktionen" (⋯) im Kopf der Tierseite (Phase W, Schritt 2): seltene Wege, die sonst Platz im Kopf kosteten.
// items: [{ key, label, icon, onSelect }]. Tastatur nach dem Muster "Menu Button" (hooks/useMenu.js): Pfeile, Pos1/Ende,
// Escape schließt und gibt den Fokus an den Knopf zurück. Ein Eintrag schließt das Menü - der Fokus geht an den Knopf,
// es sei denn, onSelect setzt ihn selbst woandershin (z. B. auf den Reiter "Infos").
// Nur ein Eintrag (Tierheim, zu Besuch: „Link kopieren“): kein Menü, gleich der Knopf selbst.
export default function DogMoreMenu({ name, items }) {
  const { open, toggle, close, rootRef, triggerRef, firstItemRef, onMenuKeyDown, onTriggerKeyDown } = useMenu()
  const menuId = useId()
  if (items.length === 0) return null
  if (items.length === 1) {
    const [item] = items
    return (
      <button type="button" className="btn btn-ghost dog-more-single" onClick={item.onSelect}>
        <Icon name={item.icon} />
        {t(item.label)}
      </button>
    )
  }

  function select(item) {
    close()
    item.onSelect()
  }

  return (
    <div className="dog-more" ref={rootRef}>
      <button
        type="button"
        ref={triggerRef}
        className="btn btn-ghost dog-more-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={t('Weitere Aktionen für {name}', { name })}
        title={t('Weitere Aktionen')}
        onClick={toggle}
        onKeyDown={onTriggerKeyDown}
      >
        <Icon name="more" />
      </button>
      {open && (
        <div id={menuId} className="account-menu-panel dog-more-panel" role="menu" aria-label={t('Weitere Aktionen für {name}', { name })} onKeyDown={onMenuKeyDown}>
          {items.map((item, index) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              ref={index === 0 ? firstItemRef : undefined}
              className="account-menu-item"
              onClick={() => select(item)}
            >
              <Icon name={item.icon} />
              <span>{t(item.label)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
