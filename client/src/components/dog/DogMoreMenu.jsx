import { useId } from 'react'
import Icon from '../Icon.jsx'
import useMenu from '../../hooks/useMenu.js'

// "Weitere Aktionen" (⋯) im Kopf der Tierseite (Phase W, Schritt 2): seltene Wege, die sonst Platz im Kopf kosteten.
// items: [{ key, label, icon, onSelect }]. Tastatur nach dem Muster "Menu Button" (hooks/useMenu.js): Pfeile, Pos1/Ende,
// Escape schließt und gibt den Fokus an den Knopf zurück. Ein Eintrag schließt das Menü - der Fokus geht an den Knopf,
// es sei denn, onSelect setzt ihn selbst woandershin (z. B. auf den Reiter "Infos").
export default function DogMoreMenu({ name, items }) {
  const { open, toggle, close, rootRef, triggerRef, firstItemRef, onMenuKeyDown, onTriggerKeyDown } = useMenu()
  const menuId = useId()
  if (items.length === 0) return null

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
        aria-label={`Weitere Aktionen für ${name}`}
        title="Weitere Aktionen"
        onClick={toggle}
        onKeyDown={onTriggerKeyDown}
      >
        <Icon name="more" />
      </button>
      {open && (
        <div id={menuId} className="account-menu-panel dog-more-panel" role="menu" aria-label={`Weitere Aktionen für ${name}`} onKeyDown={onMenuKeyDown}>
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
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
