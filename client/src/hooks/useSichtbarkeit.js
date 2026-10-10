import { useEffect, useState } from 'react'
import { api } from '../api'
import { useToast } from '../components/Toast.jsx'
import { ownAnimals, ownMemories, privatPayload, withCountChange } from '../lib/sichtbarkeit.js'

// Phase M „Mein Revier“: das eigene öffentliche Profil und die öffentlich markierten Erinnerungen - ohne Profil (z. B. in
// einer Rudel-Instanz) einfach null bzw. leer, „Wer sieht was“ bleibt dann wie bisher.
const revierOrNull = () =>
  Promise.resolve()
    .then(() => Promise.all([api.revier.einstellungen(), api.revier.eintraege()]))
    .then(([settings, eintraege]) => ({ settings, markiert: eintraege.ids }))
    .catch(() => null)

// Alles für „Wer sieht was“ in einem Rutsch (parallel): eigene Tiere samt Familien-Freigaben (GET /api/dogs), die Zahlen
// und das mitlesende Tierheim je Tier (GET /api/sichtbarkeit/uebersicht), die eigenen Erinnerungen (GET /api/timeline),
// die Gäste (GET /api/besuche) und die Rahmen-Links. Geändert wird nur über die bestehenden Endpunkte.
async function loadAll(homeId) {
  const [dogs, uebersicht, entries, visits, rahmen, revier] = await Promise.all([
    api.listDogs(),
    api.sichtbarkeitUebersicht(),
    api.listTimeline(),
    api.visits(),
    api.rahmenGeraete().catch(() => ({ geraete: [] })),
    revierOrNull()
  ])
  const animals = ownAnimals(dogs, homeId)
  return {
    animals,
    counts: Object.fromEntries(uebersicht.tiere.map((tier) => [tier.id, { privat: tier.privat, geteilt: tier.geteilt }])),
    shelters: Object.fromEntries(uebersicht.tiere.map((tier) => [tier.id, tier.tierheim])),
    memories: ownMemories(entries, homeId, animals.map((dog) => dog.id)),
    guests: visits.gaeste || [],
    frames: rahmen.geraete || [],
    revier
  }
}

export default function useSichtbarkeit(homeId) {
  const toast = useToast()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState({})

  useEffect(() => {
    let active = true
    loadAll(homeId)
      .then((loaded) => active && setData(loaded))
      .catch((err) => active && setError(err.message))
    return () => {
      active = false
    }
  }, [homeId])

  const patch = (fn) => setData((current) => (current ? { ...current, ...fn(current) } : current))
  const mark = (key, on) => setBusy((current) => ({ ...current, [key]: on }))

  async function run(key, action) {
    mark(key, true)
    try {
      await action()
    } catch (err) {
      toast(err.message)
    } finally {
      mark(key, false)
    }
  }

  const setMemoryPrivat = (entry, privat) =>
    run(`entry-${entry.id}`, async () => {
      const saved = await api.updateTimelineEntry(entry.id, privatPayload(entry, privat))
      patch((current) => ({
        memories: current.memories.map((item) => (item.id === entry.id ? { ...item, privat: saved.privat } : item)),
        counts: withCountChange(current.counts, entry.dog_id, Boolean(saved.privat))
      }))
    })

  const removeGuest = (guestId) =>
    run(`guest-${guestId}`, async () => {
      await api.removeGuest(guestId)
      patch((current) => ({ guests: current.guests.filter((guest) => guest.id !== guestId) }))
    })

  // Wie ShelterSharePanel: Mitlesen aus nimmt die Happy-End-Einwilligung mit.
  const setShelterReading = (dogId, enabled) =>
    run(`shelter-${dogId}`, async () => {
      const result = await api.setShelterShare(dogId, { enabled, storyConsent: false })
      patch((current) => ({ shelters: { ...current.shelters, [dogId]: { ...current.shelters[dogId], liestMit: result.enabled } } }))
    })

  // Phase M: dritte Sichtbarkeit einer Erinnerung (PUT /api/revier/eintraege/:id) und der neue Profil-Stand.
  const setMemoryOeffentlich = (entry, oeffentlich) =>
    run(`revier-${entry.id}`, async () => {
      await api.revier.setEintrag(entry.id, oeffentlich)
      patch((current) => {
        const markiert = (current.revier?.markiert || []).filter((id) => id !== entry.id)
        return { revier: { ...current.revier, markiert: oeffentlich ? [...markiert, entry.id] : markiert } }
      })
    })

  const setRevier = (settings) => patch((current) => ({ revier: { markiert: [], ...current.revier, settings } }))

  const updateShares = (dogId, shares) =>
    patch((current) => ({ animals: current.animals.map((dog) => (dog.id === dogId ? { ...dog, shares } : dog)) }))

  return { data, error, isBusy: (key) => Boolean(busy[key]), setMemoryPrivat, setMemoryOeffentlich, setRevier, removeGuest, setShelterReading, updateShares }
}
