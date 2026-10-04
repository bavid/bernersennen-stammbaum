import { useId } from 'react'
import { Link, useLocation } from 'react-router-dom'
import Icon from './Icon.jsx'
import useMenu from '../hooks/useMenu.js'
import { LEGAL_LINKS, accountInitial, accountMenuItems, accountName } from '../lib/accountMenu.js'

// "Hilfe & Kontakt" nimmt mit, von welcher Seite man kommt (ContactAdminPage: "Problem auf dieser Seite").
export function itemState(item, pathname) {
  return item.key === 'hilfe' ? { from: pathname } : undefined
}

// Runder Platzhalter mit dem Anfangsbuchstaben des Zuhauses und daneben der Name - Knopf des Menüs am Desktop.
export function AccountBadge({ name }) {
  return (
    <span className="account-avatar" aria-hidden="true">
      {accountInitial(name)}
    </span>
  )
}

function MenuEntry({ item, itemRef, pathname, onSelect }) {
  // Abmelden steht abgesetzt am Ende (structure.css .is-separated).
  const className = item.action === 'logout' ? 'account-menu-item is-separated' : 'account-menu-item'
  const content = (
    <>
      <Icon name={item.icon} />
      <span>{item.label}</span>
    </>
  )
  if (item.to) {
    return (
      <Link role="menuitem" ref={itemRef} to={item.to} state={itemState(item, pathname)} className={className} onClick={onSelect}>
        {content}
      </Link>
    )
  }
  return (
    <button type="button" role="menuitem" ref={itemRef} className={className} onClick={onSelect}>
      {content}
    </button>
  )
}

// Konto-Menü oben rechts (Phase W, Ruhige Hülle - ersetzt Bereichswechsler, "Schreib dem Admin", Zahnrad und Abmelden im
// Kopf): Name des Zuhauses mit Anfangsbuchstaben, darunter Einstellungen, Einladen, Fotocollage, Hilfe & Kontakt,
// Abmelden und klein Impressum · Datenschutz (lib/accountMenu.js). Tastatur nach dem Muster "Menu Button"
// (hooks/useMenu.js). Am Handy steht dasselbe als Blatt hinter "Menü" in der unteren Leiste (AccountSheet).
export default function AccountMenu({ family, onInvite, onLogout }) {
  const { open, setOpen, toggle, rootRef, triggerRef, firstItemRef, onMenuKeyDown, onTriggerKeyDown } = useMenu()
  const { pathname } = useLocation()
  const menuId = useId()
  const name = accountName(family)
  const items = accountMenuItems(family)

  function select(item) {
    setOpen(false)
    if (item.action === 'invite') onInvite()
    if (item.action === 'logout') onLogout()
  }

  return (
    <div className="account-menu" ref={rootRef}>
      <button
        type="button"
        ref={triggerRef}
        className="account-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={toggle}
        onKeyDown={onTriggerKeyDown}
      >
        <AccountBadge name={name} />
        <span className="account-menu-name">
          <span className="visually-hidden">Menü: </span>
          {name}
        </span>
        <Icon name="chevronDown" />
      </button>
      {open && (
        <div id={menuId} className="account-menu-panel" role="menu" aria-label={`Menü – ${name}`} onKeyDown={onMenuKeyDown}>
          {items.map((item, index) => (
            <MenuEntry
              key={item.key}
              item={item}
              itemRef={index === 0 ? firstItemRef : undefined}
              pathname={pathname}
              onSelect={() => select(item)}
            />
          ))}
          <div role="group" aria-label="Rechtliches" className="account-menu-legal">
            {LEGAL_LINKS.map((link) => (
              <Link key={link.key} role="menuitem" to={link.to} className="account-menu-legal-link" onClick={() => setOpen(false)}>
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
