import { useEffect, useRef, useState } from 'react'
import ConfirmButton from '../ConfirmButton.jsx'
import Icon from '../Icon.jsx'
import WwhAnnehmenDialog from './WwhAnnehmenDialog.jsx'
import { WWH } from '../../lib/wirWarenHierText.js'
import { t } from '../../lib/i18n/index.js'
import { focusWwhTitle } from './useWirWarenHier.js'

function Mark({ fotoUrl }) {
  if (fotoUrl) return <img className="wwh-wish-photo" src={fotoUrl} alt="" width="40" height="40" loading="lazy" />
  return (
    <span className="wwh-wish-photo is-empty" aria-hidden="true">
      <Icon name="paw" />
    </span>
  )
}

// Ein Wunsch an uns: Annehmen fragt erst nach (Dialog nennt, was die andere Familie danach sieht), Ablehnen sofort.
function Eingehend({ wish, disabled, actions }) {
  const [open, setOpen] = useState(false)
  const trigger = useRef(null)
  const wasOpen = useRef(false)
  const decided = useRef(false)

  useEffect(() => {
    if (wasOpen.current && !open && !decided.current) trigger.current?.focus()
    wasOpen.current = open
  }, [open])

  // Nach Annehmen/Ablehnen verschwindet der Wunsch samt Knöpfen: Fokus auf die Abschnittsüberschrift.
  async function accept() {
    if (!(await actions.accept(wish))) return
    decided.current = true
    setOpen(false)
    focusWwhTitle()
  }

  async function reject() {
    if (await actions.reject(wish)) focusWwhTitle()
  }

  return (
    <li className="wwh-wish">
      <Mark fotoUrl={wish.fotoUrl} />
      <p className="wwh-wish-text">{t(WWH.wunschAn, { tier: wish.tierName, eigenes: wish.eigenesTierName })}</p>
      <div className="wwh-wish-actions">
        <button ref={trigger} type="button" className="btn btn-primary btn-compact" disabled={disabled} onClick={() => setOpen(true)}>
          {t(WWH.annehmen)}
        </button>
        <button type="button" className="btn btn-ghost btn-compact" disabled={disabled} onClick={reject}>
          {t(WWH.ablehnen)}
        </button>
      </div>
      <WwhAnnehmenDialog open={open} disabled={disabled} onCancel={() => setOpen(false)} onConfirm={accept} />
    </li>
  )
}

function Ausgehend({ wish, disabled, actions }) {
  return (
    <li className="wwh-wish is-outgoing">
      <Mark fotoUrl={wish.fotoUrl} />
      <p className="wwh-wish-text">{t(WWH.wunschVon, { tier: wish.tierName })}</p>
      <div className="wwh-wish-actions">
        <ConfirmButton
          label={WWH.zurueckziehen}
          confirmLabel={WWH.zurueckziehenFrage}
          icon="close"
          className="btn-compact"
          disabled={disabled}
          onConfirm={async () => (await actions.withdraw(wish)) && focusWwhTitle()}
        />
      </div>
    </li>
  )
}

// Offene Kontaktwünsche dieses Ortes (an uns und von uns). Steht im Reiter „Wir waren hier“ der Partnerseite - die
// Hinweis-Glocke zeigt die Wünsche an uns ebenfalls (mit Ort). Ohne Wünsche erscheint nichts.
export default function WwhKontaktListe({ wishes, disabled = false, actions }) {
  if (wishes.an.length + wishes.von.length === 0) return null
  return (
    <section className="wwh-wishes" aria-labelledby="wwh-wishes-title">
      <h3 id="wwh-wishes-title" className="wwh-subtitle">
        {t(WWH.wuensche)}
      </h3>
      <ul className="wwh-wish-list" role="list">
        {wishes.an.map((wish) => (
          <Eingehend key={`an-${wish.id}`} wish={wish} disabled={disabled} actions={actions} />
        ))}
        {wishes.von.map((wish) => (
          <Ausgehend key={`von-${wish.id}`} wish={wish} disabled={disabled} actions={actions} />
        ))}
      </ul>
    </section>
  )
}
