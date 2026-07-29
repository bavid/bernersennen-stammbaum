import { useEffect, useState } from 'react'
import { api } from '../api'
import PedigreeTree from '../components/PedigreeTree.jsx'
import ParentPicker from '../components/ParentPicker.jsx'

const emptyForm = {
  name: '',
  geschlecht: 'huendin',
  geburtsdatum: '',
  farbeMarkings: '',
  beschreibung: '',
  mother: { dogId: '', freitext: '' },
  father: { dogId: '', freitext: '' }
}

export default function OverviewPage() {
  const [dogs, setDogs] = useState(null)
  const [allDogs, setAllDogs] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [foto, setFoto] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)

  async function loadDogs() {
    const [own, all] = await Promise.all([api.listDogs(), api.listAllDogs()])
    setDogs(own)
    setAllDogs(all)
  }

  useEffect(() => {
    loadDogs().catch((err) => setError(err.message))
  }, [])

  async function handleFotoChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const uploaded = await api.upload(file)
      setFoto(uploaded.url)
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
      await api.createDog({
        name: form.name,
        geschlecht: form.geschlecht,
        geburtsdatum: form.geburtsdatum || null,
        farbeMarkings: form.farbeMarkings || null,
        beschreibung: form.beschreibung || null,
        fotoUrl: foto,
        motherDogId: form.mother.dogId || null,
        motherFreitext: form.mother.freitext || null,
        fatherDogId: form.father.dogId || null,
        fatherFreitext: form.father.freitext || null
      })
      setForm(emptyForm)
      setFoto(null)
      setShowForm(false)
      await loadDogs()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <div className="eyebrow">Euer Rudel</div>
        <h1>Stammbaum</h1>
        <p>Übersicht aller erfassten Hunde und ihrer Verwandtschaft.</p>
      </div>

      {error && <div className="error-banner" style={{ marginBottom: 'var(--space-4)' }}>{error}</div>}

      {dogs && <PedigreeTree dogs={dogs} />}

      <div style={{ marginTop: 'var(--space-8)' }}>
        {!showForm ? (
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            + Neuen Hund anlegen
          </button>
        ) : (
          <form className="form-stack card" onSubmit={handleSubmit}>
            <h2>Neuen Hund anlegen</h2>
            <div className="form-row">
              <label htmlFor="dogName">Name</label>
              <input
                id="dogName"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div className="form-row">
              <label htmlFor="geschlecht">Geschlecht</label>
              <select
                id="geschlecht"
                value={form.geschlecht}
                onChange={(e) => setForm({ ...form, geschlecht: e.target.value })}
              >
                <option value="huendin">Hündin</option>
                <option value="ruede">Rüde</option>
              </select>
            </div>
            <div className="form-row">
              <label htmlFor="geburtsdatum">Geburtsdatum</label>
              <input
                id="geburtsdatum"
                type="date"
                value={form.geburtsdatum}
                onChange={(e) => setForm({ ...form, geburtsdatum: e.target.value })}
              />
            </div>
            <div className="form-row">
              <label htmlFor="farbe">Farbe/Abzeichen</label>
              <input
                id="farbe"
                value={form.farbeMarkings}
                onChange={(e) => setForm({ ...form, farbeMarkings: e.target.value })}
              />
            </div>

            <ParentPicker
              label="Mutter"
              dogs={allDogs}
              dogId={form.mother.dogId}
              freitext={form.mother.freitext}
              onChange={(mother) => setForm({ ...form, mother })}
            />
            <ParentPicker
              label="Vater"
              dogs={allDogs}
              dogId={form.father.dogId}
              freitext={form.father.freitext}
              onChange={(father) => setForm({ ...form, father })}
            />

            <div className="form-row">
              <label htmlFor="foto">Foto</label>
              <input id="foto" type="file" accept="image/*" onChange={handleFotoChange} />
              {uploading && <span className="dog-card-meta">Lade hoch...</span>}
            </div>

            <div className="form-row">
              <label htmlFor="beschreibung">Beschreibung</label>
              <textarea
                id="beschreibung"
                value={form.beschreibung}
                onChange={(e) => setForm({ ...form, beschreibung: e.target.value })}
              />
            </div>

            <div className="form-row-inline">
              <button className="btn btn-primary" type="submit" disabled={saving || uploading}>
                {saving ? 'Speichere...' : 'Hund anlegen'}
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => setShowForm(false)}>
                Abbrechen
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
