import { useState } from 'react'
import { useTheme } from '../themes/ThemeProvider.jsx'
import { useIsDemo, useReadOnlyHint } from '../lib/demo.js'
import { displayName } from '../lib/timeline.js'
import useDogShares from '../hooks/useDogShares.js'
import Modal from './Modal.jsx'
import JoinFamilyDialog from './JoinFamilyDialog.jsx'

const DEMO_HINT_ID = 'share-panel-demo-hint'

// "Wer sieht {Name}?" (Phase W, Reiter "Infos" der Tierseite; früher "In Familien zeigen"): nur für den eigenen Haushalt
// ("Mein Zuhause"), auf einem seiner Tiere. Jede Checkbox ist eine Familie/ein Rudel, in dem der Haushalt Mitglied ist.
// Speichern, Zurücknehmen bei Fehlern und das Sperren während einer laufenden Änderung übernimmt useDogShares (dieselbe
// Logik wie in den Einstellungen). onSharesChange (optional): die gespeicherten Freigaben für die Seite (Chip im Kopf).
export default function SharePanel({ dog, family, onFamilyChange, onSharesChange }) {
  const { words } = useTheme()
  const isDemo = useIsDemo()
  const readOnlyHint = useReadOnlyHint()
  const { shares, saving, toggleShare } = useDogShares(dog, onSharesChange)
  const [joinOpen, setJoinOpen] = useState(false)
  const disabled = isDemo || saving
  const name = dog.name_unbekannt ? words.animal : displayName(dog)

  function handleJoined(me) {
    onFamilyChange?.(me)
  }

  return (
    <section className="share-panel" aria-labelledby="share-panel-title">
      <h2 id="share-panel-title" tabIndex={-1}>
        Wer sieht {name}?
      </h2>
      <p className="muted">
        Angehakte {words.groups} sehen {name} und alle {words.entries}, die nicht privat sind. Private {words.entries} bleiben
        immer bei euch.
      </p>

      {family.memberships.length > 0 ? (
        <>
          <div className="share-panel-list" role="group" aria-label={`${name} zeigen in`}>
            {family.memberships.map((membership) => (
              <label className="check" key={membership.id}>
                <input
                  type="checkbox"
                  checked={shares.includes(membership.id)}
                  disabled={disabled}
                  aria-describedby={isDemo ? DEMO_HINT_ID : undefined}
                  onChange={(e) => toggleShare(membership.id, e.target.checked)}
                />
                {membership.name}
              </label>
            ))}
          </div>
          {isDemo && (
            <p id={DEMO_HINT_ID} className="field-hint">
              {readOnlyHint}
            </p>
          )}
        </>
      ) : (
        <div className="share-panel-empty">
          <p className="muted">{words.noGroupConnected}</p>
          <button type="button" className="btn btn-ghost" onClick={() => setJoinOpen(true)}>
            {words.group} beitreten oder gründen
          </button>
        </div>
      )}

      <Modal open={joinOpen} title={`${words.group} beitreten oder gründen`} onClose={() => setJoinOpen(false)}>
        <JoinFamilyDialog onChange={handleJoined} onClose={() => setJoinOpen(false)} />
      </Modal>
    </section>
  )
}
