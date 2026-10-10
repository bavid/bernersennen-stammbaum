import { useEffect, useRef, useState } from 'react'
import { useTheme } from '../../themes/ThemeProvider.jsx'
import { useIsDemo, useReadOnlyHint } from '../../lib/demo.js'
import Icon from '../Icon.jsx'
import VisitInviteCreator from '../visits/VisitInviteCreator.jsx'
import CodeList from './CodeList.jsx'
import GeschenkkartePanel from '../geschenk/GeschenkkartePanel.jsx'
import { GESCHENK_MUSTER_CODE } from '../../lib/geschenkkarte.js'
import useVoucherList from './useVoucherList.js'
import { t } from '../../lib/i18n/index.js'

const CHOICES = [
  {
    key: 'besuch',
    icon: 'home',
    title: 'Zu Besuch einladen',
    text: (words) => t('Freunde schauen bei euch vorbei, sehen eure Tiere und schreiben {greetings}. Der Code gilt 7 Tage.', { greetings: words.greetings })
  },
  {
    key: 'verschenken',
    icon: 'heart',
    title: 'Zuhause verschenken',
    text: () => t('Jemand bekommt ein eigenes Zuhause für seine Tiere – kostenlos, mit einem Einladungscode von euch.')
  }
]

function InviteChoice({ onChoose, focusKey }) {
  const { words } = useTheme()
  const refs = useRef({})
  useEffect(() => {
    if (focusKey) refs.current[focusKey]?.focus()
  }, [focusKey])
  return (
    <div className="invite-choice" role="group" aria-label={t('Wie möchtet ihr einladen?')}>
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
          <span className="invite-choice-title">{t(choice.title)}</span>
          <span className="invite-choice-text">{choice.text(words)}</span>
        </button>
      ))}
    </div>
  )
}

// "Zuhause verschenken": die Einladungscodes des Zuhauses (ohne Besuchs-Codes) samt "Neuen Code erstellen" und Archiv.
// Plan 2027: neben jedem offenen Code „Als Geschenkkarte drucken“ - der Code bleibt im State (gift), nie in der Adresse.
// Die Demo vergibt keine Codes: dort zeigt „Geschenkkarte ansehen (Muster)“ die Karte mit einem Beispiel-Code.
// gift/onGift liegen in HomeInvite: dort steht der einzige Zurück-Link (Audit: zwei Zurück-Links übereinander).
function GiftPanel({ list, disabled, isDemo, headingRef, gift, onGift }) {
  const gifts = list.vouchers?.filter((voucher) => !voucher.besuch)
  const archive = list.archive?.filter((voucher) => !voucher.besuch)
  if (gift) return <GeschenkkartePanel code={gift.code} muster={gift.muster} />
  return (
    <section className="invite-vouchers" aria-labelledby="invite-gift-title">
      <h3 id="invite-gift-title" ref={headingRef} tabIndex={-1}>
        {t('Zuhause verschenken')}
      </h3>
      <p className="muted">{t('Wer den Einladungscode einlöst, bekommt ein eigenes Zuhause für seine Tiere.')}</p>
      <CodeList
        list={list}
        vouchers={gifts}
        archive={archive}
        canCreate
        canModerate
        own
        disabled={disabled}
        emptyText={t('Gerade keine Einladungscodes übrig.')}
        onGift={(code) => onGift({ code, muster: false })}
      />
      {isDemo && (
        <button type="button" className="btn btn-ghost btn-compact" onClick={() => onGift({ code: GESCHENK_MUSTER_CODE, muster: true })}>
          {t('Geschenkkarte ansehen (Muster)')}
        </button>
      )}
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
          <h4 id="invite-visit-open-title">{t('Offene Besuchs-Codes')}</h4>
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
  const readOnlyHint = useReadOnlyHint(t('Beispiel – in der Demo werden keine Einladungscodes vergeben.'))
  const list = useVoucherList({ withLimit: true })
  const [mode, setMode] = useState(null)
  const [lastMode, setLastMode] = useState(null)
  const [gift, setGift] = useState(null)
  const headingRef = useRef(null)

  useEffect(() => {
    if (mode && !gift) headingRef.current?.focus()
  }, [mode, gift])

  function back() {
    if (gift) {
      setGift(null)
      return
    }
    setLastMode(mode)
    setMode(null)
  }

  return (
    <div className="invite invite-home">
      {/* "Zu Besuch einladen" nennt die Demo selbst (VisitInviteCreator) - hier nicht doppelt. */}
      {isDemo && mode !== 'besuch' && !gift && <p className="field-hint">{readOnlyHint}</p>}
      {mode === null ? (
        <InviteChoice onChoose={setMode} focusKey={lastMode} />
      ) : (
        <>
          <button type="button" className="back-link invite-back" onClick={back}>
            <Icon name="arrowLeft" /> {gift ? t('Zurück zu den Codes') : t('Andere Möglichkeit')}
          </button>
          {mode === 'besuch' ? (
            <VisitPanel list={list} disabled={isDemo} headingRef={headingRef} />
          ) : (
            <GiftPanel list={list} disabled={isDemo} isDemo={isDemo} headingRef={headingRef} gift={gift} onGift={setGift} />
          )}
        </>
      )}
    </div>
  )
}
