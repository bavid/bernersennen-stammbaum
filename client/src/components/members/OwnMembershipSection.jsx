import { useTheme } from '../../themes/ThemeProvider.jsx'
import LeaveFamilySection from '../LeaveFamilySection.jsx'
import Icon from '../Icon.jsx'
import { t } from '../../lib/i18n/index.js'

// Die eigene Mitgliedschaft (nur für Haushalte, die der Familie beigetreten sind): normalerweise
// "Familie verlassen" (LeaveFamilySection). Die einzige Leitung kann nicht gehen (der Server antwortet
// mit 409) - sie sieht stattdessen den Hinweis und die beiden Wege: Leitung übergeben (springt zur
// Auswahl weiter oben) oder die Familie auflösen (Dialog).
export default function OwnMembershipSection({ family, lastLeitung, disabled, onFamilyChange, onHandOver, onDissolve }) {
  const { words } = useTheme()

  return (
    <section className="card members-section" aria-labelledby="own-membership-title">
      <h2 id="own-membership-title">{t('Deine Mitgliedschaft')}</h2>
      {lastLeitung ? (
        <>
          <div className="warning-banner" role="note">
            <Icon name="alert" />
            <div>
              <strong>{t('Du bist die einzige Leitung.')}</strong>
              <p>{t('Übergib zuerst die Leitung oder löse {theGroup} auf – sonst bliebe {theGroup} ohne Leitung zurück.', { theGroup: words.theGroup })}</p>
            </div>
          </div>
          <div className="hero-actions">
            <button type="button" className="btn btn-ghost" onClick={onHandOver}>
              <Icon name="logout" />
              {t('Leitung übergeben')}
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
