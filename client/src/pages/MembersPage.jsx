import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useTheme } from '../themes/ThemeProvider.jsx'
import { useIsDemo } from '../lib/demo.js'
import { startRoute } from '../lib/areas.js'
import { ROLES, inviteRoleOptions, isLastLeitung, rank, roleLabel, roleOf } from '../lib/roles.js'
import { useToast } from '../components/Toast.jsx'
import Icon from '../components/Icon.jsx'
import Modal from '../components/Modal.jsx'
import RoleBadge from '../components/RoleBadge.jsx'
import InviteDialog from '../components/InviteDialog.jsx'
import VisibilityCard from '../components/members/VisibilityCard.jsx'
import MemberList from '../components/members/MemberList.jsx'
import HandOverSection from '../components/members/HandOverSection.jsx'
import InviteList from '../components/members/InviteList.jsx'
import OwnMembershipSection from '../components/members/OwnMembershipSection.jsx'
import DissolveFamilyDialog from '../components/members/DissolveFamilyDialog.jsx'
import FamilyKeySection from '../components/members/FamilyKeySection.jsx'

const DEMO_HINT = 'In der Demo nicht möglich.'

// Mitglieder & Rollen einer Familie (/mitglieder, Phase R Task 4; nur für art 'rudel', siehe AreaRoutes).
// Die Daten kommen aus GET /api/family/members; jede Änderung antwortet mit demselben Aufbau (oder 204,
// dann wird neu geladen). ichBin aus der Antwort ist die eigene Rolle - ändert sie sich (Leitung
// übergeben, sich selbst herabstufen), zieht "me" über onFamilyChange mit, damit Kopf, Bereichswechsler
// und die übrigen Seiten die neue Rolle kennen. In der Demo ist alles sichtbar, Schreiben gesperrt.
export default function MembersPage({ family, onFamilyChange }) {
  const { words } = useTheme()
  const isDemo = useIsDemo()
  const navigate = useNavigate()
  const toast = useToast()
  const [data, setData] = useState(undefined)
  const [error, setError] = useState(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [dissolveOpen, setDissolveOpen] = useState(false)
  const handOverRef = useRef(null)

  const load = useCallback(async () => {
    setData(await api.familyMembers())
  }, [])

  useEffect(() => {
    load().catch((err) => setError(err.message))
  }, [load])

  const myRole = data?.ichBin ?? roleOf(family)
  const isLeitung = rank(myRole) >= rank('leitung')
  const canInvite = rank(myRole) >= rank('stellvertretung')
  // Ein Haushalt, der beigetreten ist - nicht die Anmeldung mit dem gemeinsamen Schlüssel der Familie.
  const isHousehold = family.home?.art === 'zuhause' && family.home.id !== family.id
  const selfId = isHousehold ? family.home.id : null
  const mitglieder = data?.mitglieder || []
  const self = mitglieder.find((member) => member.familyId === selfId)
  const lastLeitung = Boolean(self && isLastLeitung(self, mitglieder))
  const sharedTotal = mitglieder.reduce((sum, member) => sum + (member.geteilteTiere || 0), 0)

  // Antwort einer Änderung übernehmen - die eigene Rolle (ichBin) ins "me", falls sie sich geändert hat.
  function applyPayload(payload) {
    setData(payload)
    if (payload.ichBin && payload.ichBin !== family.role) {
      onFamilyChange?.({
        ...family,
        role: payload.ichBin,
        memberships: (family.memberships || []).map((m) => (m.id === family.id ? { ...m, rolle: payload.ichBin } : m))
      })
    }
  }

  async function run(action, message) {
    setError(null)
    try {
      const payload = await action()
      if (payload) applyPayload(payload)
      else await load()
      if (message) toast(message)
    } catch (err) {
      setError(err.message)
    }
  }

  const handleRoleChange = (member, rolle) =>
    run(() => api.setMemberRole(member.familyId, rolle), `„${member.name}“ ist jetzt ${roleLabel(words, rolle)}.`)
  const handleRemove = (member) => run(() => api.removeMember(member.familyId), `„${member.name}“ ist nicht mehr dabei.`)
  const handleHandOver = (member) =>
    run(() => api.handOverLeitung(member.familyId), `„${member.name}“ hat jetzt die Leitung.`)
  // PUT /vouchers/:id/rolle antwortet nur mit { id, rolle } - run() lädt danach die Liste neu (null).
  const handleInviteRole = (invite, rolle) => run(() => api.setVoucherRole(invite.id, rolle).then(() => null))
  const handleRevoke = (invite) => run(() => api.revokeInvite(invite.id), 'Einladung widerrufen.')

  // Aufgelöst: ein Mitglied landet in seinem Zuhause (me), der gemeinsame Schlüssel verliert seine Sitzung.
  function handleDissolved(me) {
    setDissolveOpen(false)
    if (!me) {
      window.location.assign('/')
      return
    }
    onFamilyChange?.(me)
    navigate(startRoute(me))
    toast(`„${family.name}“ wurde aufgelöst.`)
  }

  function focusHandOver() {
    handOverRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    handOverRef.current?.focus()
  }

  function closeInvite() {
    setInviteOpen(false)
    load().catch((err) => setError(err.message))
  }

  return (
    <div className="page members-page">
      <header className="page-hero">
        <div>
          <span className="eyebrow">{words.group}</span>
          <div className="page-title-row">
            <h1>Mitglieder</h1>
            <RoleBadge rolle={myRole} className="members-my-role" />
          </div>
          <p className="page-lede">
            Wer zu „{family.name}“ gehört – und wer was darf. {words.groupNeverPublic}
          </p>
          <p className="hero-hint">
            <Link to="/stammbaum">← Zum Stammbaum</Link>
          </p>
        </div>
        {data && (
          <div className="page-hero-side">
            <dl className="stats">
              <div>
                <dt>{mitglieder.length === 1 ? 'Mitglied' : 'Mitglieder'}</dt>
                <dd>{mitglieder.length}</dd>
              </div>
              <div>
                <dt>geteilte Tiere</dt>
                <dd>{sharedTotal}</dd>
              </div>
            </dl>
          </div>
        )}
      </header>

      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {isDemo && <p className="field-hint members-demo-hint">{DEMO_HINT}</p>}

      <VisibilityCard />

      <section className="card members-section" aria-labelledby="members-title">
        <h2 id="members-title">Wer dazugehört</h2>
        {data === undefined && !error && <p className="muted">Lade …</p>}
        {data && mitglieder.length === 0 && <p className="muted">Noch niemand ist beigetreten.</p>}
        {mitglieder.length > 0 && (
          <MemberList
            mitglieder={mitglieder}
            selfId={selfId}
            canManage={isLeitung}
            disabled={isDemo}
            onRoleChange={handleRoleChange}
            onRemove={handleRemove}
          />
        )}
        {isLeitung && data && (
          <p className="field-hint">
            Rollen: {ROLES.map((rolle) => roleLabel(words, rolle)).join(' · ')} – jede Rolle darf, was die vorherige darf,
            und mehr.
          </p>
        )}
      </section>

      {isLeitung && data && (
        <HandOverSection
          ref={handOverRef}
          members={mitglieder}
          selfId={selfId}
          selfDemoted={isHousehold}
          disabled={isDemo}
          onHandOver={handleHandOver}
        />
      )}

      {canInvite && data && (
        <InviteList
          einladungen={data.einladungen || []}
          options={inviteRoleOptions(myRole)}
          disabled={isDemo}
          onRoleChange={handleInviteRole}
          onRevoke={handleRevoke}
          onInvite={() => setInviteOpen(true)}
        />
      )}

      {isHousehold && data && (
        <OwnMembershipSection
          family={family}
          lastLeitung={lastLeitung}
          disabled={isDemo}
          onFamilyChange={onFamilyChange}
          onHandOver={focusHandOver}
          onDissolve={() => setDissolveOpen(true)}
        />
      )}

      {isLeitung && data && (
        <section className="card members-section members-danger" aria-labelledby="dissolve-title">
          <h2 id="dissolve-title">{words.dissolveGroup}</h2>
          <p className="muted">
            Löscht {words.theGroup} mit Stammbaum, Pinnwand und Einladungen. Geht nur, wenn {words.theGroup} keine eigenen
            Tiere mehr hat – die übernimmst du vorher in deine Chronik.
          </p>
          <button type="button" className="btn btn-danger" disabled={isDemo} onClick={() => setDissolveOpen(true)}>
            <Icon name="trash" />
            {words.dissolveGroup} …
          </button>
        </section>
      )}

      {isLeitung && isHousehold && data && <FamilyKeySection family={family} disabled={isDemo} />}

      <Modal open={inviteOpen} title="Jemanden einladen" onClose={closeInvite}>
        {inviteOpen && <InviteDialog family={family} />}
      </Modal>
      <Modal open={dissolveOpen} title={words.dissolveGroup} onClose={() => setDissolveOpen(false)}>
        {dissolveOpen && <DissolveFamilyDialog family={family} onDissolved={handleDissolved} onClose={() => setDissolveOpen(false)} />}
      </Modal>
    </div>
  )
}
