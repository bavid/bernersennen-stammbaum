import { memo, useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { useTheme } from '../themes/ThemeProvider.jsx'
import Icon from '../components/Icon.jsx'
import ConfirmButton from '../components/ConfirmButton.jsx'
import CollageSetup from '../components/collage/CollageSetup.jsx'
import CollagePageView from '../components/collage/CollagePageView.jsx'
import CollageInspector from '../components/collage/CollageInspector.jsx'
import PrintSheet from '../components/collage/PrintSheet.jsx'
import { useToast } from '../components/Toast.jsx'
import { useCollageEditor } from '../hooks/useCollageEditor.js'
import { buildPages, photosOfDog } from '../lib/collage/pages.js'
import { canvasToBlob, renderPage } from '../lib/collage/render.js'
// Gestaltung (Vorlagen, Polaroid, Zeitstrahl, Sticker) - kommt mit der Collage als eigener Chunk
import '../styles/collage-design.css'

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// Vorschaubilder nur neu zeichnen, wenn sich ihre Seite ändert - beim Ziehen auf der aktuellen Seite bleiben alle
// anderen Seiten dasselbe Objekt.
const PageThumb = memo(CollagePageView)

// Gleiche Fotos (z. B. ein gemeinsames Foto zweier Tiere) nur einmal in der Ablage
function uniqueByUrl(photos) {
  const seen = new Set()
  return photos.filter((photo) => !seen.has(photo.url) && seen.add(photo.url))
}

const slug = (text) => text.toLowerCase().replace(/[^a-z0-9äöüß]+/gi, '-').replace(/^-|-$/g, '') || 'collage'

function PageStrip({ pages, pageIndex, onSelect, onAdd }) {
  return (
    <nav className="collage-strip" aria-label="Seiten">
      {pages.map((p, i) => (
        <button
          type="button"
          key={p.id}
          className={`collage-thumb ${i === pageIndex ? 'is-active' : ''}`}
          onClick={() => onSelect(i)}
          aria-current={i === pageIndex ? 'page' : undefined}
          aria-label={`Seite ${i + 1}: ${p.title}`}
        >
          <PageThumb page={p} />
          <span>{i + 1}</span>
        </button>
      ))}
      <button type="button" className="collage-thumb collage-thumb-add" onClick={onAdd}>
        <Icon name="plus" />
        <span>Seite</span>
      </button>
    </nav>
  )
}

export default function CollagePage({ family }) {
  const { theme, words } = useTheme()
  const editor = useCollageEditor(family.id)
  const { draft, pages, page, pageIndex, selection } = editor
  const stage = useRef(null)
  // Entfernen über die Seitenleiste: der Knopf verschwindet - Fokus zurück auf die Seite statt ins Leere
  const focusStage = () => stage.current?.querySelector('.cpage')?.focus({ preventScroll: true })
  const actions = {
    ...editor.actions,
    removeSticker: (id) => {
      editor.actions.removeSticker(id)
      focusStage()
    },
    removePhoto: (id) => {
      editor.actions.removePhoto(id)
      focusStage()
    }
  }
  const [dogs, setDogs] = useState([])
  const [mode, setMode] = useState(() => (draft?.pages?.length ? 'edit' : 'setup'))
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

  async function handleCreate(options) {
    setBusy(true)
    setError(null)
    try {
      const ordered = dogs.filter((dog) => options.selectedIds.includes(dog.id))
      if (!ordered.length) return
      const dogsData = await Promise.all(
        ordered.map(async (dog) => {
          const [detail, entries] = await Promise.all([api.getDog(dog.id), api.listTimeline(dog.id)])
          return { dog: detail, entries }
        })
      )
      const newPages = buildPages(dogsData, { ...options, familyName: family.name, fallbackTitle: words.ourGroup })
      const library = uniqueByUrl(dogsData.flatMap(({ dog, entries }) => photosOfDog(dog, entries)))
      editor.startDraft({ ...options, pages: newPages, library })
      setMode('edit')
      toast(`${newPages.length} ${newPages.length === 1 ? 'Seite' : 'Seiten'} erstellt – jetzt nach Belieben anpassen`)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function exportCurrentPage() {
    setBusy(true)
    try {
      downloadBlob(await canvasToBlob(await renderPage(page, theme)), `${slug(page.title)}-seite-${pageIndex + 1}.png`)
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
      for (const p of pages) blobs.push(await canvasToBlob(await renderPage(p, theme)))
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
            Mehrere {words.animals}, mehrere Seiten: Vorlage und Hintergrund wählen, Sticker aufkleben, Fotos umsortieren
            und Unterschriften anpassen – dann als PNG oder PDF speichern.
          </p>
        </div>
      </header>

      {error && <div className="error-banner" role="alert">{error}</div>}

      {mode === 'setup' && <CollageSetup dogs={dogs} draft={draft} onCreate={handleCreate} busy={busy} />}

      {mode === 'edit' && page && (
        <>
          <div className="collage-toolbar">
            <button type="button" className="btn btn-ghost" onClick={() => setMode('setup')}>
              <Icon name="arrowLeft" /> {words.animals} &amp; Aufteilung
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

          <PageStrip pages={pages} pageIndex={pageIndex} onSelect={editor.goToPage} onAdd={actions.addPage} />

          <div className="collage-editor">
            <div className="collage-stage" ref={stage}>
              <CollagePageView
                page={page}
                interactive
                label={`Seite ${pageIndex + 1} von ${pages.length}: ${page.title || 'ohne Titel'}`}
                selection={selection}
                onSelect={editor.select}
                onPhotoChange={actions.updatePhoto}
                onStickerChange={actions.updateSticker}
                onStickerRemove={actions.removeSticker}
              />
              <p className="collage-stage-caption">
                Seite {pageIndex + 1} von {pages.length}
              </p>
            </div>
            <CollageInspector
              tab={editor.tab}
              onTabChange={editor.setTab}
              page={page}
              pageCount={pages.length}
              selectedPhoto={editor.selectedPhoto}
              selectedSticker={editor.selectedSticker}
              trayPhotos={editor.trayPhotos}
              actions={actions}
              canDeletePage={pages.length > 1}
            />
          </div>

          <div className="collage-reset">
            <ConfirmButton
              label="Entwurf verwerfen"
              confirmLabel="Alle Seiten wirklich verwerfen?"
              onConfirm={() => {
                editor.discardDraft()
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
