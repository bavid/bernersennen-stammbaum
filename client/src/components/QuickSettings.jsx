import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from './Icon.jsx'
import LanguageFlag from './LanguageFlag.jsx'
import LanguageSwitch from './LanguageSwitch.jsx'
import { useIsDemo } from '../lib/demo.js'
import { MODI, SCHRIFTEN, normalizeDarstellung } from '../lib/darstellung.js'
import useDarstellungSave from '../hooks/useDarstellungSave.js'
import { t, useLang } from '../lib/i18n/index.js'
import '../styles/quick-settings.css'

const SETTINGS_DARSTELLUNG = '/einstellungen?bereich=darstellung'

// Eine Reihe Knöpfe (Deutsch | English, Papier | Weiß | …) - wirkt sofort beim Klick, wie die Sprachwahl.
function Segments({ label, options, value, onChange }) {
  const labelId = useId()
  return (
    <div className="quick-settings-row">
      <span className="quick-settings-label" id={labelId}>
        {label}
      </span>
      <div className="segmented" role="group" aria-labelledby={labelId}>
        {options.map((option) => (
          <button key={option.id} type="button" aria-pressed={value === option.id} onClick={() => onChange(option.id)}>
            {t(option.label)}
          </button>
        ))}
      </div>
    </div>
  )
}

// Darstellung braucht eine Sitzung (gespeichert wird fürs eigene Zuhause) - ohne family nur die Sprache.
function DarstellungRows({ family, onFamilyChange }) {
  const readOnly = useIsDemo()
  const { change } = useDarstellungSave({ family, onFamilyChange, readOnly })
  const current = normalizeDarstellung(family.darstellung)
  return (
    <>
      <Segments label={t('Hintergrund')} options={MODI} value={current.modus} onChange={(modus) => change({ modus })} />
      <Segments label={t('Schriftgröße')} options={SCHRIFTEN} value={current.schrift} onChange={(schrift) => change({ schrift })} />
    </>
  )
}

// Schnell-Einstellungen im Kopf der App (neben Suche und Glocke), der Knopf zeigt nur die Flagge der Sprache: Sprache, Hintergrund und Schriftgröße direkt auf jeder
// Seite - ohne Umweg über Einstellungen. Jede Wahl wirkt beim Klick (Sprache: lib/i18n, Darstellung: useDarstellungSave).
// Ein schlichtes Ausklapp-Feld (kein Menü): Escape und ein Klick daneben schließen, der Fokus geht an den Knopf zurück.
export default function QuickSettings({ family, onFamilyChange }) {
  const lang = useLang()
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const panelId = useId()

  useEffect(() => {
    if (!open) return undefined
    function onPointerDown(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false)
    }
    function onKeyDown(event) {
      if (event.key !== 'Escape') return
      setOpen(false)
      triggerRef.current?.focus()
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const title = t('Sprache & Ansicht')
  return (
    <div className="quick-settings" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="quick-settings-trigger"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={title}
        title={title}
        onClick={() => setOpen((value) => !value)}
      >
        <LanguageFlag lang={lang} />
      </button>
      {open && (
        <div id={panelId} className="quick-settings-panel" role="group" aria-label={title}>
          <div className="quick-settings-row">
            <span className="quick-settings-label">Sprache · Language</span>
            <LanguageSwitch />
          </div>
          {family?.darstellung !== undefined && onFamilyChange && <DarstellungRows family={family} onFamilyChange={onFamilyChange} />}
          {family && (
            <Link to={SETTINGS_DARSTELLUNG} className="quick-settings-more" onClick={() => setOpen(false)}>
              {t('Alle Einstellungen')}
              <Icon name="chevronRight" />
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
