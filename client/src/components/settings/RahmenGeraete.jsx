import { useEffect, useState } from 'react'
import '../../styles/bilderrahmen-geraete.css'
import { api } from '../../api'
import Icon from '../Icon.jsx'
import RahmenGeraetForm from './RahmenGeraetForm.jsx'
import RahmenGeraetRow from './RahmenGeraetRow.jsx'
import RahmenLinkReveal from './RahmenLinkReveal.jsx'
import useRahmenGeraete from '../../hooks/useRahmenGeraete.js'
import { useIsDemo, useReadOnlyHint } from '../../lib/demo.js'
import { useToast } from '../Toast.jsx'

// Eigene Tiere des Zuhauses für die Auswahl ({ id, name, inErinnerung }) - erst, wenn das Formular aufgeht.
function useOwnAnimals(enabled) {
  const [tiere, setTiere] = useState([])
  const [error, setError] = useState(null)
  useEffect(() => {
    if (!enabled) return undefined
    let cancelled = false
    api
      .listDogs()
      .then((dogs) => {
        if (cancelled) return
        setTiere(
          dogs
            .filter((dog) => dog.can_edit)
            .map((dog) => ({ id: dog.id, name: dog.name, inErinnerung: dog.abschied_grund === 'verstorben' }))
        )
      })
      .catch((err) => {
        if (!cancelled) setError(`Eure Tiere ließen sich nicht laden: ${err.message}`)
      })
    return () => {
      cancelled = true
    }
  }, [enabled])
  return [tiere, error]
}

// Einstellungen › Mein Zuhause › „Bilderrahmen auf einem anderen Gerät“: Links für Omas Tablet, ein altes Handy oder den
// Fernseher - ohne Anmeldung, höchstens fünf, jederzeit zu beenden. Der Link (und QR-Code) erscheint genau einmal.
// Demo und Admin-Ansicht (lib/demo.js): Liste ansehen, nichts anlegen oder ändern - mit dem üblichen Hinweis.
export default function RahmenGeraete() {
  const readOnly = useIsDemo()
  const readOnlyHint = useReadOnlyHint()
  const { geraete, max, error, create, update, revoke } = useRahmenGeraete()
  const [formOpen, setFormOpen] = useState(false)
  const [reveal, setReveal] = useState(null)
  const [tiere, tiereError] = useOwnAnimals(formOpen || Boolean(geraete?.some((g) => g.auswahl.tiere.length)))
  const toast = useToast()
  const full = Boolean(geraete) && geraete.length >= max

  async function handleCreate(payload) {
    const result = await create(payload)
    setFormOpen(false)
    setReveal(result)
  }

  async function handleRevoke(geraet) {
    await revoke(geraet.id)
    toast(`„${geraet.name}“ ist beendet – das Gerät zeigt in wenigen Minuten keine Fotos mehr.`)
  }

  return (
    <section className="settings-group rahmen-geraete" aria-labelledby="settings-rahmen-title">
      <h2 id="settings-rahmen-title">Bilderrahmen auf einem anderen Gerät</h2>
      <p className="muted">
        Zeigt die Fotos eurer Tiere auf einem Tablet, alten Handy oder Fernseher – zum Beispiel bei Oma, ganz ohne Anmeldung.
        Jeden Rahmen könnt ihr jederzeit beenden.
      </p>
      {(error || tiereError) && (
        <p className="field-error" role="alert">
          {error || tiereError}
        </p>
      )}
      {reveal && <RahmenLinkReveal geraet={reveal.geraet} token={reveal.token} onDone={() => setReveal(null)} />}
      {geraete?.length > 0 && (
        <ul className="settings-list rahmen-list" role="list" aria-label="Eure Bilderrahmen">
          {geraete.map((geraet) => (
            <RahmenGeraetRow
              key={geraet.id}
              geraet={geraet}
              tiere={tiere}
              readOnly={readOnly}
              onRename={(name) => update(geraet.id, { name })}
              onRevoke={() => handleRevoke(geraet)}
            />
          ))}
        </ul>
      )}
      {formOpen ? (
        <RahmenGeraetForm tiere={tiere} onSubmit={handleCreate} onCancel={() => setFormOpen(false)} />
      ) : (
        <div className="settings-actions">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setFormOpen(true)}
            disabled={readOnly || full || !geraete}
            aria-describedby={readOnly || full ? 'settings-rahmen-hint' : undefined}
          >
            <Icon name="frame" />
            Bilderrahmen einrichten
          </button>
        </div>
      )}
      {(readOnly || full) && (
        <p id="settings-rahmen-hint" className="field-hint">
          {readOnly ? readOnlyHint : `Höchstens ${max} Bilderrahmen – beendet zuerst einen, um einen neuen einzurichten.`}
        </p>
      )}
    </section>
  )
}
