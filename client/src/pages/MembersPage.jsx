import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useTheme } from '../themes/ThemeProvider.jsx'
import { useIsDemo, useReadOnlyHint } from '../lib/demo.js'
import { startRoute } from '../lib/areas.js'
import { ROLES, inviteRoleOptions, isLastLeitung, rank, roleLabel, roleOf } from '../lib/roles.js'
import { useToast } from '../components/Toast.jsx'
import Modal from '../components/Modal.jsx'
import MembersHero from '../components/members/MembersHero.jsx'
import InviteDialog from '../components/InviteDialog.jsx'
import VisibilityCard from '../components/members/VisibilityCard.jsx'
import MemberList from '../components/members/MemberList.jsx'
import LeitungTools from '../components/members/LeitungTools.jsx'
import InviteList from '../components/members/InviteList.jsx'
import OwnMembershipSection from '../components/members/OwnMembershipSection.jsx'
import DissolveFamilyDialog from '../components/members/DissolveFamilyDialog.jsx'


// Mitglieder & Rollen einer Familie (/mitglieder, Phase R Task 4; nur für art 'rudel', siehe AreaRoutes).
// Die Daten kommen aus GET /api/family/members; jede Änderung antwortet mit demselben Aufbau (oder 204,
// dann wird neu geladen). ichBin aus der Antwort ist die eigene Rolle - ändert sie sich (Leitung
// übergeben, sich selbst herabstufen), zieht "me" über onFamilyChange mit, damit Kopf, Bereichswechsler
// und die übrigen Seiten die neue Rolle kennen. In der Demo ist alles sichtbar, Schreiben gesperrt.
// embedded (Phase W): als Reiter "Mitglieder" der Gruppenseite - ohne eigenen Seitenkopf.
export default function MembersPage({ family, onFamilyChange, embedded = false }) {
  const { words } = useTheme()
  const isDemo = useIsDemo()
  const readOnlyHint = useReadOnlyHint()
  const navigate = useNavigate()
  const toast = useToast()
  const [data, setData] = useState(undefined)
  const [error, setError] = useState(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [dissolveOpen, setDissolveOpen] = useState(false)
  const [toolsOpen, setToolsOpen] = useState(false)
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

  // Laufende Nummer je Aktion: Kommen zwei Änderungen kurz nacheinander, zählt nur die Antwort der letzten -
  // eine verspätete ältere Antwort darf den neueren Stand nicht überschreiben.
  const runId = useRef(0)
  async function run(action, message) {
    const id = ++runId.current
    setError(null)
    try {
      const payload = await action()
      if (id !== runId.current) return
      if (payload) applyPayload(payload)
      else {
        const fresh = await api.familyMembers()
        if (id !== runId.current) return
        setData(fresh)
      }
      if (message) toast(message)
    } catch (err) {
      if (id === runId.current) setError(err.message)
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

  // "Übergib zuerst die Leitung": dorthin springen - auf der Gruppenseite erst den zugeklappten Bereich der Leitung öffnen.
  const pendingHandOver = useRef(false)
  function revealHandOver() {
    handOverRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    handOverRef.current?.focus()
  }
  function focusHandOver() {
    if (!embedded || toolsOpen) {
      revealHandOver()
      return
    }
    pendingHandOver.current = true
    setToolsOpen(true)
  }
  useEffect(() => {
    if (!toolsOpen || !pendingHandOver.current) return
    pendingHandOver.current = false
    revealHandOver()
  }, [toolsOpen])

  function closeInvite() {
    setInviteOpen(false)
    load().catch((err) => setError(err.message))
  }

  return (
    <div className={embedded ? 'members-page members-embedded' : 'page members-page'}>
      {embedded ? (
        isDemo && <p className="field-hint members-demo-hint">{readOnlyHint}</p>
      ) : (
        <MembersHero
          family={family}
          myRole={myRole}
          stats={data ? { mitglieder: mitglieder.length, geteilt: sharedTotal } : null}
          demoHint={isDemo ? readOnlyHint : null}
        />
      )}

      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      <VisibilityCard collapsed={embedded} />

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
        <LeitungTools
          ref={handOverRef}
          collapsed={embedded}
          open={toolsOpen}
          onToggle={setToolsOpen}
          family={family}
          members={mitglieder}
          selfId={selfId}
          isHousehold={isHousehold}
          disabled={isDemo}
          onHandOver={handleHandOver}
          onDissolve={() => setDissolveOpen(true)}
        />
      )}

      <Modal open={inviteOpen} title="Jemanden einladen" onClose={closeInvite}>
        {inviteOpen && <InviteDialog family={family} />}
      </Modal>
      <Modal open={dissolveOpen} title={words.dissolveGroup} onClose={() => setDissolveOpen(false)}>
        {dissolveOpen && <DissolveFamilyDialog family={family} onDissolved={handleDissolved} onClose={() => setDissolveOpen(false)} />}
      </Modal>
    </div>
  )
}
