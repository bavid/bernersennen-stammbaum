import { useId } from 'react'
import ParentPicker from '../ParentPicker.jsx'
import { dogLabel } from '../../lib/timeline.js'
import { isEditable } from '../../lib/areas.js'
import { choiceTierart } from '../../lib/newAnimal.js'

const BREED_PLACEHOLDER = { hund: 'z. B. Berner Sennenhund oder Mischling', katze: 'z. B. Europäisch Kurzhaar' }

// Inhalt von „Mehr Angaben“ beim Anlegen eines Tiers (QuickAnimalForm): Rasse (Hund, Katze), Geburtstag, „bei uns seit“,
// Beschreibung, Eltern und - ohne festen Mitbewohner - „Lebt mit“. form/onChange: Werte des Formulars.
export default function TierMehrAngaben({ form, onChange, allDogs, ownFamilyId, livesWith }) {
  const ids = { rasse: useId(), geburt: useId(), seit: useId(), text: useId(), mitbewohner: useId() }
  const tierart = choiceTierart(form.art)
  const editableDogs = allDogs.filter(isEditable)
  return (
    <div className="tier-mehr">
      {tierart !== 'anderes' && (
        <div className="field">
          <label className="field-label" htmlFor={ids.rasse}>
            Rasse
          </label>
          <input id={ids.rasse} name="rasse" value={form.rasse} onChange={(e) => onChange({ rasse: e.target.value })} placeholder={BREED_PLACEHOLDER[tierart]} maxLength={120} />
        </div>
      )}
      <div className="tier-mehr-row">
        <div className="field">
          <label className="field-label" htmlFor={ids.geburt}>
            Geburtstag
          </label>
          <input id={ids.geburt} name="geburtsdatum" type="date" value={form.geburtsdatum} onChange={(e) => onChange({ geburtsdatum: e.target.value })} />
        </div>
        <div className="field">
          <label className="field-label" htmlFor={ids.seit}>
            Bei uns seit
          </label>
          <input id={ids.seit} name="beiUnsSeit" type="date" value={form.beiUnsSeit} onChange={(e) => onChange({ beiUnsSeit: e.target.value })} />
        </div>
      </div>
      <div className="field">
        <label className="field-label" htmlFor={ids.text}>
          Beschreibung
        </label>
        <textarea id={ids.text} name="beschreibung" rows={3} value={form.beschreibung} onChange={(e) => onChange({ beschreibung: e.target.value })} maxLength={5000} />
      </div>
      <ParentPicker label="Mutter" sex="huendin" tierart={tierart} dogs={allDogs} value={form.mother} onChange={(mother) => onChange({ mother })} ownFamilyId={ownFamilyId} />
      <ParentPicker label="Vater" sex="ruede" tierart={tierart} dogs={allDogs} value={form.father} onChange={(father) => onChange({ father })} ownFamilyId={ownFamilyId} />
      {!livesWith && editableDogs.length > 0 && (
        <div className="field">
          <label className="field-label" htmlFor={ids.mitbewohner}>
            Lebt mit
          </label>
          <select id={ids.mitbewohner} name="housemateId" value={form.housemateId} onChange={(e) => onChange({ housemateId: e.target.value ? Number(e.target.value) : '' })}>
            <option value="">– niemandem –</option>
            {editableDogs.map((other) => (
              <option key={other.id} value={other.id}>
                {dogLabel(other)}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}
