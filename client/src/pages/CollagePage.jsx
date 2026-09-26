import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import Icon from '../components/Icon.jsx'
import Avatar from '../components/Avatar.jsx'
import ConfirmButton from '../components/ConfirmButton.jsx'
import CollagePageView from '../components/collage/CollagePageView.jsx'
import CollageInspector from '../components/collage/CollageInspector.jsx'
import PrintSheet from '../components/collage/PrintSheet.jsx'
import { useToast } from '../components/Toast.jsx'
import { dogLabel } from '../lib/timeline.js'
import { buildPages, movePhoto, newId, newPhoto, photosOfDog, removePhoto, updatePhoto, usedUrls } from '../lib/collage/pages.js'
import { canvasToBlob, renderPage } from '../lib/collage/render.js'
import { readSetting, writeSetting } from '../lib/storage.js'

const PER_PAGE_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9]
const DEFAULT_PER_PAGE = 6

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const slug = (text) => text.toLowerCase().replace(/[^a-z0-9äöüß]+/gi, '-').replace(/^-|-$/g, '') || 'collage'

function DogPicker({ dogs, selectedIds, onToggle }) {
  return (
    <div className="collage-dogs">
      {dogs.map((dog) => {
        const checked = selectedIds.includes(dog.id)
        return (
          <label key={dog.id} className={`collage-dog ${checked ? 'is-checked' : ''}`}>
            <input type="checkbox" checked={checked} onChange={() => onToggle(dog.id)} />
            <Avatar dog={dog} size={44} />
            <span>
              <strong>{dogLabel(dog)}</strong>
              <small>{dog.rasse || 'Rasse unbekannt'}</small>
            </span>
            <span className="collage-dog-check" aria-hidden="true">
              <Icon name="check" />
            </span>
          </label>
        )
      })}
    </div>
  )
}

function Setup({ dogs, draft, onCreate, busy }) {
  const [selectedIds, setSelectedIds] = useState(draft?.selectedIds || [])
  const [perPage, setPerPage] = useState(draft?.perPage || DEFAULT_PER_PAGE)
  const [overview, setOverview] = useState(draft?.overview ?? false)
  const toggle = (id) => setSelectedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))

  return (
    <div className="card form-stack collage-setup">
      <div className="collage-setup-head">
        <h2>1. Hunde auswählen</h2>
        <span className="segmented segmented-sm">
          <button type="button" onClick={() => setSelectedIds(dogs.map((d) => d.id))}>Alle</button>
          <button type="button" onClick={() => setSelectedIds([])}>Keine</button>
        </span>
      </div>
      <DogPicker dogs={dogs} selectedIds={selectedIds} onToggle={toggle} />

      <h2>2. Aufteilung</h2>
      <div className="collage-options">
        <div className="field">
          <label className="field-label" htmlFor="collage-per-page">
            Fotos pro Seite (höchstens)
          </label>
          <select id="collage-per-page" value={perPage} onChange={(e) => setPerPage(Number(e.target.value))}>
            {PER_PAGE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <label className="check">
          <input type="checkbox" checked={overview} onChange={(e) => setOverview(e.target.checked)} />
          Übersichtsseite mit allen Porträts voranstellen
        </label>
      </div>

      {draft?.pages?.length > 0 && (
        <p className="field-hint">Hinweis: Neu erstellen ersetzt die {draft.pages.length} bisherigen Seiten deines Entwurfs.</p>
      )}
      <button
        type="button"
        className="btn btn-primary btn-lg"
        disabled={!selectedIds.length || busy}
        onClick={() => onCreate({ selectedIds, perPage, overview })}
      >
        <Icon name="collage" />
        {busy ? 'Sammle Fotos …' : `Collage erstellen (${selectedIds.length} ${selectedIds.length === 1 ? 'Hund' : 'Hunde'})`}
      </button>
    </div>
  )
}

export default function CollagePage({ family }) {
  const draftKey = `collageDraft.${family.id}`
  const [dogs, setDogs] = useState([])
  const [draft, setDraft] = useState(() => readSetting(draftKey, null))
  const [mode, setMode] = useState(() => (readSetting(draftKey, null)?.pages?.length ? 'edit' : 'setup'))
  const [pageIndex, setPageIndex] = useState(0)
  const [selectedPhotoId, setSelectedPhotoId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [printImages, setPrintImages] = useState(null)
  const [error, setError] = useState(null)
  const toast = useToast()

  useEffect(() => {
    api
      .listDogs()
      .then(setDogs)
      .catch((err) => setError(err.message))
  }, [])

  useEffect(() => {
    if (draft) writeSetting(draftKey, draft)
  }, [draft, draftKey])

  const pages = draft?.pages || []
  const page = pages[Math.min(pageIndex, pages.length - 1)]
  const selectedPhoto = page?.photos.find((p) => p.id === selectedPhotoId) || null
  // Ablage: alle Fotos der gewählten Hunde, die nicht schon auf DIESER Seite sind
  // (ein Porträt darf z. B. auf der Übersicht und auf der Hundeseite stehen)
  const trayPhotos = useMemo(() => {
    const onPage = usedUrls(page ? [page] : [])
    return (draft?.library || []).filter((photo) => !onPage.has(photo.url))
  }, [draft, page])

  async function handleCreate(options) {
    setBusy(true)
    setError(null)
    try {
      const ordered = dogs.filter((dog) => options.selectedIds.includes(dog.id))
      const dogsData = await Promise.all(
        ordered.map(async (dog) => {
          const [detail, entries] = await Promise.all([api.getDog(dog.id), api.listTimeline(dog.id)])
          return { dog: detail, entries }
        })
      )
      const newPages = buildPages(dogsData, { ...options, familyName: family.name })
      const library = dogsData.flatMap(({ dog, entries }) => photosOfDog(dog, entries))
      setDraft({ ...options, pages: newPages, library })
      setPageIndex(0)
      setSelectedPhotoId(null)
      setMode('edit')
      toast(`${newPages.length} ${newPages.length === 1 ? 'Seite' : 'Seiten'} erstellt – jetzt nach Belieben anpassen`)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const setPages = (change) => setDraft((current) => ({ ...current, pages: change(current.pages) }))
  const updateCurrentPage = (change) => setPages((list) => list.map((p) => (p.id === page.id ? change(p) : p)))

  function addPage() {
    const blank = { id: newId('page'), title: 'Neue Seite', subtitle: '', footer: '', photos: [] }
    setPages((list) => [...list.slice(0, pageIndex + 1), blank, ...list.slice(pageIndex + 1)])
    setPageIndex(pageIndex + 1)
    setSelectedPhotoId(null)
  }

  function deletePage() {
    setPages((list) => list.filter((p) => p.id !== page.id))
    setPageIndex(Math.max(0, pageIndex - 1))
    setSelectedPhotoId(null)
  }

  async function exportCurrentPage() {
    setBusy(true)
    try {
      downloadBlob(await canvasToBlob(await renderPage(page)), `${slug(page.title)}-seite-${pageIndex + 1}.png`)
      toast('Seite als PNG gespeichert')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function printAll() {
    setBusy(true)
    try {
      const blobs = []
      for (const p of pages) blobs.push(await canvasToBlob(await renderPage(p)))
      setPrintImages(blobs.map((blob) => URL.createObjectURL(blob)))
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  function handlePrinted() {
    printImages?.forEach((url) => URL.revokeObjectURL(url))
    setPrintImages(null)
    setBusy(false)
  }

  return (
    <div className="page">
      <header className="page-hero">
        <div>
          <span className="eyebrow">Zum Ausdrucken</span>
          <h1>Collage</h1>
          <p className="page-lede">
            Mehrere Hunde, mehrere Seiten: Ausschnitte im Bild verschieben, Fotos umsortieren oder entfernen, Titel und
            Unterschriften anpassen – dann als PNG oder PDF speichern.
          </p>
        </div>
      </header>

      {error && <div className="error-banner" role="alert">{error}</div>}

      {mode === 'setup' && (
        <Setup dogs={dogs} draft={draft} onCreate={handleCreate} busy={busy} />
      )}

      {mode === 'edit' && page && (
        <>
          <div className="collage-toolbar">
            <button type="button" className="btn btn-ghost" onClick={() => setMode('setup')}>
              <Icon name="arrowLeft" /> Hunde &amp; Aufteilung
            </button>
            <span className="form-actions-spacer" />
            <span className="collage-draft-hint">
              <Icon name="check" /> Entwurf wird automatisch gespeichert
            </span>
            <button type="button" className="btn btn-ghost" onClick={exportCurrentPage} disabled={busy}>
              <Icon name="download" /> Seite als PNG
            </button>
            <button type="button" className="btn btn-primary" onClick={printAll} disabled={busy}>
              <Icon name="image" /> {busy ? 'Bereite vor …' : 'Alle Seiten drucken / PDF'}
            </button>
          </div>

          <nav className="collage-strip" aria-label="Seiten">
            {pages.map((p, i) => (
              <button
                type="button"
                key={p.id}
                className={`collage-thumb ${i === pageIndex ? 'is-active' : ''}`}
                onClick={() => {
                  setPageIndex(i)
                  setSelectedPhotoId(null)
                }}
                aria-current={i === pageIndex ? 'page' : undefined}
                aria-label={`Seite ${i + 1}: ${p.title}`}
              >
                <CollagePageView page={p} />
                <span>{i + 1}</span>
              </button>
            ))}
            <button type="button" className="collage-thumb collage-thumb-add" onClick={addPage}>
              <Icon name="plus" />
              <span>Seite</span>
            </button>
          </nav>

          <div className="collage-editor">
            <div className="collage-stage">
              <CollagePageView
                page={page}
                interactive
                selectedPhotoId={selectedPhotoId}
                onSelectPhoto={setSelectedPhotoId}
                onPhotoChange={(photoId, patch) => updateCurrentPage((p) => updatePhoto(p, photoId, patch))}
              />
              <p className="collage-stage-caption">
                Seite {pageIndex + 1} von {pages.length}
              </p>
            </div>
            <CollageInspector
              page={page}
              selectedPhoto={selectedPhoto}
              trayPhotos={trayPhotos}
              onPageChange={(patch) => updateCurrentPage((p) => ({ ...p, ...patch }))}
              onPhotoChange={(photoId, patch) => updateCurrentPage((p) => updatePhoto(p, photoId, patch))}
              onMovePhoto={(photoId, to) => updateCurrentPage((p) => movePhoto(p, photoId, to))}
              onRemovePhoto={(photoId) => {
                updateCurrentPage((p) => removePhoto(p, photoId))
                setSelectedPhotoId(null)
              }}
              onAddPhoto={(photo) => {
                const added = newPhoto(photo.url, photo.caption)
                updateCurrentPage((p) => ({ ...p, photos: [...p.photos, added] }))
                setSelectedPhotoId(added.id)
              }}
              onDeletePage={deletePage}
              canDeletePage={pages.length > 1}
            />
          </div>

          <div className="collage-reset">
            <ConfirmButton
              label="Entwurf verwerfen"
              confirmLabel="Alle Seiten wirklich verwerfen?"
              onConfirm={() => {
                setDraft(null)
                writeSetting(draftKey, null)
                setMode('setup')
              }}
            />
          </div>
        </>
      )}

      {printImages && <PrintSheet images={printImages} onDone={handlePrinted} />}
    </div>
  )
}
