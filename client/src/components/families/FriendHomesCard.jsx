import Avatar from '../Avatar.jsx'
import FamilyGroupHead from './FamilyGroupHead.jsx'
import { useTheme } from '../../themes/ThemeProvider.jsx'
import { displayName } from '../../lib/timeline.js'

// Befreundete Zuhause (Besuche aus Phase V2): je Zuhause die Namen seiner Tiere - nur, was die "Erlebt mit"-Liste
// ohnehin zeigt (kein Foto, keine Tierseite). "Besuchen" nur dort, wo ihr zu Besuch sein dürft.
export default function FriendHomesCard({ homes, onVisit }) {
  const { words } = useTheme()
  return (
    <section className="family-group card is-freunde" aria-labelledby="family-group-freunde">
      <FamilyGroupHead
        id="family-group-freunde"
        kind="freunde"
        title="Befreundete Zuhause"
        meta="Zuhause, die ihr besucht oder die euch besuchen"
      />
      <ul className="friend-homes">
        {homes.map((home) => (
          <li key={home.id} className="friend-home">
            <div className="friend-home-head">
              <h3>{home.name}</h3>
              {home.canVisit && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => onVisit(home.id, home.name)}
                  aria-label={`${home.name} besuchen`}
                >
                  Besuchen
                </button>
              )}
            </div>
            {home.tiere.length > 0 ? (
              <ul className="chip-list" aria-label={`${words.animals} von ${home.name}`}>
                {home.tiere.map((tier) => (
                  <li key={tier.id}>
                    <span className="chip is-static">
                      <Avatar dog={tier} size={24} />
                      {displayName(tier)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">Noch keine {words.animals} eingetragen.</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
