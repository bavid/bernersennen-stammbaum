import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import Icon from './Icon.jsx'
import RequestVoucherForm from './RequestVoucherForm.jsx'

// Sprungziel für "Gutschein anfragen" aus dem Fuß der Partner-Portale (PortalBrandStrip VOUCHER_REQUEST_PATH).
export const VOUCHER_REQUEST_ANCHOR = 'gutschein-anfragen'

// "Noch keinen Gutschein?" auf der Login-Seite (Phase N), im Einstieg "Für Tierhalter": erst nur Titel, ein Satz und
// ein Knopf - die Login-Seite bleibt ruhig. Der Knopf klappt das Formular auf (RequestVoucherForm, Fokus aufs erste
// Feld); nach dem Absenden bleibt nur der Dank stehen. Kommt man über /#gutschein-anfragen (vom Portal eines
// Partners), ist das Formular gleich offen und der Abschnitt im Blick.
export default function LoginVoucherRequest() {
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
      <h2 id="login-request-title">Noch keinen Gutschein?</h2>
      <p className="muted">Schreib uns – wir schicken dir einen Gutschein per E-Mail.</p>
      {open ? (
        <RequestVoucherForm idPrefix="login-request" autoFocus />
      ) : (
        <button type="button" className="btn btn-ghost btn-block" onClick={() => setOpen(true)}>
          <Icon name="mail" />
          Gutschein anfragen
        </button>
      )}
    </section>
  )
}
