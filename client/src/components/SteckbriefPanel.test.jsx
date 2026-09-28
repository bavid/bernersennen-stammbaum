// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { setSteckbrief } = vi.hoisted(() => ({ setSteckbrief: vi.fn() }))
vi.mock('../api', () => ({ api: { setSteckbrief } }))

import SteckbriefPanel from './SteckbriefPanel.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

const dog = (overrides = {}) => ({
  id: 7,
  name: 'Pepper',
  vermittlung_status: 'in_vermittlung',
  public_slug: null,
  ...overrides
})

async function render(props = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<SteckbriefPanel dog={dog()} onDogChange={() => {}} {...props} />))
  return container
}

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  if (container) {
    container.remove()
    container = null
  }
  setSteckbrief.mockReset()
})

describe('SteckbriefPanel – nicht veröffentlicht', () => {
  test('zeigt "Privat" und den Veröffentlichen-Knopf, wenn der Status es erlaubt', async () => {
    await render({ dog: dog({ vermittlung_status: 'in_vermittlung' }) })
    expect(container.querySelector('.steckbrief-status').textContent).toContain('Privat');
    const button = [...container.querySelectorAll('button')].find((btn) => btn.textContent === 'Steckbrief veröffentlichen')
    expect(button.disabled).toBe(false)
  })

  test('Veröffentlichen ist gesperrt und zeigt einen Hinweis, wenn der Status "vermittelt" ist', async () => {
    await render({ dog: dog({ vermittlung_status: 'vermittelt' }) })
    const button = [...container.querySelectorAll('button')].find((btn) => btn.textContent === 'Steckbrief veröffentlichen')
    expect(button.disabled).toBe(true)
    expect(container.textContent).toContain('Veröffentlichen geht nur mit Status')
  })

  test('Klick auf "Steckbrief veröffentlichen" ruft api.setSteckbrief(id, true) und meldet den Hund', async () => {
    const onDogChange = vi.fn()
    setSteckbrief.mockResolvedValue({ id: 7, public_slug: 'pepper-ab12cd' })
    await render({ onDogChange })

    const button = [...container.querySelectorAll('button')].find((btn) => btn.textContent === 'Steckbrief veröffentlichen')
    await act(async () => button.click())

    expect(setSteckbrief).toHaveBeenCalledWith(7, true)
    expect(onDogChange).toHaveBeenCalledWith({ id: 7, public_slug: 'pepper-ab12cd' })
  })
})

describe('SteckbriefPanel – veröffentlicht', () => {
  test('zeigt den Link zum Kopieren und Öffnen sowie "Zurückziehen"', async () => {
    await render({ dog: dog({ public_slug: 'pepper-ab12cd' }) })

    expect(container.querySelector('.steckbrief-status.is-public')).not.toBeNull()
    expect(container.querySelector('.steckbrief-link').textContent).toContain('/t/pepper-ab12cd')
    const openLink = container.querySelector('a.btn')
    expect(openLink.getAttribute('href')).toContain('/t/pepper-ab12cd')
    expect([...container.querySelectorAll('button')].some((btn) => btn.textContent === 'Zurückziehen')).toBe(true)
  })

  test('"Link kopieren" schreibt den vollen Link in die Zwischenablage', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    await render({ dog: dog({ public_slug: 'pepper-ab12cd' }) })

    const button = [...container.querySelectorAll('button')].find((btn) => btn.textContent.includes('Link kopieren'))
    await act(async () => button.click())

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/t/pepper-ab12cd'))
  })

  test('"Zurückziehen" ruft api.setSteckbrief(id, false)', async () => {
    const onDogChange = vi.fn()
    setSteckbrief.mockResolvedValue({ id: 7, public_slug: null })
    await render({ dog: dog({ public_slug: 'pepper-ab12cd' }), onDogChange })

    const button = [...container.querySelectorAll('button')].find((btn) => btn.textContent === 'Zurückziehen')
    await act(async () => button.click())

    expect(setSteckbrief).toHaveBeenCalledWith(7, false)
    expect(onDogChange).toHaveBeenCalledWith({ id: 7, public_slug: null })
  })
})
