import { useId, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useTheme } from '../themes/ThemeProvider.jsx'
import { HOME_LABEL, startRoute } from '../lib/areas.js'
import { roleLabel } from '../lib/roles.js'
import { visitLabel } from '../lib/visits.js'
import { useToast } from './Toast.jsx'
import useMenu from '../hooks/useMenu.js'
import Icon from './Icon.jsx'
import Modal from './Modal.jsx'
import JoinFamilyDialog from './JoinFamilyDialog.jsx'

// Ein Eintrag im Menü: Name, darunter optional eine leise zweite Zeile (Name des Haushalts, Rolle in der Familie);
// der aktive Bereich trägt einen Haken und aria-current.
function SwitcherItem({ name, sub, current, onSelect, itemRef }) {
  return (
    <button
      type="button"
      role="menuitem"
      ref={itemRef}
      className="context-switcher-item"
      aria-current={current ? 'true' : undefined}
      onClick={onSelect}
    >
      <span className="context-switcher-item-text">
        <span className="context-switcher-item-name">{name}</span>
        {sub && <span className="context-switcher-item-sub">{sub}</span>}
      </span>
      {current && <Icon name="check" />}
    </button>
  )
}

// Gruppe mit kleiner Überschrift - die Überschrift benennt die Gruppe für Screenreader (aria-labelledby) und wird
// selbst nicht noch einmal vorgelesen.
function SwitcherGroup({ id, title, children }) {
  return (
    <div role="group" aria-labelledby={id} className="context-switcher-group">
      <div id={id} className="context-switcher-heading" aria-hidden="true">
        {title}
      </div>
      {children}
    </div>
  )
}

// Bereichswechsler im Kopfbereich: nur für Haushalte (family.home.art === 'zuhause'). Der Knopf zeigt nur den Namen des
// aktiven Bereichs (Familienbande 2: ohne Rollen-Chip). Das Menü ist gruppiert - "Mein Zuhause" (Meine Chronik),
// die beigetretenen Familien bzw. Rudel mit der eigenen Rolle als zweiter Zeile (Phase R) und (Phase V2) die Zuhause,
// die der Haushalt besucht (family.besuche, nur ansehen); Überschriften nur für Gruppen mit Einträgen. Abgesetzt
// darunter der Einstieg zum Beitreten/Gründen. "Mitglieder & Rollen" steht im Kopf der Familienbande, nicht hier.
// family ist das volle "me"-Objekt, onChange bekommt das neue.
// Phase W: nicht mehr eingebunden (das Konto-Menü und das AreaGate ersetzen ihn), fällt in Schritt 5 weg - bis dahin mit
// seinem bisherigen eigenen Wechsel per api.view.
export default function ContextSwitcher({ family, onChange }) {
  const { words } = useTheme()
  const navigate = useNavigate()
  const toast = useToast()
  async function openArea(id) {
    try {
      const me = await api.view(id)
      onChange(me)
      navigate(startRoute(me))
    } catch (err) {
      toast(err.message)
    }
  }
  const { open, setOpen, toggle, close: closeMenu, rootRef, triggerRef, firstItemRef, onMenuKeyDown } = useMenu()
  const [joinOpen, setJoinOpen] = useState(false)
  const headingId = useId()

  async function switchTo(id, name) {
    // Das Menü verschwindet aus dem DOM – ohne expliziten Fokus fiele er sonst auf <body> zurück
    // (schlecht für Tastatur/Screenreader). Der Knopf ist nach dem Wechsel weiter derselbe Node.
    closeMenu()
    if (id === family.id) return
    await openArea(id, name)
  }

  const isHomeActive = family.id === family.home.id
  const memberships = family.memberships || []
  const visits = family.besuche || []
  const homeName = family.home.name && family.home.name !== HOME_LABEL ? family.home.name : null

  return (
    <div className="context-switcher" ref={rootRef}>
      <button
        type="button"
        ref={triggerRef}
        className="context-switcher-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
      >
        {/* Der eigene Bereich heißt hier immer "Meine Chronik" – der gespeicherte Name des Haushalts
            ist nur relevant, wo andere Familien ihn sehen (z. B. "aus <Name>" bei geteilten Tieren). */}
        <span className="context-switcher-name">
          {isHomeActive ? HOME_LABEL : family.zuBesuch ? visitLabel(family.name) : family.name}
        </span>
        <Icon name="chevronDown" />
      </button>
      {open && (
        <div className="context-switcher-menu" role="menu" aria-label="Bereich wechseln" onKeyDown={onMenuKeyDown}>
          <SwitcherGroup id={`${headingId}-home`} title="Mein Zuhause">
            <SwitcherItem
              itemRef={firstItemRef}
              name={HOME_LABEL}
              sub={homeName}
              current={isHomeActive}
              onSelect={() => switchTo(family.home.id, HOME_LABEL)}
            />
          </SwitcherGroup>
          {memberships.length > 0 && (
            <SwitcherGroup id={`${headingId}-groups`} title={words.groups}>
              {memberships.map((membership) => (
                <SwitcherItem
                  key={membership.id}
                  name={membership.name}
                  sub={roleLabel(words, membership.rolle)}
                  current={membership.id === family.id}
                  onSelect={() => switchTo(membership.id, membership.name)}
                />
              ))}
            </SwitcherGroup>
          )}
          {visits.length > 0 && (
            <SwitcherGroup id={`${headingId}-visits`} title="Zu Besuch">
              {visits.map((visit) => (
                <SwitcherItem
                  key={`besuch-${visit.id}`}
                  name={visit.name}
                  current={visit.id === family.id}
                  onSelect={() => switchTo(visit.id, visit.name)}
                />
              ))}
            </SwitcherGroup>
          )}
          {/* Phase V2: zu Besuch nur wechseln - beitreten/gründen geht aus der eigenen Chronik heraus. */}
          {!family.zuBesuch && (
            <>
              <div className="context-switcher-sep" role="separator" />
              <button
                type="button"
                role="menuitem"
                className="context-switcher-item is-footer"
                onClick={() => {
                  setOpen(false)
                  setJoinOpen(true)
                }}
              >
                {words.group} beitreten oder gründen …
              </button>
            </>
          )}
        </div>
      )}
      <Modal open={joinOpen} title={`${words.group} beitreten oder gründen`} onClose={() => setJoinOpen(false)}>
        <JoinFamilyDialog onChange={onChange} onClose={() => setJoinOpen(false)} />
      </Modal>
    </div>
  )
}
