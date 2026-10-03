import { useEffect, useState } from 'react'
import { api } from '../../api'
import { useIsDemo, useReadOnlyHint } from '../../lib/demo.js'
import { formatDateLong } from '../../lib/dates.js'
import { requestGroups, requestQuestion } from '../../lib/erlebtMit.js'
import ConfirmButton from '../ConfirmButton.jsx'
import { genitive } from '../../lib/timeline.js'
import EntryPhotos from '../EntryPhotos.jsx'
import { useToast } from '../Toast.jsx'

// Offene "Erlebt mit"-Anfragen an das eigene Zuhause (Phase V2): "Wilma war dabei – übernehmen?" mit Vorschau des
// Eintrags. Übernehmen spiegelt ihn in Wilmas Chronik, Ablehnen nimmt die Markierung weg. onCountChange(n) bekommt
// die Zahl der danach noch offenen Anfragen (Badge in der Navigation). Ohne offene Anfragen: nichts.
export default function ErlebtMitRequests({ onCountChange, onOpenPhoto }) {
  const isDemo = useIsDemo()
  const readOnlyHint = useReadOnlyHint()
  const toast = useToast()
  const [requests, setRequests] = useState([])
  const [busyId, setBusyId] = useState(null)

  useEffect(() => {
    let current = true
    api
      .erlebtMitOffen()
      .then((list) => current && setRequests(list))
      .catch(() => current && setRequests([]))
    return () => {
      current = false
    }
  }, [])

  async function decide(request, confirm) {
    setBusyId(request.requestId)
    try {
      const result = confirm ? await api.confirmErlebtMit(request.requestId) : await api.rejectErlebtMit(request.requestId)
      setRequests((list) => list.filter((r) => r.requestId !== request.requestId))
      onCountChange?.(result.offen)
      toast(confirm ? `Steht jetzt auch in ${genitive(request.dogName)} Chronik` : 'Markierung entfernt')
    } catch (err) {
      toast(err.message)
    } finally {
      setBusyId(null)
    }
  }

  // „Alle von {Zuhause} ablehnen“ (security-review V2, L-3) - gegen eine Flut von Anfragen eines Zuhauses.
  async function rejectAllFrom(group) {
    setBusyId(`zuhause-${group.zuhauseId}`)
    try {
      const result = await api.rejectAllErlebtMitFrom(group.zuhauseId)
      setRequests((list) => list.filter((r) => r.zuhauseId !== group.zuhauseId))
      onCountChange?.(result.offen)
      toast(`${result.abgelehnt} Anfragen von „${group.zuhause}“ abgelehnt`)
    } catch (err) {
      toast(err.message)
    } finally {
      setBusyId(null)
    }
  }

  if (requests.length === 0) return null
  const groups = requestGroups(requests)

  return (
    <section className="erlebt-mit-requests" aria-labelledby="erlebt-mit-requests-title">
      <h2 id="erlebt-mit-requests-title">Erlebt mit – Anfragen</h2>
      {groups.length > 0 && (
        <div className="erlebt-mit-request-groups">
          {groups.map((group) => (
            <ConfirmButton
              key={group.zuhauseId}
              label={`Alle ${group.count} von „${group.zuhause}“ ablehnen`}
              confirmLabel="Wirklich alle ablehnen?"
              disabled={isDemo || busyId === `zuhause-${group.zuhauseId}`}
              onConfirm={() => rejectAllFrom(group)}
            />
          ))}
        </div>
      )}
      <ul className="erlebt-mit-request-list">
        {requests.map((request) => (
          <li key={request.requestId} className="erlebt-mit-request">
            <p className="erlebt-mit-request-question">{requestQuestion(request)}</p>
            <p className="muted">
              „{request.titel}“ vom {formatDateLong(request.datum)} – ein Eintrag zu {request.tier} aus „{request.zuhause}“,
              von {request.autor_name}
            </p>
            {request.text && <p className="erlebt-mit-request-text">{request.text}</p>}
            <EntryPhotos urls={request.foto_urls} onOpenPhoto={onOpenPhoto || (() => {})} />
            <div className="erlebt-mit-request-actions">
              <button
                type="button"
                className="btn btn-primary"
                disabled={isDemo || busyId === request.requestId}
                onClick={() => decide(request, true)}
              >
                Übernehmen
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={isDemo || busyId === request.requestId}
                onClick={() => decide(request, false)}
              >
                Ablehnen
              </button>
            </div>
          </li>
        ))}
      </ul>
      {isDemo && <p className="field-hint">{readOnlyHint}</p>}
    </section>
  )
}
