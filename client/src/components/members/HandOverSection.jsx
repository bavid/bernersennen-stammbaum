import { forwardRef, useState } from 'react'
import { useTheme } from '../../themes/ThemeProvider.jsx'
import useArmed from '../../hooks/useArmed.js'
import Icon from '../Icon.jsx'

// Leitung übergeben (nur Leitung): ein Mitglied wählen, zweistufig bestätigen - danach ist es Leitung
// und man selbst Stellvertretung (server/routes/members.js POST /leitung/:homeId). Mit dem gemeinsamen
// Schlüssel angemeldet (selfDemoted false) wird nur das Ziel befördert. ref zeigt auf die Auswahl, damit
// der Hinweis "einzige Leitung" weiter unten hierher springen kann.
const HandOverSection = forwardRef(function HandOverSection({ members, selfId, selfDemoted, disabled, onHandOver }, ref) {
  const { words } = useTheme()
  const [targetId, setTargetId] = useState('')
  const [armed, setArmed] = useArmed()
  const [saving, setSaving] = useState(false)
  const candidates = members.filter((member) => member.familyId !== selfId)
  const target = candidates.find((member) => String(member.familyId) === targetId)

  async function handleClick() {
    if (!armed) {
      setArmed(true)
      return
    }
    setSaving(true)
    try {
      await onHandOver(target)
      setTargetId('')
    } finally {
      setSaving(false)
      setArmed(false)
    }
  }

  return (
    <section className="card members-section" aria-labelledby="handover-title">
      <h2 id="handover-title">Leitung übergeben</h2>
      <p className="muted">
        Wer die Leitung bekommt, ist danach {words.roleLeitung}
        {selfDemoted ? ` – du selbst bist dann ${words.roleStellvertretung}.` : '.'} Nur die Leitung ändert Rollen, Name und
        Aussehen und kann {words.theGroup} auflösen.
      </p>
      {candidates.length === 0 ? (
        <p className="field-hint">Noch kein anderes Mitglied da, an das du übergeben könntest.</p>
      ) : (
        <>
          <div className="field">
            <label className="field-label" htmlFor="handover-target">
              An wen?
            </label>
            <select
              id="handover-target"
              ref={ref}
              value={targetId}
              disabled={disabled}
              onChange={(event) => {
                setTargetId(event.target.value)
                setArmed(false)
              }}
            >
              <option value="">Bitte wählen …</option>
              {candidates.map((member) => (
                <option key={member.familyId} value={String(member.familyId)}>
                  {member.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className={`btn ${armed ? 'btn-warning' : 'btn-ghost'}`}
            disabled={disabled || saving || !target}
            onClick={handleClick}
          >
            <Icon name={armed ? 'check' : 'logout'} />
            {saving ? 'Übergebe …' : armed ? `Ja, an „${target.name}“ übergeben` : 'Leitung übergeben'}
          </button>
        </>
      )}
    </section>
  )
})

export default HandOverSection
