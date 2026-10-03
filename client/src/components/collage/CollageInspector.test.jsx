// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'
import CollageInspector from './CollageInspector.jsx'
import { ThemeProvider } from '../../themes/ThemeProvider.jsx'
import { getTheme } from '../../themes/index.js'
import { MAX_STICKERS, STICKERS } from '../../lib/collage/stickers.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container

afterEach(() => {
  if (container) {
    act(() => container.remove())
    container = null
  }
  delete document.documentElement.dataset.theme
  document.title = ''
})

const basePage = { id: 'p1', title: '', subtitle: '', footer: '', photos: [], layout: 'auto', background: 'creme', stickers: [] }

function makeActions() {
  return Object.fromEntries(
    ['updatePage', 'updatePhoto', 'movePhoto', 'removePhoto', 'addPhoto', 'deletePage', 'setLayout', 'setBackground', 'applyToAll', 'sortByDate', 'addSticker', 'selectSticker', 'updateSticker', 'removeSticker'].map(
      (name) => [name, vi.fn()]
    )
  )
}

async function render({ themeId = 'standard', tab = 'seite', page = basePage, pageCount = 1, selectedSticker = null, actions = makeActions() } = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  const onTabChange = vi.fn()
  await act(async () =>
    createRoot(container).render(
      <ThemeProvider themeId={themeId}>
        <CollageInspector
          tab={tab}
          onTabChange={onTabChange}
          page={page}
          pageCount={pageCount}
          selectedPhoto={null}
          selectedSticker={selectedSticker}
          trayPhotos={[]}
          actions={actions}
          canDeletePage={false}
        />
      </ThemeProvider>
    )
  )
  return { actions, onTabChange }
}

const click = (el) => act(() => el.click())
const buttonByText = (text) => [...container.querySelectorAll('button')].find((b) => b.textContent.trim() === text)

describe.each(['standard', 'berner'])('CollageInspector im Theme %s', (themeId) => {
  const theme = getTheme(themeId)

  test('Leerer Foto-Ablage-Hinweis nennt Tiere/Hunde aus dem Theme-Wortschatz', async () => {
    await render({ themeId, tab: 'fotos' })
    expect(container.querySelector('.inspector-section .field-hint').textContent).toBe(
      `Alle Fotos der gewählten ${theme.words.animals} sind schon auf dieser Seite.`
    )
  })
})

describe('Reiter', () => {
  test('drei Reiter als Tabliste, Wechsel meldet den Schlüssel', async () => {
    const { onTabChange } = await render()
    const tabs = [...container.querySelectorAll('[role="tab"]')]
    expect(tabs.map((t) => t.textContent)).toEqual(['Seite', 'Fotos', 'Sticker'])
    expect(tabs[0].getAttribute('aria-selected')).toBe('true')
    expect(container.querySelector('[role="tabpanel"]').getAttribute('aria-labelledby')).toBe('collage-tab-seite')
    await click(tabs[2])
    expect(onTabChange).toHaveBeenCalledWith('sticker')
  })
})

describe('Reiter Seite: Vorlage und Hintergrund', () => {
  test('sechs Vorlagen als Auswahlfelder, die aktuelle ist gewählt', async () => {
    const { actions } = await render({ page: { ...basePage, layout: 'grid-2' } })
    const radios = [...container.querySelectorAll('input[name="collage-layout"]')]
    expect(radios).toHaveLength(6)
    expect(radios.find((r) => r.checked).value).toBe('grid-2')
    await click(radios.find((r) => r.value === 'polaroid'))
    expect(actions.setLayout).toHaveBeenCalledWith('polaroid')
  })

  test('Hintergründe in Muster, Hell und Dunkel', async () => {
    const { actions } = await render()
    expect([...container.querySelectorAll('.bg-group-label')].map((l) => l.textContent)).toEqual(['Muster', 'Hell', 'Dunkel'])
    await click(container.querySelector('input[name="collage-background"][value="pfoten"]'))
    expect(actions.setBackground).toHaveBeenCalledWith('pfoten')
  })

  test('"für alle Seiten" erst ab zwei Seiten', async () => {
    await render({ pageCount: 1 })
    expect(buttonByText('Vorlage für alle Seiten')).toBeUndefined()
    act(() => container.remove())
    const { actions } = await render({ pageCount: 3, page: { ...basePage, background: 'nacht' } })
    await click(buttonByText('Hintergrund für alle Seiten'))
    expect(actions.applyToAll).toHaveBeenCalledWith({ background: 'nacht' })
  })

  test('Zeitstrahl bietet "Nach Datum sortieren"', async () => {
    const { actions } = await render({ page: { ...basePage, layout: 'timeline' } })
    await click(buttonByText('Nach Datum sortieren'))
    expect(actions.sortByDate).toHaveBeenCalled()
  })
})

describe('Reiter Sticker', () => {
  test('Auswahl nach Gruppen, Klick fügt den Sticker hinzu', async () => {
    const { actions } = await render({ tab: 'sticker' })
    expect([...container.querySelectorAll('.sticker-group h4')].map((h) => h.textContent)).toEqual(['Tiere', 'Herzen & Feiern', 'Natur', 'Gesichter'])
    expect(container.querySelectorAll('.sticker-option')).toHaveLength(STICKERS.length)
    const paws = container.querySelector('[aria-label="Pfotenabdrücke hinzufügen"]')
    expect(paws.querySelector('img').getAttribute('src')).toBe('/stickers/pfoten.svg')
    await click(paws)
    expect(actions.addSticker).toHaveBeenCalledWith('pfoten')
    expect(container.querySelector('.sticker-credit a').getAttribute('href')).toBe('/stickers/LICENSE.txt')
  })

  test(`bei ${MAX_STICKERS} Stickern ist die Auswahl gesperrt`, async () => {
    const stickers = Array.from({ length: MAX_STICKERS }, (_, i) => ({ id: `s${i}`, sticker: 'stern', x: 0.5, y: 0.5, size: 0.1, rotation: 0 }))
    const { actions } = await render({ tab: 'sticker', page: { ...basePage, stickers } })
    const options = [...container.querySelectorAll('.sticker-group .sticker-option')]
    // aria-disabled statt disabled: der Fokus bleibt, ein Klick tut nichts
    expect(options.every((b) => b.getAttribute('aria-disabled') === 'true' && !b.disabled)).toBe(true)
    await click(options[0])
    expect(actions.addSticker).not.toHaveBeenCalled()
    expect(container.textContent).toContain('mehr passen nicht')
  })

  test('ausgewählter Sticker: größer, drehen, entfernen', async () => {
    const sticker = { id: 's1', sticker: 'krone', x: 0.5, y: 0.5, size: 0.1, rotation: 0 }
    const { actions } = await render({ tab: 'sticker', page: { ...basePage, stickers: [sticker] }, selectedSticker: sticker })
    expect(container.querySelector('.sticker-selected').textContent).toBe('Krone')
    await click(buttonByText('Größer'))
    expect(actions.updateSticker.mock.calls[0][1].size).toBeGreaterThan(0.1)
    await click(buttonByText('Rechts drehen'))
    expect(actions.updateSticker.mock.calls[1][1].rotation).toBe(15)
    await click(buttonByText('Sticker entfernen'))
    expect(actions.removeSticker).toHaveBeenCalledWith('s1')
  })

  test('Verschieben ohne Ziehen: vier Pfeil-Knöpfe', async () => {
    const sticker = { id: 's1', sticker: 'krone', x: 0.5, y: 0.5, size: 0.1, rotation: 0 }
    const { actions } = await render({ tab: 'sticker', page: { ...basePage, stickers: [sticker] }, selectedSticker: sticker })
    await click(container.querySelector('[aria-label="Nach rechts"]'))
    expect(actions.updateSticker.mock.calls[0][1].x).toBeCloseTo(0.52)
    await click(container.querySelector('[aria-label="Nach oben"]'))
    expect(actions.updateSticker.mock.calls[1][1].y).toBeCloseTo(0.48)
  })

  test('"Auf dieser Seite": auch verdeckte Sticker lassen sich auswählen, gleiche sind nummeriert', async () => {
    const stickers = ['stern', 'krone', 'stern'].map((id, i) => ({ id: `s${i}`, sticker: id, x: 0.5, y: 0.5, size: 0.1, rotation: 0 }))
    const { actions } = await render({ tab: 'sticker', page: { ...basePage, stickers }, selectedSticker: stickers[1] })
    const placed = [...container.querySelectorAll('[aria-label$=" auswählen"]')]
    expect(placed.map((b) => b.getAttribute('aria-label'))).toEqual(['Stern 1 auswählen', 'Krone auswählen', 'Stern 2 auswählen'])
    expect(placed[1].getAttribute('aria-pressed')).toBe('true')
    await click(placed[2])
    expect(actions.selectSticker).toHaveBeenCalledWith('s2')
  })
})
