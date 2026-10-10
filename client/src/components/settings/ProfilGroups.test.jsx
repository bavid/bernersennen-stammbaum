// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const { setPersonName, uploadAreaBild, deleteAreaBild } = vi.hoisted(() => ({
  setPersonName: vi.fn(),
  uploadAreaBild: vi.fn(),
  deleteAreaBild: vi.fn()
}))
vi.mock('../../api', () => ({ api: { setPersonName, uploadAreaBild, deleteAreaBild } }))

import { AreaBildGroup, PersonNameGroup } from './ProfilGroups.jsx'
import { DemoProvider } from '../../lib/demo.js'
import { readSetting, removeSetting } from '../../lib/storage.js'
import { setLang } from '../../lib/i18n/index.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

async function render(ui, { demo = false } = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<DemoProvider value={demo}>{ui}</DemoProvider>))
}

function typeInto(input, value) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  setter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

const home = { id: 1, name: 'Zuhause am Deich', art: 'zuhause', bild: null, home: { id: 1, name: 'Zuhause am Deich', bild: null }, person: { anzeigename: null } }

beforeEach(() => {
  vi.clearAllMocks()
  removeSetting('autorName')
})

afterEach(async () => {
  if (root) act(() => root.unmount())
  root = null
  container?.remove()
  await act(async () => setLang('de'))
})

describe('PersonNameGroup', () => {
  test('speichert den Namen, aktualisiert /me und macht ihn zur Vorgabe für neue Erinnerungen', async () => {
    setPersonName.mockResolvedValue({ anzeigename: 'Anke' })
    let me = home
    const onFamilyChange = vi.fn((update) => {
      me = typeof update === 'function' ? update(me) : update
    })
    await render(<PersonNameGroup family={home} onFamilyChange={onFamilyChange} />)
    expect(container.querySelector('h2').textContent).toBe('Euer Name')
    const button = container.querySelector('button[type="submit"]')
    expect(button.disabled).toBe(true)
    await act(async () => typeInto(container.querySelector('input'), 'Anke'))
    expect(button.disabled).toBe(false)
    await act(async () => container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(setPersonName).toHaveBeenCalledWith('Anke')
    expect(me.person).toEqual({ anzeigename: 'Anke' })
    expect(readSetting('autorName', '')).toBe('Anke')
  })

  test('in der Demo gesperrt', async () => {
    await render(<PersonNameGroup family={home} readOnly onFamilyChange={() => {}} />, { demo: true })
    expect(container.querySelector('input').disabled).toBe(true)
    expect(container.textContent).toContain('In der Demo nicht möglich.')
  })

  test('Englisch', async () => {
    await act(async () => setLang('en'))
    await render(<PersonNameGroup family={home} onFamilyChange={() => {}} />)
    expect(container.querySelector('h2').textContent).toBe('Your name')
    expect(container.querySelector('button[type="submit"]').textContent).toBe('Save')
  })
})

describe('AreaBildGroup', () => {
  test('ohne Bild der Anfangsbuchstabe; Hochladen setzt das Bild in /me', async () => {
    uploadAreaBild.mockResolvedValue({ bild: '/api/profil/1/bild?v=abc' })
    let me = home
    const onFamilyChange = vi.fn((update) => {
      me = update(me)
    })
    await render(<AreaBildGroup family={home} onFamilyChange={onFamilyChange} />)
    expect(container.querySelector('.area-avatar').getAttribute('data-initial')).toBe('Z')
    expect(container.querySelector('.area-avatar img')).toBeNull()
    expect(container.textContent).not.toContain('Entfernen')
    const input = container.querySelector('[data-testid="bild-input"]')
    const file = new File(['x'], 'foto.jpg', { type: 'image/jpeg' })
    Object.defineProperty(input, 'files', { value: [file], configurable: true })
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })))
    expect(uploadAreaBild).toHaveBeenCalledTimes(1)
    expect(me.bild).toBe('/api/profil/1/bild?v=abc')
    expect(me.home.bild).toBe('/api/profil/1/bild?v=abc')
  })

  test('mit Bild: Bild statt Buchstabe, Entfernen ruft den Server', async () => {
    deleteAreaBild.mockResolvedValue({ bild: null })
    const withBild = { ...home, bild: '/api/profil/1/bild?v=abc' }
    await render(<AreaBildGroup family={withBild} onFamilyChange={() => {}} />)
    expect(container.querySelector('.area-avatar img').getAttribute('src')).toBe('/api/profil/1/bild?v=abc')
    const remove = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Entfernen')
    await act(async () => remove.click())
    expect(deleteAreaBild).toHaveBeenCalledTimes(1)
  })

  test('Familie ohne Leitung: Knöpfe gesperrt mit Hinweis', async () => {
    await render(<AreaBildGroup family={{ id: 3, name: 'Familie Sonnenhang' }} kind="family" canEdit={false} onFamilyChange={() => {}} />)
    expect([...container.querySelectorAll('button')].every((button) => button.disabled)).toBe(true)
    expect(container.textContent).toContain('Das Bild ändert die Leitung.')
  })
})
