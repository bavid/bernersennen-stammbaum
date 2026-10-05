import { useId } from 'react'
import { Link } from 'react-router-dom'
import ConfirmButton from '../ConfirmButton.jsx'
import Icon from '../Icon.jsx'
import { relativeTime } from '../../lib/dates.js'
import { greetingText, guestText, requestText } from '../../lib/glocke.js'

// Kleines Bild links: das erste Foto einer Anfrage (hilft beim Erinnern), sonst ein Zeichen für die Art des Hinweises.
function Mark({ icon, photo }) {
  if (photo) return <img className="hinweis-mark hinweis-mark-photo" src={photo} alt="" width="36" height="36" loading="lazy" />
  return (
    <span className="hinweis-mark" aria-hidden="true">
      <Icon name={icon} />
    </span>
  )
}

// „Wilma war beim „Strandtag“ mit dabei?“ - Ja übernimmt den Eintrag in die eigene Chronik, Nein nimmt die Markierung weg.
function Anfrage({ request, busy, disabled, actions }) {
  const questionId = useId()
  return (
    <>
      <Mark icon="paw" photo={request.foto_urls?.[0]} />
      <div className="hinweis-body">
        <p className="hinweis-text" id={questionId} title={requestText(request)}>
          {requestText(request)}
        </p>
        <p className="hinweis-meta">
          {request.zuhause}
          {request.angefragtAm && ` · ${relativeTime(request.angefragtAm)}`}
        </p>
        <div className="hinweis-actions">
          <button
            type="button"
            className="btn btn-primary btn-compact"
            aria-describedby={questionId}
            disabled={disabled || busy}
            onClick={() => actions.confirm(request)}
          >
            Ja
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-compact"
            aria-describedby={questionId}
            disabled={disabled || busy}
            onClick={() => actions.reject(request)}
          >
            Nein
          </button>
        </div>
      </div>
    </>
  )
}

// „Neu bei euch zu Gast: Zuhause Möwenweg“ - Passt quittiert, Entfernen beendet den Besuch (zweistufig).
function Gast({ guest, busy, disabled, actions }) {
  return (
    <>
      <Mark icon="home" />
      <div className="hinweis-body">
        <p className="hinweis-text" title={guestText(guest)}>
          {guestText(guest)}
        </p>
        <p className="hinweis-meta">
          {guest.ueberCode ? `über deinen Code „${guest.ueberCode}“` : 'sieht eure nicht privaten Erinnerungen'}
        </p>
        <div className="hinweis-actions">
          <button type="button" className="btn btn-primary btn-compact" disabled={disabled || busy} onClick={() => actions.acknowledgeGuest(guest)}>
            Passt
          </button>
          <ConfirmButton
            label="Entfernen"
            confirmLabel="Wirklich entfernen?"
            ariaLabel={`${guest.name} als Gast entfernen`}
            icon="close"
            className="btn-compact"
            disabled={disabled || busy}
            onConfirm={() => actions.removeGuest(guest)}
          />
        </div>
      </div>
    </>
  )
}

// „Familie Sonnenhang hat euch zu „Erster Schnee“ gegrüßt“ - führt zur Erinnerung (dort steht der Gruß).
function Gruss({ greeting, onNavigate }) {
  return (
    <>
      <Mark icon="heart" />
      <div className="hinweis-body">
        <Link className="hinweis-text hinweis-link" to={`/tier/${greeting.dogId}#entry-${greeting.entryId}`} onClick={onNavigate} title={greetingText(greeting)}>
          {greetingText(greeting)}
        </Link>
        <p className="hinweis-meta">{relativeTime(greeting.createdAt)}</p>
      </div>
    </>
  )
}

// Ein Hinweis der Liste (lib/glocke.js hinweisItems). busy: gerade läuft eine Aktion dafür; disabled: Demo/Admin-Ansicht.
export default function HinweisEintrag({ item, busy, disabled, actions, onNavigate }) {
  return (
    <li className={`hinweis-item${item.neu ? ' is-new' : ''}`}>
      {item.kind === 'anfrage' && <Anfrage request={item.data} busy={busy} disabled={disabled} actions={actions} />}
      {item.kind === 'gast' && <Gast guest={item.data} busy={busy} disabled={disabled} actions={actions} />}
      {item.kind === 'gruss' && <Gruss greeting={item.data} onNavigate={onNavigate} />}
    </li>
  )
}
