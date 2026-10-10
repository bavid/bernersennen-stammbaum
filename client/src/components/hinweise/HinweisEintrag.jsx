import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import ConfirmButton from '../ConfirmButton.jsx'
import WwhAnnehmenDialog from '../wirWarenHier/WwhAnnehmenDialog.jsx'
import Icon from '../Icon.jsx'
import { relativeTime } from '../../lib/dates.js'
import { greetingText, guestText, kontaktText, requestText } from '../../lib/glocke.js'
import { WWH } from '../../lib/wirWarenHierText.js'
import { t } from '../../lib/i18n/index.js'
import { Button } from '../ui/index.js'

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
          <Button
            type="button"
            size="sm"
            aria-describedby={questionId}
            disabled={disabled || busy}
            onClick={() => actions.confirm(request)}
          >
            {t('Ja')}
          </Button>
          <Button
            type="button"
            variant="ghost" size="sm"
            aria-describedby={questionId}
            disabled={disabled || busy}
            onClick={() => actions.reject(request)}
          >
            {t('Nein')}
          </Button>
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
          {guest.ueberCode ? t('über deinen Code „{code}“', { code: guest.ueberCode }) : t('sieht eure nicht privaten Erinnerungen')}
        </p>
        <div className="hinweis-actions">
          <Button type="button" size="sm" disabled={disabled || busy} onClick={() => actions.acknowledgeGuest(guest)}>
            {t('Passt')}
          </Button>
          <ConfirmButton
            label="Entfernen"
            confirmLabel="Wirklich entfernen?"
            ariaLabel={t('{name} als Gast entfernen', { name: guest.name })}
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

// „Benno möchte Flocke kennenlernen – bei Hundeschule Bachweg“ („Wir waren hier“): Annehmen fragt erst nach (derselbe
// Dialog wie im Reiter des Ortes), Ablehnen sofort. Der Ort führt zum Reiter „Wir waren hier“ der Partnerseite.
function Kontakt({ wish, busy, disabled, actions, onNavigate }) {
  const textId = useId()
  const [open, setOpen] = useState(false)
  async function accept() {
    if (await actions.acceptWish(wish)) setOpen(false)
  }
  return (
    <>
      <Mark icon="paw" photo={wish.fotoUrl} />
      <div className="hinweis-body">
        <p className="hinweis-text" id={textId} title={kontaktText(wish)}>
          {kontaktText(wish)}
        </p>
        <p className="hinweis-meta">
          {wish.ortSlug ? (
            <Link to={`/p/${encodeURIComponent(wish.ortSlug)}?reiter=wir-waren-hier`} onClick={onNavigate}>
              {t(WWH.titel)}
            </Link>
          ) : (
            t(WWH.titel)
          )}
          {wish.createdAt && ` · ${relativeTime(wish.createdAt)}`}
        </p>
        <div className="hinweis-actions">
          <Button
            type="button"
            size="sm"
            aria-describedby={textId}
            disabled={disabled || busy}
            onClick={() => setOpen(true)}
          >
            {t(WWH.annehmen)}
          </Button>
          <Button
            type="button"
            variant="ghost" size="sm"
            aria-describedby={textId}
            disabled={disabled || busy}
            onClick={() => actions.rejectWish(wish)}
          >
            {t(WWH.ablehnen)}
          </Button>
        </div>
      </div>
      <WwhAnnehmenDialog open={open} disabled={disabled || busy} onCancel={() => setOpen(false)} onConfirm={accept} />
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
      {item.kind === 'kontakt' && <Kontakt wish={item.data} busy={busy} disabled={disabled} actions={actions} onNavigate={onNavigate} />}
    </li>
  )
}
