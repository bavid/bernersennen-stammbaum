import { useState } from 'react'
import Icon from './Icon.jsx'
import RequestVoucherForm from './RequestVoucherForm.jsx'

// "Noch keinen Gutschein?" auf der Login-Seite (Phase N), im Einstieg "Für Tierhalter": erst nur Titel, ein Satz und
// ein Knopf - die Login-Seite bleibt ruhig. Der Knopf klappt das Formular auf (RequestVoucherForm, Fokus aufs erste
// Feld); nach dem Absenden bleibt nur der Dank stehen.
export default function LoginVoucherRequest() {
  const [open, setOpen] = useState(false)

  return (
    <section className="login-request" aria-labelledby="login-request-title">
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
