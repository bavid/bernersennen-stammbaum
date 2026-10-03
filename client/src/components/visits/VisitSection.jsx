import { useCallback, useEffect, useState } from 'react'
import { api } from '../../api'
import { useIsDemo } from '../../lib/demo.js'
import { useToast } from '../Toast.jsx'
import VisitInviteCreator from './VisitInviteCreator.jsx'
import VisitRedeemForm from './VisitRedeemForm.jsx'
import VisitList from './VisitList.jsx'

// Zuhause besuchen (Phase V2) im Einladen-Dialog des eigenen Zuhauses: einladen, selbst einen Code einlösen und die
// bestehenden Verbindungen in beide Richtungen ("Zu Besuch bei", "Meine Gäste") mit "beenden".
// onFamilyChange: neues "me" nach Einlösen/Beenden (Bereichswechsler); onInviteCreated: Code-Liste neu laden.
// listsOnly (Einstellungen → Familien, Calm-down-Runde): nur die beiden Listen - Einladen und Einlösen bleiben im Dialog.
export default function VisitSection({ onFamilyChange, onInviteCreated, listsOnly = false }) {
  const isDemo = useIsDemo()
  const toast = useToast()
  const [lists, setLists] = useState(null)
  const [error, setError] = useState(null)

  const load = useCallback(() => {
    api
      .visits()
      .then(setLists)
      .catch((err) => setError(err.message))
  }, [])

  useEffect(load, [load])

  function handleRedeemed({ gastgeber, me }) {
    onFamilyChange?.(me)
    toast(`Verbunden – du kannst jetzt bei „${gastgeber.name}“ vorbeischauen.`)
    load()
  }

  async function handleEndVisit(visit) {
    try {
      const me = await api.endVisit(visit.id)
      onFamilyChange?.(me)
      toast(`Besuch bei „${visit.name}“ beendet`)
      load()
    } catch (err) {
      toast(err.message)
    }
  }

  async function handleRemoveGuest(guest) {
    try {
      await api.removeGuest(guest.id)
      toast(`„${guest.name}“ ist nicht mehr bei euch zu Gast`)
      load()
    } catch (err) {
      toast(err.message)
    }
  }

  return (
    <div className={listsOnly ? 'visit-section is-lists-only' : 'visit-section'}>
      {!listsOnly && <VisitInviteCreator onCreated={onInviteCreated} />}
      {!listsOnly && <VisitRedeemForm onRedeemed={handleRedeemed} />}
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {lists && (
        <div className="visit-lists">
          <VisitList
            id="visit-list-besuche"
            title="Zu Besuch bei"
            emptyText="Du besuchst noch kein anderes Zuhause."
            items={lists.besuche}
            confirmLabel="Wirklich beenden?"
            disabled={isDemo}
            onEnd={handleEndVisit}
          />
          <VisitList
            id="visit-list-gaeste"
            title="Meine Gäste"
            emptyText="Gerade ist niemand bei euch zu Gast."
            items={lists.gaeste}
            confirmLabel="Wirklich beenden?"
            disabled={isDemo}
            onEnd={handleRemoveGuest}
          />
        </div>
      )}
    </div>
  )
}
