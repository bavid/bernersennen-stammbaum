import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useTheme } from '../themes/ThemeProvider.jsx'
import { startRoute, HOME_LABEL } from '../lib/areas.js'
import Icon from './Icon.jsx'
import Modal from './Modal.jsx'
import JoinFamilyDialog from './JoinFamilyDialog.jsx'
import { useToast } from './Toast.jsx'

// Bereichswechsler im Kopfbereich: nur für Haushalte (family.home.art === 'zuhause'). Zeigt den Namen
// des aktiven Bereichs, öffnet ein Menü mit "Meine Chronik", den beigetretenen Familien/Rudeln und
// dem Einstieg zum Beitreten/Gründen. family ist das volle "me"-Objekt, onChange bekommt das neue.
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
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const items = [...rootRef.current.querySelectorAll('[role="menuitem"]')]
    const index = items.indexOf(document.activeElement)
    const step = event.key === 'ArrowDown' ? 1 : -1
    items[(index + step + items.length) % items.length]?.focus()
  }

  async function switchTo(id, name) {
    if (id === family.id) {
      setOpen(false)
      return
    }
    setOpen(false)
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
        <span className="context-switcher-name">{family.name}</span>
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
            <span>{HOME_LABEL}</span>
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
                {isCurrent && <Icon name="check" />}
              </button>
            )
          })}
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
