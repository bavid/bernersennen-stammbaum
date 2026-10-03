import { Fragment, useEffect, useMemo, useState } from 'react'
import { MARGIN, PAGE } from '../../lib/collage/layout.js'
import { pageGeometry } from '../../lib/collage/layouts.js'
import { backgroundTileUrl, getBackground } from '../../lib/collage/backgrounds.js'
import { titleFontSize } from '../../lib/collage/render.js'
import { useTheme } from '../../themes/ThemeProvider.jsx'
import { EmptySlot, FrameCaption, PhotoFrame, PolaroidCard, TimelineLine, TimelineMark, frameStyle, pct } from './CollageFrames.jsx'
import StickerLayer from './StickerLayer.jsx'

// Farben des Hintergrunds als CSS-Variablen (collage.css/collage-design.css), Muster als gekachelte data:-URL -
// dieselben Werte und dieselbe Kachelgröße wie im Export.
function pageStyle(bg) {
  const tileUrl = backgroundTileUrl(bg)
  return {
    '--cpage-paper': bg.paper,
    '--cpage-ink': bg.ink,
    '--cpage-muted': bg.muted,
    '--cpage-frame': bg.frame,
    '--cpage-accent': bg.accent,
    ...(tileUrl ? { backgroundImage: `url("${tileUrl}")`, backgroundSize: `${(bg.tile.size / PAGE.width) * 100}% auto` } : {})
  }
}

// Neu messen, sobald die Schriften geladen sind (vorher misst der Browser mit der Ersatzschrift)
function useFontsReady() {
  const [ready, setReady] = useState(() => document.fonts?.status === 'loaded')
  useEffect(() => {
    if (!ready) document.fonts?.ready.then(() => setReady(true))
  }, [ready])
  return ready
}

function Edge({ tricolor, position }) {
  return tricolor ? <div className={`cpage-tricolor cpage-tricolor-${position}`} /> : <div className={`cpage-rule cpage-rule-${position}`} />
}

function Photos({ page, geometry, interactive, selection, onSelect, onPhotoChange }) {
  return page.photos.map((photo, i) => {
    const frame = geometry.frames[i]
    const props = {
      photo,
      interactive,
      selected: selection?.kind === 'photo' && selection.id === photo.id,
      onSelect: (id) => onSelect({ kind: 'photo', id }),
      onChange: onPhotoChange
    }
    if (frame.polaroid) return <PolaroidCard key={photo.id} frame={frame} {...props} />
    const caption = photo.caption.trim()
    return (
      <Fragment key={photo.id}>
        <PhotoFrame style={frameStyle(frame)} {...props} />
        {frame.captionHeight > 0 && caption && <FrameCaption frame={frame} text={caption} />}
        {frame.timeline && <TimelineMark frame={frame} photo={photo} lineX={geometry.line.x} />}
      </Fragment>
    )
  })
}

// Eine Collage-Seite. interactive=false für Vorschaubilder in der Seitenleiste.
// selection: { kind: 'photo' | 'sticker', id } oder null; onSelect(selection) wählt aus (null = nichts).
// label: Name der bearbeitbaren Seite (Vorleser) - sie bekommt den Fokus nach Entf/Escape an einem Sticker.
export default function CollagePageView({
  page,
  interactive = false,
  label = 'Collage-Seite',
  selection = null,
  onSelect = () => {},
  onPhotoChange,
  onStickerChange,
  onStickerRemove
}) {
  const { theme } = useTheme()
  const bg = getBackground(page.background)
  const geometry = pageGeometry(page)
  const fontsReady = useFontsReady()
  const titleSize = useMemo(() => titleFontSize(page.title), [page.title, fontsReady])
  const showSlots = interactive && geometry.slots.length > 0

  function handlePointerDown(event) {
    if (interactive && !event.target.closest('.cframe, .cpolaroid, .csticker')) onSelect(null)
  }

  return (
    <div
      className={`cpage ${interactive ? 'is-interactive' : ''}`}
      style={pageStyle(bg)}
      tabIndex={interactive ? -1 : undefined}
      role={interactive ? 'group' : undefined}
      aria-label={interactive ? label : undefined}
      onPointerDown={handlePointerDown}
    >
      <Edge tricolor={theme.tricolor} position="top" />
      <div
        className="cpage-title"
        style={{
          left: pct(MARGIN, PAGE.width),
          right: pct(MARGIN, PAGE.width),
          fontSize: `${(titleSize / PAGE.width) * 100}cqw`,
          // Optische Größe wie im Export (dort = Schriftgröße in Seiteneinheiten), sonst würde die
          // kleine Vorschau breitere Buchstaben rendern und der Titel nicht mehr passen
          fontVariationSettings: `'opsz' ${titleSize}`
        }}
      >
        {page.title}
      </div>
      <div className="cpage-subtitle" style={{ left: pct(MARGIN, PAGE.width), right: pct(MARGIN, PAGE.width) }}>
        {page.subtitle}
      </div>

      {geometry.line && <TimelineLine line={geometry.line} />}
      <Photos page={page} geometry={geometry} interactive={interactive} selection={selection} onSelect={onSelect} onPhotoChange={onPhotoChange} />
      {showSlots && geometry.slots.map((slot, i) => <EmptySlot key={`slot-${i}`} slot={slot} />)}
      {page.photos.length === 0 && !showSlots && <div className="cpage-empty">Noch keine Fotos auf dieser Seite</div>}

      <div className="cpage-footer" style={{ left: pct(MARGIN, PAGE.width), right: pct(MARGIN, PAGE.width) }}>
        <span>{page.footer}</span>
        <span className="cpage-brand">{theme.appName}</span>
      </div>
      <Edge tricolor={theme.tricolor} position="bottom" />

      <StickerLayer
        stickers={page.stickers}
        interactive={interactive}
        selectedId={selection?.kind === 'sticker' ? selection.id : null}
        onSelect={(id) => onSelect(id ? { kind: 'sticker', id } : null)}
        onChange={(sticker) => onStickerChange(sticker.id, sticker)}
        onRemove={(id) => onStickerRemove(id)}
      />
    </div>
  )
}
