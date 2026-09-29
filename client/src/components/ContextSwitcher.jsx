import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useTheme } from '../themes/ThemeProvider.jsx'
import { startRoute, HOME_LABEL } from '../lib/areas.js'
import Icon from './Icon.jsx'
import Modal from './Modal.jsx'
import RoleBadge from './RoleBadge.jsx'
import JoinFamilyDialog from './JoinFamilyDialog.jsx'
import { useToast } from './Toast.jsx'

// Bereichswechsler im Kopfbereich: nur für Haushalte (family.home.art === 'zuhause'). Zeigt den Namen
// des aktiven Bereichs, öffnet ein Menü mit "Meine Chronik", den beigetretenen Familien/Rudeln (mit der
// eigenen Rolle dort, Phase R) und dem Einstieg zum Beitreten/Gründen; in einer Familie zusätzlich den
// Weg zu "Mitglieder & Rollen" (/mitglieder). family ist das volle "me"-Objekt, onChange bekommt das neue.
export default function ContextSwitcher({ family, onChange }) {
  const { words } = useTheme()
  const toast = useToast()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [joinOpen, setJoinOpen] = useState(false)
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const firstItemRef = useRef(null)

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
    if (id === family.id) {
      setOpen(false)
      triggerRef.current?.focus()
      return
    }
    // Das Menü verschwindet aus dem DOM – ohne expliziten Fokus fiele er sonst auf <body> zurück
    // (schlecht für Tastatur/Screenreader). Der Knopf ist nach dem Wechsel weiter derselbe Node.
    setOpen(false)
    triggerRef.current?.focus()
    try {
      const me = await api.view(id)
      onChange(me)
      navigate(startRoute(me))
      toast(`Du bist jetzt in „${name}“`)
    } catch (err) {
      toast(err.message)
    }
  }

  const isHomeActive = family.id === family.home.id
  const isGroupActive = !isHomeActive && family.art === 'rudel'

  function openMembers() {
    closeMenu()
    navigate('/mitglieder')
  }

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
        <span className="context-switcher-name">{isHomeActive ? HOME_LABEL : family.name}</span>
        {isGroupActive && <RoleBadge rolle={family.role} />}
        <Icon name="chevronDown" />
      </button>
      {open && (
        <div className="context-switcher-menu" role="menu" onKeyDown={handleMenuKeyDown}>
          <button
            type="button"
            role="menuitem"
            ref={firstItemRef}
            className="context-switcher-item"
            aria-current={isHomeActive ? 'true' : undefined}
            onClick={() => switchTo(family.home.id, HOME_LABEL)}
          >
            <span>
              {HOME_LABEL}
              {family.home.name && family.home.name !== HOME_LABEL && (
                <span className="context-switcher-item-sub"> · {family.home.name}</span>
              )}
            </span>
            {isHomeActive && <Icon name="check" />}
          </button>
          {family.memberships.length > 0 && <div className="context-switcher-sep" role="separator" />}
          {family.memberships.map((membership) => {
            const isCurrent = membership.id === family.id
            return (
              <button
                key={membership.id}
                type="button"
                role="menuitem"
                className="context-switcher-item"
                aria-current={isCurrent ? 'true' : undefined}
                onClick={() => switchTo(membership.id, membership.name)}
              >
                <span>{membership.name}</span>
                <RoleBadge rolle={membership.rolle} />
                {isCurrent && <Icon name="check" />}
              </button>
            )
          })}
          {isGroupActive && (
            <>
              <div className="context-switcher-sep" role="separator" />
              <button type="button" role="menuitem" className="context-switcher-item" onClick={openMembers}>
                <span>Mitglieder & Rollen</span>
                <Icon name="users" />
              </button>
            </>
          )}
          <div className="context-switcher-sep" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="context-switcher-item"
            onClick={() => {
              setOpen(false)
              setJoinOpen(true)
            }}
          >
            {words.group} beitreten oder gründen …
          </button>
        </div>
      )}
      <Modal
        open={joinOpen}
        title={`${words.group} beitreten oder gründen`}
        onClose={() => setJoinOpen(false)}
      >
        <JoinFamilyDialog onChange={onChange} onClose={() => setJoinOpen(false)} />
      </Modal>
    </div>
  )
}
