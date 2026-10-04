import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTheme } from '../themes/ThemeProvider.jsx'
import Icon from '../components/Icon.jsx'
import Modal from '../components/Modal.jsx'
import JoinFamilyDialog from '../components/JoinFamilyDialog.jsx'
import VisitRedeemForm from '../components/visits/VisitRedeemForm.jsx'
import { useToast } from '../components/Toast.jsx'
import { HOME_LABEL, groupRoute } from '../lib/areas.js'
import { roleLabel } from '../lib/roles.js'

const VISIT_DIALOG = 'besuch'

function AreaRow({ to, name, sub }) {
  return (
    <li>
      <Link to={to} className="families-page-row">
        <span className="families-page-row-text">
          <span className="families-page-row-name">{name}</span>
          {sub && <span className="families-page-row-sub">{sub}</span>}
        </span>
        <Icon name="chevronRight" />
      </Link>
    </li>
  )
}

function AreaSection({ id, title, empty, children }) {
  const hasRows = Array.isArray(children) ? children.length > 0 : Boolean(children)
  return (
    <section className="card families-page-section" aria-labelledby={id}>
      <h2 id={id} className="start-card-title">
        {title}
      </h2>
      {hasRows ? (
        <ul className="families-page-list" role="list">
          {children}
        </ul>
      ) : (
        <p className="muted">{empty}</p>
      )}
    </section>
  )
}

// /familien (Phase W): die Familien des Haushalts (me.memberships, je mit der eigenen Rolle) und die befreundeten Zuhause,
// die er besucht (me.besuche, Entscheidung D3) - jede Zeile führt zur Gruppenseite /familien/:id, das AreaGate wechselt
// dort selbst. Darüber die drei Wege dazu: beitreten, gründen, Code von Freunden eingeben. Läuft im eigenen Zuhause
// (AreaGate), denn Einlösen geht nur von dort.
export default function FamiliesPage({ family, onFamilyChange }) {
  const { words } = useTheme()
  const toast = useToast()
  const [dialog, setDialog] = useState(null)
  const memberships = family.memberships || []
  const visits = family.besuche || []
  const close = () => setDialog(null)

  function handleVisitRedeemed({ gastgeber, me }) {
    onFamilyChange(me)
    close()
    toast(`Verbunden – „${gastgeber.name}“ steht jetzt bei den befreundeten Zuhause.`)
  }

  return (
    <div className="page families-page">
      <header className="page-hero">
        <div>
          <span className="eyebrow">{HOME_LABEL}</span>
          <h1>{words.groups}</h1>
          <p className="page-lede">Eure {words.groups} und die Zuhause, bei denen ihr zu Besuch sein dürft.</p>
        </div>
        <div className="hero-actions">
          <button type="button" className="btn btn-primary" onClick={() => setDialog('join')}>
            {words.group} beitreten
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setDialog('create')}>
            {words.newGroup} gründen
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setDialog(VISIT_DIALOG)}>
            Code von Freunden eingeben
          </button>
        </div>
      </header>

      <div className="families-page-grid">
        <AreaSection id="families-mine-title" title={`Meine ${words.groups}`} empty={words.noGroupConnected}>
          {memberships.map((membership) => (
            <AreaRow key={membership.id} to={groupRoute(membership.id)} name={membership.name} sub={roleLabel(words, membership.rolle)} />
          ))}
        </AreaSection>
        <AreaSection
          id="families-friends-title"
          title="Befreundete Zuhause"
          empty={`Noch bei niemandem zu Besuch. Mit einem Code von Freunden seht ihr deren Tiere und ${words.entries}.`}
        >
          {visits.map((visit) => (
            <AreaRow key={visit.id} to={groupRoute(visit.id)} name={visit.name} sub="Zu Besuch – ansehen und kommentieren" />
          ))}
        </AreaSection>
      </div>

      <Modal open={dialog === 'join' || dialog === 'create'} title={`${words.group} beitreten oder gründen`} onClose={close}>
        {(dialog === 'join' || dialog === 'create') && (
          <JoinFamilyDialog key={dialog} initialTab={dialog} onChange={onFamilyChange} onClose={close} />
        )}
      </Modal>
      <Modal open={dialog === VISIT_DIALOG} title="Code von Freunden eingeben" onClose={close}>
        {dialog === VISIT_DIALOG && <VisitRedeemForm onRedeemed={handleVisitRedeemed} />}
      </Modal>
    </div>
  )
}
