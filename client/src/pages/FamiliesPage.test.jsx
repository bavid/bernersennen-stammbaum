// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'

const api = vi.hoisted(() => ({ redeemVisit: vi.fn(), joinFamily: vi.fn(), createGroup: vi.fn() }))
vi.mock('../api', () => ({ api }))

import FamiliesPage from './FamiliesPage.jsx'
import { ThemeProvider } from '../themes/ThemeProvider.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function close() {
    this.open = false
  }
}

let container
let root

const home = { id: 1, name: 'Zuhause Lindenhof', art: 'zuhause' }
const atHome = {
  ...home,
  home,
  role: 'leitung',
  memberships: [
    { id: 5, name: 'Familie Sonnenhang', rolle: 'leitung', tiere: 21, eigeneTiere: 4 },
    { id: 6, name: 'Familie am Deich', rolle: 'gast', tiere: 3, eigeneTiere: 0 }
  ],
  besuche: [{ id: 9, name: 'Zuhause Möwenweg', tiere: 7 }]
}

afterEach(() => {
  if (root) act(() => root.unmount())
  root = null
  container?.remove()
  container = null
  for (const mock of Object.values(api)) mock.mockReset()
})

async function render(family = atHome, onFamilyChange = () => {}, themeId = 'standard') {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter>
        <ThemeProvider themeId={themeId}>
          <FamiliesPage family={family} onFamilyChange={onFamilyChange} />
        </ThemeProvider>
      </MemoryRouter>
    )
  )
}

const button = (label) => [...container.querySelectorAll('button')].find((el) => el.textContent === label)
const rows = (id) => [...container.querySelectorAll(`[aria-labelledby="${id}"] a`)]

describe('FamiliesPage (Phase W)', () => {
  test('Meine Familien mit Rolle und derselben Zählung wie überall, befreundete Zuhause - jede Zeile führt zur Gruppenseite', async () => {
    await render()
    expect(container.querySelector('h1').textContent).toBe('Familien')
    expect(rows('families-mine-title').map((a) => [a.getAttribute('href'), a.textContent])).toEqual([
      ['/familien/5', 'Familie SonnenhangFamilienleitung · 21 Tiere · davon 4 von euch'],
      ['/familien/6', 'Familie am DeichGast · 3 Tiere']
    ])
    expect(rows('families-friends-title').map((a) => [a.getAttribute('href'), a.textContent])).toEqual([
      ['/familien/9', 'Zuhause MöwenwegZu Besuch · 7 Tiere']
    ])
  })

  // Betreiber: „Wenn ich auf Familien drücke, will ich Familien sehen und nicht EINLADEN / GRÜNDEN / BEITRETEN“.
  test('erst die Familien, die drei Wege dazu ganz unten als leise Text-Links - keine großen Knöpfe im Kopf', async () => {
    await render()
    expect(container.querySelector('.page-hero .btn')).toBeNull()
    const actions = container.querySelector('.families-page-actions')
    expect([...actions.querySelectorAll('button')].map((b) => [b.textContent, b.className])).toEqual([
      ['Familie beitreten', 'link-button'],
      ['Neue Familie gründen', 'link-button'],
      ['Code von Freunden eingeben', 'link-button']
    ])
    const grid = container.querySelector('.families-page-grid')
    expect(grid.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  test('leer: freundliche Sätze statt Listen', async () => {
    await render({ ...atHome, memberships: [], besuche: [] })
    expect(container.querySelector('[aria-labelledby="families-mine-title"]').textContent).toContain('Noch keine Familie verbunden.')
    expect(container.querySelector('[aria-labelledby="families-friends-title"]').textContent).toContain('Noch bei niemandem zu Besuch.')
  })

  test('„Familie beitreten“ und „Neue Familie gründen“ öffnen den Dialog im passenden Modus', async () => {
    await render()
    act(() => button('Familie beitreten').click())
    let dialog = container.querySelector('dialog[open]')
    expect(dialog.querySelector('#join-family-password')).not.toBeNull()
    act(() => dialog.querySelector('button[aria-label="Schließen"]').click())

    act(() => button('Neue Familie gründen').click())
    dialog = container.querySelector('dialog[open]')
    expect(dialog.querySelector('#join-family-name')).not.toBeNull()
    expect(dialog.querySelector('[aria-pressed="true"]').textContent).toBe('Neu gründen')
  })

  test('„Code von Freunden eingeben“: Einlösen übernimmt das neue "me" und schließt den Dialog', async () => {
    const me = { ...atHome, besuche: [...atHome.besuche, { id: 12, name: 'Zuhause Kiefernweg' }] }
    api.redeemVisit.mockResolvedValue({ gastgeber: { id: 12, name: 'Zuhause Kiefernweg' }, me })
    const onFamilyChange = vi.fn()
    await render(atHome, onFamilyChange)
    act(() => button('Code von Freunden eingeben').click())
    const input = container.querySelector('#visit-redeem-code')
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'ABCD1234HJKM')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => container.querySelector('.visit-redeem-form').requestSubmit())

    expect(api.redeemVisit).toHaveBeenCalledWith('ABCD-1234-HJKM')
    expect(onFamilyChange).toHaveBeenCalledWith(me)
    expect(container.querySelector('dialog[open]')).toBeNull()
  })

  test('Berner: Rudel statt Familien', async () => {
    await render(atHome, () => {}, 'berner')
    expect(container.querySelector('h1').textContent).toBe('Rudel')
    expect(button('Rudel beitreten')).not.toBeUndefined()
    expect(button('Neues Rudel gründen')).not.toBeUndefined()
  })
})
