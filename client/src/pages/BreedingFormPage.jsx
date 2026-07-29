import { useEffect, useState } from 'react'
import { api } from '../api'
import ParentPicker from '../components/ParentPicker.jsx'

export default function BreedingFormPage() {
  const [ownDogs, setOwnDogs] = useState([])
  const [allDogs, setAllDogs] = useState([])
  const [mutter, setMutter] = useState({ dogId: '', freitext: '' })
  const [vater, setVater] = useState({ dogId: '', freitext: '' })
  const [datum, setDatum] = useState(() => new Date().toISOString().slice(0, 10))
  const [wurfInfo, setWurfInfo] = useState('')
  const [fotos, setFotos] = useState([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [events, setEvents] = useState([])

  async function load() {
    const [own, all, breedingEvents] = await Promise.all([
      api.listDogs(),
      api.listAllDogs(),
      api.listBreedingEvents()
    ])
    setOwnDogs(own.filter((d) => d.geschlecht === 'huendin'))
    setAllDogs(all)
    setEvents(breedingEvents)
  }

  useEffect(() => {
    load().catch((err) => setError(err.message))
  }, [])

  async function handleFileChange(e) {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    setUploading(true)
    setError(null)
    try {
      const uploaded = await Promise.all(files.map((file) => api.upload(file)))
      setFotos((prev) => [...prev, ...uploaded.map((u) => u.url)])
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      const event = await api.createBreedingEvent({
        mutterDogId: mutter.dogId || null,
        vaterDogId: vater.dogId || null,
        vaterFreitext: vater.freitext || null,
        datum,
        wurfInfo,
        fotoUrls: fotos
      })
      setEvents([event, ...events])
      setWurfInfo('')
      setFotos([])
      setVater({ dogId: '', freitext: '' })
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <div className="eyebrow">Zuchtbuch</div>
        <h1>Deckakt / Wurf erfassen</h1>
        <p>Hält fest, wenn eine Hündin des Rudels gedeckt wurde – inklusive Infos zum Wurf.</p>
      </div>

      {error && <div className="error-banner" style={{ marginBottom: 'var(--space-4)' }}>{error}</div>}

      <form className="form-stack card" onSubmit={handleSubmit}>
        <div className="form-row">
          <label htmlFor="mutter">Mutter (aus eigenem Rudel)</label>
          <select
            id="mutter"
            value={mutter.dogId}
            onChange={(e) => setMutter({ dogId: e.target.value ? Number(e.target.value) : '', freitext: '' })}
            required
          >
            <option value="">– Hündin wählen –</option>
            {ownDogs.map((dog) => (
              <option key={dog.id} value={dog.id}>
                {dog.name}
              </option>
            ))}
          </select>
        </div>
        <ParentPicker
          label="Vater"
          dogs={allDogs}
          dogId={vater.dogId}
          freitext={vater.freitext}
          onChange={setVater}
        />
        <div className="form-row">
          <label htmlFor="datum">Datum</label>
          <input id="datum" type="date" value={datum} onChange={(e) => setDatum(e.target.value)} required />
        </div>
        <div className="form-row">
          <label htmlFor="wurfInfo">Wurf-Infos (Anzahl Welpen, Notizen)</label>
          <textarea id="wurfInfo" value={wurfInfo} onChange={(e) => setWurfInfo(e.target.value)} />
        </div>
        <div className="form-row">
          <label htmlFor="breedingFotos">Fotos</label>
          <input id="breedingFotos" type="file" accept="image/*" multiple onChange={handleFileChange} />
          {uploading && <span className="dog-card-meta">Lade hoch...</span>}
        </div>
        <button className="btn btn-primary" type="submit" disabled={saving || uploading || !mutter.dogId}>
          {saving ? 'Speichere...' : 'Eintrag speichern'}
        </button>
      </form>

      <h2 style={{ marginTop: 'var(--space-8)' }}>Bisherige Einträge</h2>
      <div className="card">
        {events.length === 0 && <p className="empty-state">Noch keine Deckakte erfasst.</p>}
        {events.map((event) => (
          <div className="timeline-entry" key={event.id}>
            <div className="timeline-date">{new Date(event.datum).toLocaleDateString('de-DE')}</div>
            <div>
              <p>{event.wurf_info || 'Keine weiteren Infos'}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
