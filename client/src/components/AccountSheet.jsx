import { Link, useLocation } from 'react-router-dom'
import Icon from './Icon.jsx'
import Modal from './Modal.jsx'
import { AccountBadge, AccountWho, itemState } from './AccountMenu.jsx'
import { LEGAL_LINKS, accountBild, accountMenuItems, accountName } from '../lib/accountMenu.js'
import { t } from '../lib/i18n/index.js'

// "Menü" als fünfter Platz der unteren Leiste am Handy (Phase W) - der Knopf steht in der Navigation, das Blatt
// (AccountSheet) daneben im Kopf, damit der Dialog nicht in der Navigation liegt. Am Desktop blendet layout.css den Knopf
// aus.
export function MenuSlotButton({ open, onOpen }) {
  return (
    <button type="button" className="app-nav-menu" aria-haspopup="dialog" aria-expanded={open} onClick={onOpen}>
      <Icon name="menu" />
      <span>{t('Menü')}</span>
    </button>
  )
}

// Dieselben Einträge wie das Konto-Menü am Desktop (AccountMenu, lib/accountMenu.js) als Blatt von unten - im gemeinsamen
// Dialog (Modal: Fokusfalle und Escape vom Browser).
export default function AccountSheet({ family, open, onClose, onInvite, onLogout }) {
  const { pathname } = useLocation()
  const name = accountName(family)
  const items = accountMenuItems(family)

  function select(item) {
    onClose()
    if (item.action === 'invite') onInvite()
    if (item.action === 'logout') onLogout()
  }

  return (
    <Modal open={open} title={t('Menü')} onClose={onClose} className="modal-sheet">
      <p className="account-sheet-who">
        <AccountBadge name={name} bild={accountBild(family)} />
        <span>
          <AccountWho family={family} />
        </span>
      </p>
      <ul className="account-sheet-list" role="list">
        {items.map((item) => (
          <li key={item.key}>
            {item.to ? (
              <Link to={item.to} state={itemState(item, pathname)} className="account-sheet-item" onClick={onClose}>
                <Icon name={item.icon} />
                <span>{t(item.label)}</span>
              </Link>
            ) : (
              <button type="button" className="account-sheet-item" onClick={() => select(item)}>
                <Icon name={item.icon} />
                <span>{t(item.label)}</span>
              </button>
            )}
          </li>
        ))}
      </ul>
      <p className="account-sheet-legal">
        {LEGAL_LINKS.map((link) => (
          <Link key={link.key} to={link.to} onClick={onClose}>
            {t(link.label)}
          </Link>
        ))}
      </p>
    </Modal>
  )
}
