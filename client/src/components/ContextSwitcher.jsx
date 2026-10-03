import { useEffect, useId, useRef, useState } from 'react'
import { useTheme } from '../themes/ThemeProvider.jsx'
import { HOME_LABEL } from '../lib/areas.js'
import { roleLabel } from '../lib/roles.js'
import { visitLabel } from '../lib/visits.js'
import useOpenArea from '../hooks/useOpenArea.js'
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
export default function ContextSwitcher({ family, onChange }) {
  const { words } = useTheme()
  const openArea = useOpenArea(onChange)
  const [open, setOpen] = useState(false)
  const [joinOpen, setJoinOpen] = useState(false)
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const firstItemRef = useRef(null)
  const headingId = useId()

  useEffect(() => {
    if (!open) return undefined
    function handlePointerDown(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [open])

  useEffect(() => {
    if (open) firstItemRef.current?.focus()
  }, [open])

  function closeMenu() {
    setOpen(false)
    triggerRef.current?.focus()
  }

  function handleMenuKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeMenu()
      return
    }
    // Tab soll den Fokus wie gewohnt weiterreichen (zum nächsten bzw. vorherigen fokussierbaren
    // Element) – das Menü schließt dabei nur, statt offen und ohne sichtbaren Fokus stehen zu bleiben.
    if (event.key === 'Tab') {
      setOpen(false)
      return
    }
    const items = [...rootRef.current.querySelectorAll('[role="menuitem"]')]
    if (event.key === 'Home') {
      event.preventDefault()
      items[0]?.focus()
      return
    }
    if (event.key === 'End') {
      event.preventDefault()
      items[items.length - 1]?.focus()
      return
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const index = items.indexOf(document.activeElement)
    const step = event.key === 'ArrowDown' ? 1 : -1
    items[(index + step + items.length) % items.length]?.focus()
  }

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
        onClick={() => setOpen((value) => !value)}
      >
        {/* Der eigene Bereich heißt hier immer "Meine Chronik" – der gespeicherte Name des Haushalts
            ist nur relevant, wo andere Familien ihn sehen (z. B. "aus <Name>" bei geteilten Tieren). */}
        <span className="context-switcher-name">
          {isHomeActive ? HOME_LABEL : family.zuBesuch ? visitLabel(family.name) : family.name}
        </span>
        <Icon name="chevronDown" />
      </button>
      {open && (
        <div className="context-switcher-menu" role="menu" aria-label="Bereich wechseln" onKeyDown={handleMenuKeyDown}>
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
