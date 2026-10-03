import { CONTACT_FIELDS, MAX_KURZTEXT_LENGTH, availableContacts } from '../../lib/visitenkarte.js'
import { MAX_WIDMUNG_LENGTH } from '../../lib/einladungskarte.js'

// Inhalt der Karte (Phase V5): Kurztext (höchstens 120 Zeichen, Vorschlag aus dem Portal) und welche Angaben aus dem
// Profil auf der Karte stehen - Ansprechperson und Website/Telefon/E-Mail lassen sich nur schalten, wenn sie im Profil
// eingetragen sind. Name, Logo und Kontaktdaten selbst pflegt der Partner im Profil. mitWidmung (Einladungskarte): dazu
// die persönliche Zeile über dem Namen (höchstens 80 Zeichen, leer = keine).

function Widmung({ value, onChange }) {
  return (
    <div className="field">
      <label className="vk-label" htmlFor="vk-widmung">
        Persönliche Zeile <span className="muted">(optional)</span>
      </label>
      <input
        id="vk-widmung"
        type="text"
        value={value}
        maxLength={MAX_WIDMUNG_LENGTH}
        placeholder="z. B. Für unsere Welpenkurs-Familien"
        onChange={(event) => onChange({ widmung: event.target.value })}
        aria-describedby="vk-widmung-hint"
      />
      <p id="vk-widmung-hint" className="field-hint">
        {value.length}/{MAX_WIDMUNG_LENGTH} Zeichen · steht über eurem Namen
      </p>
    </div>
  )
}

function Toggle({ id, checked, onChange, children }) {
  return (
    <label className="check vk-toggle" htmlFor={id}>
      <input id={id} type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{children}</span>
    </label>
  )
}

export default function VisitenkarteInhalt({ design, profile, vorschlag, onChange, mitWidmung = false }) {
  const contacts = availableContacts(profile)
  const kurztextLength = design.kurztext.length
  const hasPerson = Boolean(profile.ansprechperson?.trim())

  return (
    <fieldset className="vk-fieldset">
      <legend className="field-label">Inhalt</legend>
      {mitWidmung && <Widmung value={design.widmung} onChange={onChange} />}
      <div className="field">
        <label className="vk-label" htmlFor="vk-kurztext">
          Kurztext
        </label>
        <input
          id="vk-kurztext"
          type="text"
          value={design.kurztext}
          maxLength={MAX_KURZTEXT_LENGTH}
          onChange={(event) => onChange({ kurztext: event.target.value })}
          aria-describedby="vk-kurztext-hint"
        />
        <p id="vk-kurztext-hint" className="field-hint vk-kurztext-hint">
          <span>
            {kurztextLength}/{MAX_KURZTEXT_LENGTH} Zeichen
          </span>
          {vorschlag && design.kurztext !== vorschlag && (
            <button type="button" className="vk-textlink" onClick={() => onChange({ kurztext: vorschlag })}>
              Aus dem Portal übernehmen
            </button>
          )}
        </p>
      </div>

      <div className="vk-toggles" role="group" aria-label="Angaben auf der Karte">
        {hasPerson ? (
          <Toggle id="vk-person" checked={design.zeigeAnsprechperson} onChange={(value) => onChange({ zeigeAnsprechperson: value })}>
            Ansprechperson ({profile.ansprechperson.trim()})
          </Toggle>
        ) : (
          <p className="field-hint">Eine Ansprechperson tragt ihr im Profil unter „Angaben“ ein.</p>
        )}
        {CONTACT_FIELDS.filter((contact) => contacts.includes(contact.key)).map((contact) => (
          <Toggle
            key={contact.key}
            id={`vk-${contact.key}`}
            checked={design[contact.toggle]}
            onChange={(value) => onChange({ [contact.toggle]: value })}
          >
            {contact.label}
          </Toggle>
        ))}
        {contacts.length === 0 && <p className="field-hint">Website, Telefon oder E-Mail ergänzt ihr im Profil – dann stehen sie hier zur Wahl.</p>}
      </div>
    </fieldset>
  )
}
