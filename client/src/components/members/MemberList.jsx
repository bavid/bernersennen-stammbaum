import { useState } from 'react'
import { useTheme } from '../../themes/ThemeProvider.jsx'
import RoleBadge from '../RoleBadge.jsx'
import RoleSelect from '../RoleSelect.jsx'
import Icon from '../Icon.jsx'
import { ROLES, isLastLeitung } from '../../lib/roles.js'
import { formatDateShort } from '../../lib/dates.js'

const LAST_LEITUNG_HINT = 'Es muss immer eine Leitung geben.'

function sharedLabel(count) {
  return count === 1 ? '1 geteiltes Tier' : `${count} geteilte Tiere`
}

// Eine Zeile: Name, Rolle, seit wann, wie viele Tiere hierher geteilt. Die Leitung (canManage) bekommt
// die Rollenauswahl - außer für die letzte Leitung, die zeigt den Hinweis - und "Entfernen" für alle
// außer sich selbst. Das Entfernen bestätigt man in einer eingeblendeten Erklärung: die geteilten Tiere
// verschwinden aus der Familie, bleiben aber in der Chronik des Haushalts.
function MemberRow({ member, isSelf, isLast, canManage, disabled, onRoleChange, onRemove }) {
  const { words } = useTheme()
  const [confirming, setConfirming] = useState(false)
  const hintId = `member-${member.familyId}-last-hint`

  return (
    <li className="member-row">
      <div className="member-row-main">
        <strong>{member.name}</strong>
        {isSelf && <span className="muted">(ich)</span>}
        <RoleBadge rolle={member.rolle} />
        <span className="member-row-meta">
          seit {formatDateShort(member.seit)} · {sharedLabel(member.geteilteTiere)}
        </span>
      </div>
      {canManage && (
        <div className="member-row-actions">
          {isLast ? (
            <span className="field-hint" id={hintId}>
              {LAST_LEITUNG_HINT}
            </span>
          ) : (
            <RoleSelect
              value={member.rolle}
              options={ROLES}
              disabled={disabled}
              ariaLabel={`Rolle von „${member.name}“`}
              onChange={(rolle) => onRoleChange(member, rolle)}
            />
          )}
          {!isSelf && !confirming && (
            <button type="button" className="btn btn-danger" disabled={disabled} onClick={() => setConfirming(true)}>
              <Icon name="trash" />
              Entfernen
            </button>
          )}
        </div>
      )}
      {confirming && (
        <div className="member-remove-confirm" role="group" aria-label={`„${member.name}“ entfernen`}>
          <p>
            „{member.name}“ aus {words.yourGroupDat} entfernen? Die geteilten Tiere verschwinden aus {words.yourGroupDat},
            bleiben aber in der Chronik dieses Haushalts.
          </p>
          <div className="form-actions">
            <span className="form-actions-spacer" />
            <button type="button" className="btn btn-ghost" onClick={() => setConfirming(false)}>
              Abbrechen
            </button>
            <button
              type="button"
              className="btn btn-danger is-armed"
              disabled={disabled}
              onClick={() => {
                setConfirming(false)
                onRemove(member)
              }}
            >
              <Icon name="trash" />
              Ja, entfernen
            </button>
          </div>
        </div>
      )}
    </li>
  )
}

// Mitgliederliste der Familie (server/routes/members.js GET, Leitung zuerst). selfId: die eigene Identität
// (Zuhause) - fehlt bei Anmeldung mit dem gemeinsamen Schlüssel, dann steht niemand als "(ich)" da.
export default function MemberList({ mitglieder, selfId, canManage, disabled, onRoleChange, onRemove }) {
  return (
    <ul className="member-list">
      {mitglieder.map((member) => (
        <MemberRow
          key={member.familyId}
          member={member}
          isSelf={member.familyId === selfId}
          isLast={isLastLeitung(member, mitglieder)}
          canManage={canManage}
          disabled={disabled}
          onRoleChange={onRoleChange}
          onRemove={onRemove}
        />
      ))}
    </ul>
  )
}
