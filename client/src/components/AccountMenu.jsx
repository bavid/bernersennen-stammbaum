import { useId } from 'react'
import { Link, useLocation } from 'react-router-dom'
import Icon from './Icon.jsx'
import useMenu from '../hooks/useMenu.js'
import AreaAvatar from './AreaAvatar.jsx'
import { LEGAL_LINKS, accountBild, accountMenuItems, accountName } from '../lib/accountMenu.js'
import { personName } from '../lib/profil.js'
import { t } from '../lib/i18n/index.js'

// "Hilfe & Kontakt" nimmt mit, von welcher Seite man kommt (ContactAdminPage: "Problem auf dieser Seite").
export function itemState(item, pathname) {
  return item.key === 'hilfe' ? { from: pathname } : undefined
}

// Rundes Bild des Zuhauses (Profil) bzw. sein Anfangsbuchstabe - Knopf des Menüs am Desktop und Kopf des Blatts am Handy.
export function AccountBadge({ name, bild = null }) {
  return <AreaAvatar name={name} bild={bild} className="account-avatar" />
}

// „Zuhause am Deich · Anke“: der Name der angemeldeten Person (Profil) leise hinter dem Zuhause.
export function AccountWho({ family }) {
  const person = personName(family)
  return (
    <>
      {accountName(family)}
      {person && <span className="account-person"> · {person}</span>}
    </>
  )
}

function MenuEntry({ item, itemRef, pathname, onSelect }) {
  // Abmelden steht abgesetzt am Ende (structure.css .is-separated).
  const className = item.action === 'logout' ? 'account-menu-item is-separated' : 'account-menu-item'
  const content = (
    <>
      <Icon name={item.icon} />
      <span>{t(item.label)}</span>
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
  const { open, setOpen, toggle, close, rootRef, triggerRef, firstItemRef, onMenuKeyDown, onTriggerKeyDown } = useMenu()
  const { pathname } = useLocation()
  const menuId = useId()
  const name = accountName(family)
  const items = accountMenuItems(family)

  // Knöpfe schließen über close(): der Fokus geht zurück an den Knopf des Menüs (der Einladen-Dialog gibt ihn beim
  // Schließen dorthin zurück), statt mit dem verschwundenen Eintrag auf <body> zu fallen. Links navigieren ohnehin weiter.
  function select(item) {
    if (!item.action) {
      setOpen(false)
      return
    }
    close()
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
        <AccountBadge name={name} bild={accountBild(family)} />
        <span className="account-menu-name">
          <span className="visually-hidden">{t('Menü')}: </span>
          <AccountWho family={family} />
        </span>
        <Icon name="chevronDown" />
      </button>
      {open && (
        <div id={menuId} className="account-menu-panel" role="menu" aria-label={`${t('Menü')} – ${name}`} onKeyDown={onMenuKeyDown}>
          {items.map((item, index) => (
            <MenuEntry
              key={item.key}
              item={item}
              itemRef={index === 0 ? firstItemRef : undefined}
              pathname={pathname}
              onSelect={() => select(item)}
            />
          ))}
          <div role="group" aria-label={t('Rechtliches')} className="account-menu-legal">
            {LEGAL_LINKS.map((link) => (
              <Link key={link.key} role="menuitem" to={link.to} className="account-menu-legal-link" onClick={() => setOpen(false)}>
                {t(link.label)}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
