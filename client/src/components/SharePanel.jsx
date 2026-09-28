import { useState } from 'react'
import { api } from '../api'
import { useTheme } from '../themes/ThemeProvider.jsx'
import { useIsDemo } from '../lib/demo.js'
import { useToast } from './Toast.jsx'
import Modal from './Modal.jsx'
import JoinFamilyDialog from './JoinFamilyDialog.jsx'

const DEMO_HINT_ID = 'share-panel-demo-hint'

// "In Familien zeigen": nur für den eigenen Haushalt ("Meine Chronik"), auf einem seiner Tiere.
// Jede Checkbox ist eine Familie/ein Rudel, in dem der Haushalt Mitglied ist. Eine Änderung schreibt
// sofort optimistisch (kein Speichern-Knopf) und schreibt über die API; schlägt das fehl, geht die
// Auswahl zurück und ein Toast erklärt, warum. Während eine Änderung unterwegs ist, sind die Checkboxen
// gesperrt – sonst könnte eine zweite, schneller beantwortete Anfrage von einer langsameren, älteren
// überschrieben werden (Ergebnisse "überholen" sich in falscher Reihenfolge).
export default function SharePanel({ dog, family, onFamilyChange }) {
  const { words } = useTheme()
  const isDemo = useIsDemo()
  const toast = useToast()
  const [shares, setShares] = useState(dog.shares || [])
  const [saving, setSaving] = useState(false)
  const [joinOpen, setJoinOpen] = useState(false)
  const disabled = isDemo || saving

  async function toggleShare(familyId, checked) {
    const previous = shares
    const next = checked ? [...shares, familyId] : shares.filter((id) => id !== familyId)
    setShares(next)
    setSaving(true)
    try {
      const result = await api.setDogShares(dog.id, next)
      setShares(result.shares)
    } catch (err) {
      setShares(previous)
      toast(err.message)
    } finally {
      setSaving(false)
    }
  }

  function handleJoined(me) {
    onFamilyChange?.(me)
  }

  return (
    <section className="share-panel" aria-labelledby="share-panel-title">
      <h2 id="share-panel-title">In {words.groupsDative} zeigen</h2>
      <p className="muted">Geteilt werden das Tier und alle Einträge, die nicht als privat markiert sind.</p>

      {family.memberships.length > 0 ? (
        <>
          <div className="share-panel-list">
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
              In der Demo nicht möglich.
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
