import { useState } from 'react'
import { api } from '../../api'
import { useIsDemo, useReadOnlyHint } from '../../lib/demo.js'
import { displayName } from '../../lib/timeline.js'
import Icon from '../Icon.jsx'
import Modal from '../Modal.jsx'
import HandoverDialog from '../HandoverDialog.jsx'
import SteckbriefPanel from '../SteckbriefPanel.jsx'
import VermittlungStatusPanel from '../VermittlungStatusPanel.jsx'
import { useToast } from '../Toast.jsx'

// Reiter "Vermittlung" der Tierseite eines Tierheims (eigene Tiere): Status, Steckbrief und die Übergabe. Die Panels liefern
// nur die rohe Hund-Zeile zurück - sie wird in den bestehenden (angereicherten) dog-State gemischt (mergeDog).
// Phase P: ein pausiertes Tier ist gerade nicht vermittelbar - der Server lehnt eine Übergabe ab (routes/dogs.js POST
// /:id/handover), der Knopf deshalb gleich gesperrt, mit Hinweis. Der Übergabe-Gutschein setzt serverseitig
// vermittlung_status auf "reserviert"; "Übergabe zurückziehen" (DELETE /api/dogs/:id/handover) wieder "in Vermittlung".
export default function ShelterPlacement({ dog, setDog }) {
  const isDemo = useIsDemo()
  const readOnlyHint = useReadOnlyHint()
  const toast = useToast()
  const [handoverOpen, setHandoverOpen] = useState(false)
  const [withdrawing, setWithdrawing] = useState(false)
  const paused = dog.vermittlung_status === 'pausiert'
  const reserved = dog.vermittlung_status === 'reserviert'
  const mergeDog = (updated) => setDog((current) => ({ ...current, ...updated }))

  async function handleWithdraw() {
    setWithdrawing(true)
    try {
      mergeDog(await api.withdrawHandover(dog.id))
      toast(`Übergabe zurückgezogen – ${displayName(dog)} ist wieder in Vermittlung.`)
    } catch (err) {
      toast(err.message)
    } finally {
      setWithdrawing(false)
    }
  }

  return (
    <section className="shelter-panel" aria-labelledby="shelter-panel-title">
      <h2 id="shelter-panel-title">Vermittlung</h2>
      <VermittlungStatusPanel key={dog.id} dog={dog} onChange={mergeDog} />

      <SteckbriefPanel dog={dog} onDogChange={mergeDog} />

      <div className="steckbrief-actions">
        <button
          type="button"
          className="btn btn-ghost"
          disabled={paused}
          aria-describedby={paused ? 'handover-paused-hint' : undefined}
          onClick={() => setHandoverOpen(true)}
        >
          <Icon name="logout" />
          Vermittelt – Übergabe vorbereiten
        </button>
        {paused && (
          <p className="field-hint" id="handover-paused-hint">
            Erst auf ‚Verfügbar‘ oder ‚Reserviert‘ setzen.
          </p>
        )}
        {reserved && (
          <button type="button" className="btn btn-ghost" disabled={withdrawing || isDemo} onClick={handleWithdraw}>
            <Icon name="close" />
            {withdrawing ? 'Ziehe zurück …' : 'Übergabe zurückziehen'}
          </button>
        )}
        {isDemo && reserved && <p className="field-hint">{readOnlyHint}</p>}
      </div>

      <Modal open={handoverOpen} title={`Übergabe vorbereiten – ${displayName(dog)}`} onClose={() => setHandoverOpen(false)}>
        {handoverOpen && <HandoverDialog dog={dog} onCreated={() => mergeDog({ vermittlung_status: 'reserviert' })} />}
      </Modal>
    </section>
  )
}
