import { useEffect, useRef, useState } from 'react'
import { useTheme } from '../../themes/ThemeProvider.jsx'
import { useIsDemo, useReadOnlyHint } from '../../lib/demo.js'
import Icon from '../Icon.jsx'
import VisitInviteCreator from '../visits/VisitInviteCreator.jsx'
import CodeList from './CodeList.jsx'
import useVoucherList from './useVoucherList.js'

const CHOICES = [
  {
    key: 'besuch',
    icon: 'home',
    title: 'Zu Besuch einladen',
    text: (words) => `Freunde schauen bei euch vorbei, sehen eure Tiere und schreiben ${words.greetings}. Der Code gilt 7 Tage.`
  },
  {
    key: 'verschenken',
    icon: 'heart',
    title: 'Zuhause verschenken',
    text: () => 'Jemand bekommt ein eigenes Zuhause für seine Tiere – kostenlos, mit einem Einladungscode von euch.'
  }
]

function InviteChoice({ onChoose, focusKey }) {
  const { words } = useTheme()
  const refs = useRef({})
  useEffect(() => {
    if (focusKey) refs.current[focusKey]?.focus()
  }, [focusKey])
  return (
    <div className="invite-choice" role="group" aria-label="Wie möchtet ihr einladen?">
      {CHOICES.map((choice) => (
        <button
          key={choice.key}
          ref={(el) => {
            refs.current[choice.key] = el
          }}
          type="button"
          className="invite-choice-option"
          onClick={() => onChoose(choice.key)}
        >
          <Icon name={choice.icon} />
          <span className="invite-choice-title">{choice.title}</span>
          <span className="invite-choice-text">{choice.text(words)}</span>
        </button>
      ))}
    </div>
  )
}

// "Zuhause verschenken": die Einladungscodes des Zuhauses (ohne Besuchs-Codes) samt "Neuen Code erstellen" und Archiv.
function GiftPanel({ list, disabled, headingRef }) {
  const gifts = list.vouchers?.filter((voucher) => !voucher.besuch)
  const archive = list.archive?.filter((voucher) => !voucher.besuch)
  return (
    <section className="invite-vouchers" aria-labelledby="invite-gift-title">
      <h3 id="invite-gift-title" ref={headingRef} tabIndex={-1}>
        Zuhause verschenken
      </h3>
      <p className="muted">Wer den Einladungscode einlöst, bekommt ein eigenes Zuhause für seine Tiere.</p>
      <CodeList list={list} vouchers={gifts} archive={archive} canCreate canModerate own disabled={disabled} emptyText="Gerade keine Einladungscodes übrig." />
    </section>
  )
}

// "Zu Besuch einladen": einen neuen Besuchs-Code erstellen (VisitInviteCreator) und die noch offenen Besuchs-Codes.
function VisitPanel({ list, disabled, headingRef }) {
  const open = list.vouchers?.filter((voucher) => voucher.besuch)
  return (
    <div className="invite-visit">
      <VisitInviteCreator headingRef={headingRef} onCreated={list.reload} />
      {open && open.length > 0 && (
        <section className="invite-vouchers" aria-labelledby="invite-visit-open-title">
          <h4 id="invite-visit-open-title">Offene Besuchs-Codes</h4>
          <CodeList list={list} vouchers={open} canModerate own disabled={disabled} />
        </section>
      )}
    </div>
  )
}

// Einladen aus dem eigenen Zuhause (Phase W, Schritt 2 - Konto-Menü „Einladen“): zwei klare Wege statt eines langen
// Dialogs. „Zu Besuch einladen“ (Besuchs-Code, 7 Tage, server/routes/besuche.js) oder „Zuhause verschenken“ (Einladungscode
// für ein eigenes Zuhause, POST /api/vouchers). Einen Code von Freunden löst man auf der Seite „Familien“ ein, die
// Liste der Besuche und Gäste steht in Einstellungen › Mein Zuhause.
export default function HomeInvite() {
  const isDemo = useIsDemo()
  const readOnlyHint = useReadOnlyHint('Beispiel – in der Demo werden keine Einladungscodes vergeben.')
  const list = useVoucherList({ withLimit: true })
  const [mode, setMode] = useState(null)
  const [lastMode, setLastMode] = useState(null)
  const headingRef = useRef(null)

  useEffect(() => {
    if (mode) headingRef.current?.focus()
  }, [mode])

  function back() {
    setLastMode(mode)
    setMode(null)
  }

  return (
    <div className="invite invite-home">
      {/* "Zu Besuch einladen" nennt die Demo selbst (VisitInviteCreator) - hier nicht doppelt. */}
      {isDemo && mode !== 'besuch' && <p className="field-hint">{readOnlyHint}</p>}
      {mode === null ? (
        <InviteChoice onChoose={setMode} focusKey={lastMode} />
      ) : (
        <>
          <button type="button" className="back-link invite-back" onClick={back}>
            <Icon name="arrowLeft" /> Andere Möglichkeit
          </button>
          {mode === 'besuch' ? (
            <VisitPanel list={list} disabled={isDemo} headingRef={headingRef} />
          ) : (
            <GiftPanel list={list} disabled={isDemo} headingRef={headingRef} />
          )}
        </>
      )}
    </div>
  )
}
