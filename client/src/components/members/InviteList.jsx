import RoleBadge from '../RoleBadge.jsx'
import RoleSelect from '../RoleSelect.jsx'
import ConfirmButton from '../ConfirmButton.jsx'
import Icon from '../Icon.jsx'
import { formatDateShort } from '../../lib/dates.js'

// Offene Einladungen in die Familie (ab Stellvertretung, server/routes/members.js einladungen): nur der
// Hinweis auf den Code (die letzten vier Zeichen) - den Code selbst gibt es im Einladen-Dialog. Die Rolle
// lässt sich hier noch ändern (options: was die eigene Rolle vergeben darf), Widerrufen macht den Code
// ungültig. onInvite öffnet den Einladen-Dialog (InviteDialog, mit den Codes).
export default function InviteList({ einladungen, options, disabled, onRoleChange, onRevoke, onInvite }) {
  return (
    <section className="card members-section" aria-labelledby="invites-title">
      <div className="members-section-head">
        <h2 id="invites-title">Offene Einladungen</h2>
        <button type="button" className="btn btn-primary" onClick={onInvite}>
          <Icon name="send" />
          Mitglied einladen
        </button>
      </div>
      <p className="muted">
        Wer eine Einladung einlöst, bekommt ein eigenes Zuhause und tritt mit der eingestellten Rolle bei. Die Rolle lässt
        sich später hier ändern.
      </p>
      {einladungen.length === 0 ? (
        <p className="field-hint">Gerade keine offene Einladung.</p>
      ) : (
        <ul className="member-list invite-list">
          {einladungen.map((invite) => (
            <li key={invite.id} className="member-row">
              <div className="member-row-main">
                <span className="voucher-code">…{invite.hinweis}</span>
                <RoleBadge rolle={invite.rolle} />
                <span className="member-row-meta">
                  {invite.ablauf ? `gültig bis ${formatDateShort(invite.ablauf)}` : 'ohne Ablauf'}
                </span>
              </div>
              <div className="member-row-actions">
                <RoleSelect
                  value={invite.rolle}
                  options={options}
                  disabled={disabled}
                  ariaLabel={`Rolle der Einladung …${invite.hinweis}`}
                  onChange={(rolle) => onRoleChange(invite, rolle)}
                />
                <ConfirmButton
                  onConfirm={() => onRevoke(invite)}
                  label="Widerrufen"
                  confirmLabel="Wirklich widerrufen?"
                  ariaLabel={`Einladung …${invite.hinweis} widerrufen`}
                  disabled={disabled}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
