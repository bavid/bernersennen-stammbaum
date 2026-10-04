import { forwardRef } from 'react'
import { useTheme } from '../../themes/ThemeProvider.jsx'
import Icon from '../Icon.jsx'
import HandOverSection from './HandOverSection.jsx'
import FamilyKeySection from './FamilyKeySection.jsx'

// Was nur die Leitung braucht und selten: Leitung übergeben, Familie auflösen, den Schlüssel der Familie erneuern.
// collapsed (Phase W, Reiter "Mitglieder" der Gruppenseite): zusammengeklappt unter einer Zeile, damit der Reiter kurz
// bleibt - open/onToggle steuert MembersPage (öffnet ihn z. B. für "Übergib zuerst die Leitung"). ref: der Abschnitt
// "Leitung übergeben" (Fokus).
const LeitungTools = forwardRef(function LeitungTools(
  { collapsed, open, onToggle, family, members, selfId, isHousehold, disabled, onHandOver, onDissolve },
  ref
) {
  const { words } = useTheme()
  const sections = (
    <>
      <HandOverSection ref={ref} members={members} selfId={selfId} selfDemoted={isHousehold} disabled={disabled} onHandOver={onHandOver} />
      <section className="card members-section members-danger" aria-labelledby="dissolve-title">
        <h2 id="dissolve-title">{words.dissolveGroup}</h2>
        <p className="muted">
          Löscht {words.theGroup} mit {words.treeLabel}, Pinnwand und Einladungen. Geht nur, wenn {words.theGroup} keine eigenen
          Tiere mehr hat – die übernimmst du vorher in deine Chronik.
        </p>
        <button type="button" className="btn btn-danger" disabled={disabled} onClick={onDissolve}>
          <Icon name="trash" />
          {words.dissolveGroup} …
        </button>
      </section>
      {isHousehold && <FamilyKeySection family={family} disabled={disabled} />}
    </>
  )
  if (!collapsed) return sections
  return (
    <details className="members-tools" open={open} onToggle={(event) => onToggle(event.currentTarget.open)}>
      <summary className="members-tools-summary">
        Für die {words.roleLeitung}: Leitung übergeben, Schlüssel, {words.dissolveGroup}
      </summary>
      <div className="members-tools-body">{sections}</div>
    </details>
  )
})

export default LeitungTools
