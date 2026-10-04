import { useState } from 'react'
import { api } from '../api'
import { useTheme } from '../themes/ThemeProvider.jsx'
import { useIsDemo, useReadOnlyHint } from '../lib/demo.js'
import { ROLES, inviteRoleOptions, roleLabel } from '../lib/roles.js'
import useFamilyMembers from '../hooks/useFamilyMembers.js'
import Modal from '../components/Modal.jsx'
import MembersHero from '../components/members/MembersHero.jsx'
import InviteDialog from '../components/InviteDialog.jsx'
import VisibilityCard from '../components/members/VisibilityCard.jsx'
import MemberList from '../components/members/MemberList.jsx'
import InviteList from '../components/members/InviteList.jsx'

// Reiter "Mitglieder" der Gruppenseite (embedded) bzw. beim klassischen Familien-Login die Seite /mitglieder (Phase R,
// Phase W Schritt 2 verdichtet): "Wer dazugehört" (Liste mit Rollen - die Leitung ändert Rollen und entfernt Mitglieder),
// die offenen Einladungen mit "Mitglied einladen" (ab Stellvertretung) und zum Aufklappen "Wer sieht was?". Leitung
// übergeben, Schlüssel, Verlassen, Auflösen, Name und Aussehen stehen in Einstellungen › Familien › [Familie]
// (components/settings/FamilyManage.jsx). In der Demo ist alles sichtbar, Schreiben gesperrt.
export default function MembersPage({ family, onFamilyChange, embedded = false }) {
  const { words } = useTheme()
  const isDemo = useIsDemo()
  const readOnlyHint = useReadOnlyHint()
  const members = useFamilyMembers(family, onFamilyChange)
  const { data, error, run, myRole, isLeitung, canInvite, selfId, mitglieder } = members
  const [inviteOpen, setInviteOpen] = useState(false)
  const sharedTotal = mitglieder.reduce((sum, member) => sum + (member.geteilteTiere || 0), 0)

  const handleRoleChange = (member, rolle) =>
    run(() => api.setMemberRole(member.familyId, rolle), `„${member.name}“ ist jetzt ${roleLabel(words, rolle)}.`)
  const handleRemove = (member) => run(() => api.removeMember(member.familyId), `„${member.name}“ ist nicht mehr dabei.`)
  // PUT /vouchers/:id/rolle antwortet nur mit { id, rolle } - run() lädt danach die Liste neu (null).
  const handleInviteRole = (invite, rolle) => run(() => api.setVoucherRole(invite.id, rolle).then(() => null))
  const handleRevoke = (invite) => run(() => api.revokeInvite(invite.id), 'Einladung widerrufen.')

  function closeInvite() {
    setInviteOpen(false)
    members.reload()
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

      <VisibilityCard collapsed />

      <Modal open={inviteOpen} title="Mitglied einladen" onClose={closeInvite}>
        {inviteOpen && <InviteDialog family={family} />}
      </Modal>
    </div>
  )
}
