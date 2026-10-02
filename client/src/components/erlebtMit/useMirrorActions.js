import { useNavigate } from 'react-router-dom'
import { api } from '../../api'
import { useIsDemo } from '../../lib/demo.js'
import { canVisitOrigin } from '../../lib/erlebtMit.js'
import { isOwnHome } from '../../lib/visits.js'
import { useToast } from '../Toast.jsx'

// Aktionen für gespiegelte "Erlebt mit"-Einträge in der Chronik eines eigenen Tiers (Phase V2) - als `mirror`-Prop für
// <Timeline>: zum Original wechseln (nur, wenn man das Zuhause besuchen kann) und die Spiegelung wieder entfernen
// (POST /api/erlebt-mit/:id/ablehnen). onRemoved(item) nimmt den Eintrag aus der Liste der Seite.
export default function useMirrorActions({ family, dog, onFamilyChange, onRemoved }) {
  const navigate = useNavigate()
  const toast = useToast()
  const isDemo = useIsDemo()

  async function onOpenOrigin(item) {
    try {
      const me = await api.view(item.gespiegelt.zuhauseId)
      onFamilyChange?.(me)
      navigate(`/tier/${item.gespiegelt.tierId}#entry-${item.id}`)
    } catch (err) {
      toast(err.message)
    }
  }

  async function onHide(item) {
    try {
      await api.rejectErlebtMit(item.gespiegelt.requestId)
      onRemoved(item)
      toast('Der Eintrag steht nicht mehr in dieser Chronik')
    } catch (err) {
      toast(err.message)
    }
  }

  return {
    canOpenOrigin: (item) => canVisitOrigin(family, item.gespiegelt),
    onOpenOrigin,
    onHide: dog?.canEdit && isOwnHome(family) ? onHide : undefined,
    hideDisabled: isDemo
  }
}
