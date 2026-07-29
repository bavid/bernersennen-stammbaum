import { useState } from 'react'
import { api } from '../api'

export default function TimelineEntryForm({ dogId, onCreated }) {
  const [autorName, setAutorName] = useState('')
  const [titel, setTitel] = useState('')
  const [text, setText] = useState('')
  const [datum, setDatum] = useState(() => new Date().toISOString().slice(0, 10))
  const [fotos, setFotos] = useState([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

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
      const entry = await api.createTimelineEntry({
        dogId,
        autorName,
        titel,
        text,
        datum,
        fotoUrls: fotos
      })
      onCreated(entry)
      setTitel('')
      setText('')
      setFotos([])
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="form-stack" onSubmit={handleSubmit}>
      {error && <div className="error-banner">{error}</div>}
      <div className="form-row-inline">
        <div className="form-row">
          <label htmlFor="autorName">Dein Name</label>
          <input id="autorName" value={autorName} onChange={(e) => setAutorName(e.target.value)} required />
        </div>
        <div className="form-row">
          <label htmlFor="datum">Datum</label>
          <input
            id="datum"
            type="date"
            value={datum}
            onChange={(e) => setDatum(e.target.value)}
            required
          />
        </div>
      </div>
      <div className="form-row">
        <label htmlFor="titel">Titel</label>
        <input id="titel" value={titel} onChange={(e) => setTitel(e.target.value)} required />
      </div>
      <div className="form-row">
        <label htmlFor="text">Text</label>
        <textarea id="text" value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      <div className="form-row">
        <label htmlFor="fotos">Fotos</label>
        <input id="fotos" type="file" accept="image/*" multiple onChange={handleFileChange} />
        {uploading && <span className="dog-card-meta">Lade hoch...</span>}
        {fotos.length > 0 && (
          <div className="timeline-photos">
            {fotos.map((url) => (
              <img src={url} alt="" key={url} />
            ))}
          </div>
        )}
      </div>
      <button className="btn btn-primary" type="submit" disabled={saving || uploading}>
        {saving ? 'Speichere...' : 'Eintrag hinzufügen'}
      </button>
    </form>
  )
}
