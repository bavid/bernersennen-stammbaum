import { useCallback, useEffect, useState } from 'react'
import { api } from '../../api'
import { useIsDemo } from '../../lib/demo.js'
import { useToast } from '../Toast.jsx'
import VisitList from './VisitList.jsx'
import { t } from '../../lib/i18n/index.js'

// Befreundete Zuhause (Phase V2; Phase W Schritt 2 in Einstellungen › Mein Zuhause): die bestehenden Verbindungen in beide
// Richtungen ("Zu Besuch bei", "Meine Gäste") mit "Beenden". Einladen steht im Einladen-Dialog ("Zu Besuch einladen"),
// einen Code von Freunden löst man auf der Seite "Familien" ein. onFamilyChange: neues "me" nach dem Beenden eines Besuchs.
export default function VisitSection({ onFamilyChange }) {
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

  async function handleEndVisit(visit) {
    try {
      const me = await api.endVisit(visit.id)
      onFamilyChange?.(me)
      toast(t('Besuch bei „{name}“ beendet', { name: visit.name }))
      load()
    } catch (err) {
      toast(err.message)
    }
  }

  async function handleRemoveGuest(guest) {
    try {
      await api.removeGuest(guest.id)
      toast(t('„{name}“ ist nicht mehr bei euch zu Gast', { name: guest.name }))
      load()
    } catch (err) {
      toast(err.message)
    }
  }

  return (
    <div className="visit-section is-lists-only">
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {lists && (
        <div className="visit-lists">
          <VisitList
            id="visit-list-besuche"
            title={t('Zu Besuch bei')}
            emptyText={t('Du besuchst noch kein anderes Zuhause.')}
            items={lists.besuche}
            confirmLabel="Wirklich beenden?"
            disabled={isDemo}
            onEnd={handleEndVisit}
          />
          <VisitList
            id="visit-list-gaeste"
            title={t('Meine Gäste')}
            emptyText={t('Gerade ist niemand bei euch zu Gast.')}
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
