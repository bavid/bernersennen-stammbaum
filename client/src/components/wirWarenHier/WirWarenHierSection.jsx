import { useId, useState } from 'react'
import { api } from '../../api'
import { useIsDemo, useReadOnlyHint } from '../../lib/demo.js'
import { WWH } from '../../lib/wirWarenHierText.js'
import { t } from '../../lib/i18n/index.js'
import EigeneAnmeldung from './EigeneAnmeldung.jsx'
import OrtTierKarte from './OrtTierKarte.jsx'
import WwhKontaktListe from './WwhKontaktListe.jsx'
import useWirWarenHier from './useWirWarenHier.js'

// Anmelden: welches eigene Tier war hier? Nur Tiere, die hier noch nicht angemeldet sind.
function AnmeldenForm({ dogs, hasAny, disabled, onSubmit }) {
  const selectId = useId()
  const [choice, setChoice] = useState('')
  if (!hasAny) return <p className="wwh-note muted">{t(WWH.keineTiere)}</p>
  if (dogs.length === 0) return <p className="wwh-note muted">{t(WWH.alleAngemeldet)}</p>
  const dogId = dogs.some((dog) => String(dog.id) === choice) ? Number(choice) : dogs[0].id

  function handleSubmit(event) {
    event.preventDefault()
    onSubmit(dogId)
  }

  return (
    <form className="wwh-anmelden" onSubmit={handleSubmit}>
      <label className="field-label" htmlFor={selectId}>
        {t(WWH.tierWaehlen)}
      </label>
      <div className="wwh-anmelden-row">
        <select id={selectId} value={dogId} disabled={disabled} onChange={(event) => setChoice(event.target.value)}>
          {dogs.map((dog) => (
            <option key={dog.id} value={dog.id}>
              {dog.name}
            </option>
          ))}
        </select>
        <button type="submit" className="btn btn-primary" disabled={disabled}>
          {t(WWH.anmelden)}
        </button>
      </div>
    </form>
  )
}

// „Wer noch hier war“: fremde Tiere erst, wenn der Ort ein eigenes Tier freigegeben hat (sonst liefert der Server []).
function Andere({ view, wishes, disabled, onRequest }) {
  const eigeneTiere = view.eigene.filter((checkin) => checkin.status === 'bestaetigt').map(({ dogId, tierName }) => ({ dogId, tierName }))
  let body
  if (eigeneTiere.length === 0) body = <p className="wwh-note muted">{t(WWH.erstFreigabe)}</p>
  else if (view.andere.length === 0) body = <p className="wwh-note muted">{t(WWH.niemand)}</p>
  else {
    body = (
      <ul className="wwh-andere-list" role="list">
        {view.andere.map((tier) => (
          <OrtTierKarte
            key={tier.checkinId}
            tier={tier}
            eigeneTiere={eigeneTiere}
            angefragt={wishes.von.some((wish) => wish.checkinId === tier.checkinId)}
            disabled={disabled}
            onRequest={onRequest}
          />
        ))}
      </ul>
    )
  }
  return (
    <section className="wwh-andere" aria-labelledby="wwh-andere-title">
      <h3 id="wwh-andere-title" className="wwh-subtitle">
        {t(WWH.werNoch)}
      </h3>
      {body}
    </section>
  )
}

// Alle Aktionen als run(…)-Aufrufe mit der Ansage danach.
function useActions(run, ortName) {
  return {
    checkIn: (partnerId, dogId) => run(() => api.wwhCheckIn(partnerId, dogId), t(WWH.angemeldet, { ort: ortName })),
    setZeigeMich: (checkin, value) =>
      run(() => api.wwhSetZeigeMich(checkin.id, value), t(value ? WWH.gezeigt : WWH.nichtGezeigt, { name: checkin.tierName })),
    withdraw: (checkin) => run(() => api.wwhWithdraw(checkin.id), t(WWH.abgemeldet, { name: checkin.tierName })),
    pin: (checkinId, entryId, titel) => run(() => api.wwhPin(checkinId, entryId), t(WWH.angeheftet, { titel, ort: ortName })),
    unpin: (checkinId, pin) => run(() => api.wwhUnpin(checkinId, pin.id), t(WWH.geloest, { titel: pin.titel })),
    request: (checkinId, dogId, name) => run(() => api.wwhKontakt(checkinId, dogId), t(WWH.anfrageGesendet, { name })),
    accept: (wish) => run(() => api.wwhKontaktAnnehmen(wish.id), t(WWH.angenommen)),
    reject: (wish) => run(() => api.wwhKontaktAblehnen(wish.id), t(WWH.wunschAbgelehnt)),
    withdrawWish: (wish) => run(() => api.wwhKontaktZurueck(wish.id), t(WWH.wunschZurueck))
  }
}

function Inhalt({ partnerId, view, dogs, wishes, readOnly, busy, actions }) {
  const ortName = view.ort.name
  const disabled = readOnly || busy
  const freeDogs = dogs.filter((dog) => !view.eigene.some((checkin) => checkin.dogId === dog.id))
  return (
    <>
      <AnmeldenForm dogs={freeDogs} hasAny={dogs.length > 0} disabled={disabled} onSubmit={(dogId) => actions.checkIn(partnerId, dogId)} />
      {view.eigene.length > 0 && (
        <ul className="wwh-own-list" role="list">
          {view.eigene.map((checkin) => (
            <EigeneAnmeldung key={checkin.id} checkin={checkin} ortName={ortName} readOnly={readOnly} busy={busy} actions={actions} />
          ))}
        </ul>
      )}
      <WwhKontaktListe wishes={wishes} disabled={disabled} actions={{ ...actions, withdraw: actions.withdrawWish }} />
      <Andere view={view} wishes={wishes} disabled={disabled} onRequest={actions.request} />
    </>
  )
}

// Reiter „Wir waren hier“ auf der Partnerseite (PortalBody, nur mit einer Sitzung im eigenen Zuhause): anmelden, Tier
// hier zeigen, Erinnerungen anheften, sehen, wer noch hier war, und Kontaktwünsche dieses Ortes beantworten. In der Demo
// (und der Admin-Ansicht) nur lesen.
export default function WirWarenHierSection({ partner }) {
  const isDemo = useIsDemo()
  const readOnlyHint = useReadOnlyHint()
  const { view, dogs, wishes, busy, notice, error, run } = useWirWarenHier(partner.id)
  const ortName = view?.ort?.name || partner.name
  const actions = useActions(run, ortName)

  return (
    <section className="portal-section wwh" aria-labelledby="wwh-title" aria-busy={busy || undefined}>
      <div className="portal-section-head">
        <h2 id="wwh-title" tabIndex={-1}>
          {t(WWH.titel)}
        </h2>
        <p className="portal-section-lede">{t(WWH.lede, { ort: ortName })}</p>
      </div>
      {isDemo && <p className="field-hint wwh-readonly">{readOnlyHint}</p>}
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      <p className="wwh-notice" role="status">
        {notice}
      </p>
      {view === undefined && <p className="muted">{t(WWH.laden)}</p>}
      {view && <Inhalt partnerId={partner.id} view={view} dogs={dogs} wishes={wishes} readOnly={isDemo} busy={busy} actions={actions} />}
    </section>
  )
}
