import ErlebtMitRequests from '../erlebtMit/ErlebtMitRequests.jsx'
import NewGuestsNotice from '../visits/NewGuestsNotice.jsx'
import { withErlebtMitOffen } from '../../lib/erlebtMit.js'
import { isOwnHome } from '../../lib/visits.js'

const countOf = (value) => (Number.isInteger(value) && value > 0 ? value : 0)

// "Für dich" auf Start (Phase W, vorher oben auf den Wegbegleitern): was das eigene Zuhause beantworten soll - neue Gäste
// (security-review V2 M-3: bleiben, bis „Passt“ oder „Gast entfernen“) und offene „Mit dabei“-Anfragen. Nur, wenn /me
// welche meldet - sonst keine zusätzliche Anfrage und kein leerer Kasten. onFamilyChange: setFamily aus App.jsx (die
// Zahlen am Badge von "Start"); onOpenPhoto: Foto groß.
export default function ForYou({ family, onFamilyChange, onOpenPhoto }) {
  const guests = isOwnHome(family) ? countOf(family.neueGaeste) : 0
  const requests = isOwnHome(family) ? countOf(family.erlebtMitOffen) : 0
  if (guests + requests === 0) return null
  return (
    <section className="start-foryou" aria-labelledby="start-foryou-title">
      <h2 id="start-foryou-title" className="start-card-title">
        Für dich <span className="start-count">{guests + requests}</span>
      </h2>
      {guests > 0 && <NewGuestsNotice onFamilyChange={onFamilyChange} />}
      {requests > 0 && (
        <ErlebtMitRequests
          onOpenPhoto={onOpenPhoto}
          onCountChange={(offen) => onFamilyChange?.((current) => withErlebtMitOffen(current, offen))}
        />
      )}
    </section>
  )
}
