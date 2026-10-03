import { useEffect, useMemo, useRef, useState } from 'react'
import { LIMITS, movePhoto, newId, newPage, newPhoto, removePhoto, updatePhoto, usedUrls } from '../lib/collage/pages.js'
import { addSticker, applyToAllPages, removeSticker, sortPhotosByDate, updateSticker } from '../lib/collage/pageDesign.js'
import { isBackgroundId } from '../lib/collage/backgrounds.js'
import { isLayoutId } from '../lib/collage/layouts.js'
import { sanitizeDraft } from '../lib/collage/sanitize.js'
import { MAX_STICKERS, isStickerId } from '../lib/collage/stickers.js'
import { readSetting, writeSetting } from '../lib/storage.js'

const SAVE_DELAY_MS = 300

// Entwurf im Browser (nur dort - nie auf dem Server), beim Laden geprüft. Gespeichert wird gebündelt nach einer
// kurzen Pause (beim Ziehen ändert er sich bei jeder Zeigerbewegung) und sofort, wenn man die Seite verlässt.
function useSavedDraft(draftKey) {
  const [draft, setDraft] = useState(() => sanitizeDraft(readSetting(draftKey, null)))
  const latest = useRef(draft)

  useEffect(() => {
    latest.current = draft
    if (!draft) return undefined
    const timer = setTimeout(() => writeSetting(draftKey, draft), SAVE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [draft, draftKey])

  useEffect(() => {
    const flush = () => latest.current && writeSetting(draftKey, latest.current)
    window.addEventListener('pagehide', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [draftKey])

  function discard() {
    latest.current = null
    setDraft(null)
    writeSetting(draftKey, null)
  }

  return [draft, setDraft, discard]
}

// Zustand des Collage-Editors: Entwurf, aktuelle Seite, Auswahl (Foto oder Sticker) und Reiter der Seitenleiste -
// plus alle Bearbeitungs-Aktionen.
export function useCollageEditor(familyId) {
  const [draft, setDraft, discardDraft] = useSavedDraft(`collageDraft.${familyId}`)
  const [pageIndex, setPageIndex] = useState(0)
  const [selection, setSelection] = useState(null)
  const [tab, setTab] = useState('seite')

  const pages = draft?.pages || []
  const page = pages[Math.min(pageIndex, pages.length - 1)]
  const selectedPhoto = selection?.kind === 'photo' ? page?.photos.find((p) => p.id === selection.id) || null : null
  const selectedSticker = selection?.kind === 'sticker' ? (page?.stickers || []).find((s) => s.id === selection.id) || null : null

  // Ablage: alle Fotos der gewählten Tiere, die nicht schon auf DIESER Seite sind
  // (ein Porträt darf z. B. auf der Übersicht und auf der Tierseite stehen)
  const trayPhotos = useMemo(() => {
    const onPage = usedUrls(page ? [page] : [])
    return (draft?.library || []).filter((photo) => !onPage.has(photo.url))
  }, [draft, page])

  const setPages = (change) => setDraft((current) => ({ ...current, pages: change(current.pages) }))
  const updateCurrentPage = (change) => setPages((list) => list.map((p) => (p.id === page.id ? change(p) : p)))

  // Auswahl auf der Seite öffnet den passenden Reiter
  function select(next) {
    setSelection(next)
    if (next?.kind === 'photo') setTab('fotos')
    if (next?.kind === 'sticker') setTab('sticker')
  }

  function goToPage(index) {
    setPageIndex(index)
    setSelection(null)
  }

  function startDraft(next) {
    setDraft(next)
    goToPage(0)
  }

  const actions = {
    updatePage: (patch) => updateCurrentPage((p) => ({ ...p, ...patch })),
    updatePhoto: (photoId, patch) => updateCurrentPage((p) => updatePhoto(p, photoId, patch)),
    movePhoto: (photoId, to) => updateCurrentPage((p) => movePhoto(p, photoId, to)),
    removePhoto: (photoId) => {
      updateCurrentPage((p) => removePhoto(p, photoId))
      setSelection(null)
    },
    addPhoto: (photo) => {
      if (page.photos.length >= LIMITS.photosPerPage) return
      const added = newPhoto(photo.url, photo.caption, photo.date)
      updateCurrentPage((p) => (p.photos.length >= LIMITS.photosPerPage ? p : { ...p, photos: [...p.photos, added] }))
      setSelection({ kind: 'photo', id: added.id })
    },
    // Neue Seiten übernehmen Vorlage und Hintergrund der aktuellen Seite
    addPage: () => {
      if (pages.length >= LIMITS.pages) return
      const blank = newPage({ title: 'Neue Seite', layout: page.layout, background: page.background })
      setPages((list) => [...list.slice(0, pageIndex + 1), blank, ...list.slice(pageIndex + 1)])
      goToPage(pageIndex + 1)
    },
    deletePage: () => {
      setPages((list) => list.filter((p) => p.id !== page.id))
      goToPage(Math.max(0, pageIndex - 1))
    },
    setLayout: (layout) => isLayoutId(layout) && updateCurrentPage((p) => ({ ...p, layout })),
    setBackground: (background) => isBackgroundId(background) && updateCurrentPage((p) => ({ ...p, background })),
    applyToAll: (patch) => setPages((list) => applyToAllPages(list, patch)),
    sortByDate: () => updateCurrentPage(sortPhotosByDate),
    // Funktionales Update: auch mehrere Klicks vor dem nächsten Rendern gehen nicht verloren (die Obergrenze
    // prüft addSticker am jeweils aktuellen Stand). Die Id steht vorher fest - für die Auswahl.
    addSticker: (stickerId) => {
      if (!isStickerId(stickerId) || (page.stickers || []).length >= MAX_STICKERS) return
      const id = newId('sticker')
      updateCurrentPage((p) => addSticker(p, stickerId, id))
      setSelection({ kind: 'sticker', id })
    },
    selectSticker: (stickerId) => select({ kind: 'sticker', id: stickerId }),
    updateSticker: (stickerId, sticker) => updateCurrentPage((p) => updateSticker(p, stickerId, sticker)),
    removeSticker: (stickerId) => {
      updateCurrentPage((p) => removeSticker(p, stickerId))
      setSelection(null)
    }
  }

  return { draft, pages, page, pageIndex, goToPage, selection, select, tab, setTab, selectedPhoto, selectedSticker, trayPhotos, actions, startDraft, discardDraft }
}
