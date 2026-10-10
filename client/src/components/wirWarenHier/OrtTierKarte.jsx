import { useEffect, useId, useRef, useState } from 'react'
import Icon from '../Icon.jsx'
import Modal from '../Modal.jsx'
import { formatDateLong } from '../../lib/dates.js'
import { speciesLabel } from '../../lib/timeline.js'
import { WWH } from '../../lib/wirWarenHierText.js'
import { t } from '../../lib/i18n/index.js'

const PHOTO_SIZE = 64

// Dialog „Kontakt zu {Name}“: erklärt in zwei Sätzen, was passiert, und fragt bei mehreren eigenen Tieren, mit welchem.
function KontaktDialog({ open, tier, eigeneTiere, onClose, onSend }) {
  const selectId = useId()
  const [choice, setChoice] = useState('')
  const dogId = eigeneTiere.some((dog) => String(dog.dogId) === choice) ? Number(choice) : eigeneTiere[0]?.dogId

  async function handleSubmit(event) {
    event.preventDefault()
    if (dogId && (await onSend(tier.checkinId, dogId, tier.tierName))) onClose()
  }

  return (
    <Modal open={open} title={t(WWH.kontaktTitel, { name: tier.tierName })} onClose={onClose}>
      <form className="wwh-dialog" onSubmit={handleSubmit}>
        <p>{t(WWH.kontaktErklaerung, { name: tier.tierName })}</p>
        {eigeneTiere.length > 1 && (
          <div className="field">
            <label className="field-label" htmlFor={selectId}>
              {t(WWH.mitWelchemTier)}
            </label>
            <select id={selectId} value={dogId} onChange={(event) => setChoice(event.target.value)} data-autofocus>
              {eigeneTiere.map((dog) => (
                <option key={dog.dogId} value={dog.dogId}>
                  {dog.tierName}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t(WWH.abbrechen)}
          </button>
          <button type="submit" className="btn btn-primary">
            {t(WWH.anfrageSenden)}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// Ein Tier einer anderen Familie am selben Ort: nur Name, Tierart, Foto und die freigegebenen angehefteten Erinnerungen
// (mehr liefert der Server nicht). „Kontakt anfragen“ öffnet den Dialog; danach kehrt der Fokus zum Knopf zurück.
export default function OrtTierKarte({ tier, eigeneTiere, angefragt = false, disabled = false, onRequest }) {
  const [open, setOpen] = useState(false)
  const trigger = useRef(null)
  const wasOpen = useRef(false)

  useEffect(() => {
    if (wasOpen.current && !open) trigger.current?.focus()
    wasOpen.current = open
  }, [open])

  return (
    <li className="wwh-tier card">
      <div className="wwh-tier-head">
        {tier.fotoUrl ? (
          <img className="wwh-tier-photo" src={tier.fotoUrl} alt="" width={PHOTO_SIZE} height={PHOTO_SIZE} loading="lazy" />
        ) : (
          <span className="wwh-tier-photo is-empty" aria-hidden="true">
            <Icon name="paw" />
          </span>
        )}
        <div>
          <h4 className="wwh-tier-name">{tier.tierName}</h4>
          <p className="wwh-tier-art">{speciesLabel(tier.tierart)}</p>
        </div>
      </div>
      {tier.erinnerungen.length > 0 && (
        <ul className="wwh-tier-pins" role="list">
          {tier.erinnerungen.map((pin, index) => (
            <li key={`${pin.datum}-${index}`}>
              <span className="wwh-pin-title">{pin.titel}</span> <span className="wwh-pin-meta">{formatDateLong(pin.datum)}</span>
            </li>
          ))}
        </ul>
      )}
      {angefragt ? (
        <p className="wwh-tier-asked">
          <Icon name="check" />
          {t(WWH.angefragt)}
        </p>
      ) : (
        <button
          ref={trigger}
          type="button"
          className="btn btn-ghost btn-compact wwh-tier-ask"
          disabled={disabled || eigeneTiere.length === 0}
          aria-label={t(WWH.kontaktAnfragenLabel, { name: tier.tierName })}
          onClick={() => setOpen(true)}
        >
          <Icon name="message" />
          {t(WWH.kontaktAnfragen)}
        </button>
      )}
      <KontaktDialog open={open} tier={tier} eigeneTiere={eigeneTiere} onClose={() => setOpen(false)} onSend={onRequest} />
    </li>
  )
}
