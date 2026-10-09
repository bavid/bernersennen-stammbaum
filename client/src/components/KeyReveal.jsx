import { useEffect, useRef, useState } from 'react'
import Icon from './Icon.jsx'
import { useT } from '../lib/i18n/index.js'

const COPIED_MS = 2000

// Zeigt den Schlüssel genau einmal: nach dem Einlösen eines Gutscheins und nach dem Erneuern des
// Schlüssels (Zugang-Einstellungen). Erst der "Weiter"-Knopf lässt die aufrufende Seite fortfahren –
// so bleibt Zeit, den Schlüssel zu sichern, bevor man in die Chronik wechselt. showCardHint blendet den
// Hinweis auf die (physische) Karte aus – nach einem Schlüssel-Erneuern gibt es keine neue Karte dazu.
// note (final-review Phase T Finding 4, AdminPartners "Tierheim-Bereich anlegen"): ein zusätzlicher,
// aufrufer-spezifischer Hinweis unter dem Kartenhinweis - für Kontexte, in denen die Standardtexte
// (an ein Zuhause gerichtet) nicht passen, ohne die Kernerklärung selbst zu verdoppeln oder zu ersetzen.
// freshKey (Audit V7a): nach einem persönlichen Code (Weitergabe, Besuch, Übergabe, Familien-Einladung) ist der
// Schlüssel neu erzeugt (Server: fromOthers false) - dann kennt ihn niemand sonst, statt des Kartenhinweises steht das da.
export default function KeyReveal({ value, onContinue, continueLabel, showCardHint = true, freshKey = false, note }) {
  const t = useT()
  const [copied, setCopied] = useState(false)
  const headingRef = useRef(null)

  // Fokus auf die Überschrift, sobald der Schlüssel erscheint: sonst bleibt er z. B. nach dem Absenden
  // eines Formulars unbemerkt irgendwo im DOM stehen – role="status" am Wrapper kündigt Überschrift und
  // Wert zusätzlich Screenreadern an.
  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!copied) return undefined
    const timer = setTimeout(() => setCopied(false), COPIED_MS)
    return () => clearTimeout(timer)
  }, [copied])

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
    } catch {
      // Ohne Zwischenablage-Recht bleibt der Schlüssel zum Markieren/Abtippen sichtbar.
    }
  }

  return (
    <div className="key-reveal">
      <div role="status">
        <p className="field-label" ref={headingRef} tabIndex={-1}>
          {t('login.keyReveal.title')}
        </p>
        <p className="key-reveal-value">{value}</p>
      </div>
      <button type="button" className={`btn ${copied ? 'btn-ink' : 'btn-ghost'} btn-block`} onClick={handleCopy}>
        <Icon name={copied ? 'check' : 'copy'} />
        {copied ? t('login.keyReveal.copied') : t('login.keyReveal.copy')}
      </button>
      <p className="key-reveal-text">
        {t('login.keyReveal.text')}
      </p>
      {freshKey && <p className="field-hint">{t('login.keyReveal.fresh')}</p>}
      {showCardHint && !freshKey && (
        <p className="field-hint">{t('login.keyReveal.cardHint')}</p>
      )}
      {note && <p className="field-hint">{note}</p>}
      <button type="button" className="btn btn-primary btn-lg btn-block" onClick={onContinue}>
        {continueLabel || t('login.keyReveal.continue')}
      </button>
    </div>
  )
}
