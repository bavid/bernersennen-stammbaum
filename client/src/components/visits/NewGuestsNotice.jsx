import { useEffect, useState } from 'react'
import { api } from '../../api'
import { useIsDemo, useReadOnlyHint } from '../../lib/demo.js'
import ConfirmButton from '../ConfirmButton.jsx'
import { useToast } from '../Toast.jsx'

// „Neu zu Besuch“ (security-review V2, M-3): ein Besuch bleibt bestehen, bis jemand ihn beendet - wer über einen
// (vielleicht weitergereichten) Code dazukommt, soll dem Gastgeber deshalb auffallen. Der Hinweis steht, bis der
// Gastgeber „Passt“ sagt oder den Gast entfernt. onFamilyChange: setFamily aus App.jsx (Zahl me.neueGaeste).
export default function NewGuestsNotice({ onFamilyChange }) {
  const isDemo = useIsDemo()
  const readOnlyHint = useReadOnlyHint()
  const toast = useToast()
  const [guests, setGuests] = useState([])
  const [busyId, setBusyId] = useState(null)

  useEffect(() => {
    let current = true
    api
      .visits()
      .then((lists) => current && setGuests(lists.gaeste.filter((guest) => guest.neu)))
      .catch(() => current && setGuests([]))
    return () => {
      current = false
    }
  }, [])

  function drop(guest) {
    setGuests((list) => list.filter((g) => g.id !== guest.id))
  }

  async function acknowledge(guest) {
    setBusyId(guest.id)
    try {
      const me = await api.acknowledgeGuest(guest.id)
      drop(guest)
      onFamilyChange?.(me)
    } catch (err) {
      toast(err.message)
    } finally {
      setBusyId(null)
    }
  }

  async function remove(guest) {
    setBusyId(guest.id)
    try {
      await api.removeGuest(guest.id)
      drop(guest)
      onFamilyChange?.((family) => (family ? { ...family, neueGaeste: Math.max(0, (family.neueGaeste || 0) - 1) } : family))
      toast(`„${guest.name}“ ist nicht mehr bei euch zu Gast`)
    } catch (err) {
      toast(err.message)
    } finally {
      setBusyId(null)
    }
  }

  if (guests.length === 0) return null

  return (
    <section className="new-guests" aria-labelledby="new-guests-title">
      <h2 id="new-guests-title" className="visually-hidden">
        Neue Gäste
      </h2>
      <ul className="new-guest-list">
        {guests.map((guest) => (
          <li key={guest.id} className="new-guest">
            <p className="new-guest-text">
              Neu zu Besuch: <strong>{guest.name}</strong>
              {guest.ueberCode && <span className="muted"> – über deinen Code „{guest.ueberCode}“</span>}
            </p>
            <p className="field-hint">Sieht eure Tiere und nicht privaten Erinnerungen und darf Grüße schreiben.</p>
            <div className="new-guest-actions">
              <button type="button" className="btn btn-primary" disabled={isDemo || busyId === guest.id} onClick={() => acknowledge(guest)}>
                Passt
              </button>
              <ConfirmButton
                label="Gast entfernen"
                confirmLabel="Wirklich entfernen?"
                ariaLabel={`${guest.name} als Gast entfernen`}
                disabled={isDemo || busyId === guest.id}
                onConfirm={() => remove(guest)}
              />
            </div>
          </li>
        ))}
      </ul>
      {isDemo && <p className="field-hint">{readOnlyHint}</p>}
    </section>
  )
}
