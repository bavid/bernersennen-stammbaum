import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import Icon from './Icon.jsx'
import RequestVoucherForm from './RequestVoucherForm.jsx'
import { useT } from '../lib/i18n/index.js'
import { Button } from './ui/index.js'

// Sprungziel für "Gutschein anfragen" (/#gutschein-anfragen) - für Links von außerhalb der App (z. B. gedruckt); in der
// App selbst verlinkt es seit der Feedback-Runde zum Partner-Portal niemand mehr.
export const VOUCHER_REQUEST_ANCHOR = 'gutschein-anfragen'

// "Noch keinen Gutschein?" auf der Login-Seite (Phase N), im Einstieg "Für Tierhalter": erst nur Titel, ein Satz und
// ein Knopf - die Login-Seite bleibt ruhig. Der Knopf klappt das Formular auf (RequestVoucherForm, Fokus aufs erste
// Feld); nach dem Absenden bleibt nur der Dank stehen. Kommt man über /#gutschein-anfragen, ist das
// Formular gleich offen und der Abschnitt im Blick.
export default function LoginVoucherRequest() {
  const t = useT()
  const { hash } = useLocation()
  const viaAnchor = hash === `#${VOUCHER_REQUEST_ANCHOR}`
  const [open, setOpen] = useState(viaAnchor)
  const sectionRef = useRef(null)

  useEffect(() => {
    if (!viaAnchor) return
    setOpen(true)
    sectionRef.current?.scrollIntoView?.({ block: 'start' })
  }, [viaAnchor])

  return (
    <section ref={sectionRef} id={VOUCHER_REQUEST_ANCHOR} className="login-request" aria-labelledby="login-request-title">
      <h2 id="login-request-title">{t('login.request.title')}</h2>
      <p className="muted">{t('login.request.lede')}</p>
      {open ? (
        <RequestVoucherForm idPrefix="login-request" autoFocus />
      ) : (
        <Button type="button" variant="ghost" block onClick={() => setOpen(true)}>
          <Icon name="mail" />
          {t('login.request.button')}
        </Button>
      )}
    </section>
  )
}
