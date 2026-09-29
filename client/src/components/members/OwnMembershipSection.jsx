import { useTheme } from '../../themes/ThemeProvider.jsx'
import LeaveFamilySection from '../LeaveFamilySection.jsx'
import Icon from '../Icon.jsx'

// Die eigene Mitgliedschaft (nur für Haushalte, die der Familie beigetreten sind): normalerweise
// "Familie verlassen" (LeaveFamilySection). Die einzige Leitung kann nicht gehen (der Server antwortet
// mit 409) - sie sieht stattdessen den Hinweis und die beiden Wege: Leitung übergeben (springt zur
// Auswahl weiter oben) oder die Familie auflösen (Dialog).
export default function OwnMembershipSection({ family, lastLeitung, disabled, onFamilyChange, onHandOver, onDissolve }) {
  const { words } = useTheme()

  return (
    <section className="card members-section" aria-labelledby="own-membership-title">
      <h2 id="own-membership-title">Deine Mitgliedschaft</h2>
      {lastLeitung ? (
        <>
          <div className="warning-banner" role="note">
            <Icon name="alert" />
            <div>
              <strong>Du bist die einzige Leitung.</strong>
              <p>Übergib zuerst die Leitung oder löse {words.theGroup} auf – sonst bliebe {words.theGroup} ohne Leitung zurück.</p>
            </div>
          </div>
          <div className="hero-actions">
            <button type="button" className="btn btn-ghost" onClick={onHandOver}>
              <Icon name="logout" />
              Leitung übergeben
            </button>
            <button type="button" className="btn btn-danger" disabled={disabled} onClick={onDissolve}>
              <Icon name="trash" />
              {words.dissolveGroup}
            </button>
          </div>
        </>
      ) : (
        <LeaveFamilySection family={family} onFamilyChange={onFamilyChange} />
      )}
    </section>
  )
}
