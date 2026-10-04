// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { setDogShares, joinFamily, createGroup } = vi.hoisted(() => ({
  setDogShares: vi.fn(),
  joinFamily: vi.fn(),
  createGroup: vi.fn()
}))
vi.mock('../api', () => ({ api: { setDogShares, joinFamily, createGroup } }))

import SharePanel from './SharePanel.jsx'
import { DemoProvider } from '../lib/demo.js'
import { ThemeProvider } from '../themes/ThemeProvider.jsx'
import { getTheme } from '../themes/index.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

// jsdom implementiert <dialog> nicht vollständig (kein showModal/close) – das Modal für "beitreten
// oder gründen" ruft beides beim Öffnen/Schließen auf.
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

const dog = { id: 42, name: 'Pepper', shares: [3] }
const family = {
  id: 1,
  name: 'Zuhause am Deich',
  art: 'zuhause',
  memberships: [
    { id: 3, name: 'Familie Klein' },
    { id: 5, name: 'Rudel Nachbarn' }
  ]
}

function Wrapper({ isDemo = false, ...props }) {
  return (
    <DemoProvider value={isDemo}>
      <SharePanel dog={dog} family={family} onFamilyChange={() => {}} {...props} />
    </DemoProvider>
  )
}

async function render(props) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<Wrapper {...props} />))
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
  setDogShares.mockReset()
  joinFamily.mockReset()
  createGroup.mockReset()
})

function checkboxFor(name) {
  const label = [...container.querySelectorAll('.share-panel-list .share-switch')].find((el) => el.querySelector('.share-switch-label').textContent === name)
  return label?.querySelector('input')
}

describe('SharePanel', () => {
  test('zeigt einen Schalter je Mitgliedschaft (role="switch"), an entsprechend dog.shares', async () => {
    await render()
    expect(checkboxFor('Familie Klein').checked).toBe(true)
    expect(checkboxFor('Familie Klein').getAttribute('role')).toBe('switch')
    expect(checkboxFor('Rudel Nachbarn').checked).toBe(false)
  })

  test('ein Gast teilt nichts Neues - eine bestehende Freigabe lässt sich lösen', async () => {
    await render({ family: { ...family, memberships: [{ id: 3, name: 'Familie Klein', rolle: 'gast' }, { id: 5, name: 'Rudel Nachbarn', rolle: 'gast' }] } })
    expect(checkboxFor('Familie Klein').disabled).toBe(false)
    expect(checkboxFor('Rudel Nachbarn').disabled).toBe(true)
    expect(container.textContent).toContain('Als Gast teilt ihr hier keine Tiere')
  })

  test('Anhaken ruft api.setDogShares mit der vollständigen neuen Liste auf', async () => {
    setDogShares.mockResolvedValue({ shares: [3, 5] })
    await render()

    await act(async () => checkboxFor('Rudel Nachbarn').click())

    expect(setDogShares).toHaveBeenCalledWith(42, [3, 5])
    expect(checkboxFor('Rudel Nachbarn').checked).toBe(true)
  })

  test('meldet die gespeicherten Freigaben an onSharesChange (Chip „Sichtbar in“ im Kopf der Tierseite)', async () => {
    const onSharesChange = vi.fn()
    setDogShares.mockResolvedValue({ shares: [3, 5] })
    await render({ onSharesChange })

    await act(async () => checkboxFor('Rudel Nachbarn').click())

    expect(onSharesChange).toHaveBeenCalledWith([3, 5])
  })

  test('Abhaken ruft api.setDogShares ohne die entfernte Familie auf', async () => {
    setDogShares.mockResolvedValue({ shares: [] })
    await render()

    await act(async () => checkboxFor('Familie Klein').click())

    expect(setDogShares).toHaveBeenCalledWith(42, [])
    expect(checkboxFor('Familie Klein').checked).toBe(false)
  })

  test('Ein Fehler beim Speichern macht die Auswahl rückgängig', async () => {
    setDogShares.mockRejectedValue(new Error('Nur Familien, in denen ihr Mitglied seid'))
    await render()

    await act(async () => checkboxFor('Rudel Nachbarn').click())

    expect(checkboxFor('Rudel Nachbarn').checked).toBe(false)
  })

  test('im Demo-Modus sind die Checkboxen deaktiviert mit Hinweis', async () => {
    await render({ isDemo: true })
    expect(checkboxFor('Familie Klein').disabled).toBe(true)
    expect(container.querySelector('.field-hint').textContent).toBe('In der Demo nicht möglich.')
  })

  test('ohne Mitgliedschaften zeigt es einen Hinweis samt Beitreten-Knopf, der den Dialog im Modal öffnet', async () => {
    await render({ family: { ...family, memberships: [] } })
    expect(container.querySelector('.share-panel-list')).toBeNull()
    expect(container.querySelector('.share-panel-empty').textContent).toContain('Noch keine Familie verbunden.')

    const button = [...container.querySelectorAll('.share-panel-empty button')].find(
      (btn) => btn.textContent === 'Familie beitreten oder gründen'
    )
    act(() => button.click())
    expect(container.querySelector('.modal').open).toBe(true)
    expect(container.querySelector('.join-family')).not.toBeNull()
  })

  test('erfolgreiches Beitreten über den Dialog ruft onFamilyChange mit dem neuen "me"', async () => {
    const onFamilyChange = vi.fn()
    const me = { ...family, memberships: [{ id: 3, name: 'Familie Klein' }] }
    joinFamily.mockResolvedValue(me)
    await render({ family: { ...family, memberships: [] }, onFamilyChange })

    const button = [...container.querySelectorAll('.share-panel-empty button')].find(
      (btn) => btn.textContent === 'Familie beitreten oder gründen'
    )
    act(() => button.click())

    const password = container.querySelector('#join-family-password')
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    await act(async () => {
      nativeInputValueSetter.call(password, 'geheim123')
      password.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => container.querySelector('.join-family form').requestSubmit())

    expect(onFamilyChange).toHaveBeenCalledWith(me)
  })

  // code-review W2: gesperrt (disabled) verlöre der fokussierte Schalter den Fokus - er bleibt bedienbar, nimmt aber keine
  // zweite Änderung an, solange die erste unterwegs ist (verhindert überholende Antworten).
  test('während das Speichern läuft, nehmen die Schalter keine zweite Änderung an - und behalten den Fokus', async () => {
    let resolveSave
    setDogShares.mockReturnValue(
      new Promise((resolve) => {
        resolveSave = resolve
      })
    )
    await render()

    act(() => checkboxFor('Rudel Nachbarn').focus())
    act(() => checkboxFor('Rudel Nachbarn').click())
    expect(checkboxFor('Rudel Nachbarn').disabled).toBe(false)
    expect(checkboxFor('Rudel Nachbarn').getAttribute('aria-busy')).toBe('true')
    expect(document.activeElement).toBe(checkboxFor('Rudel Nachbarn'))

    act(() => checkboxFor('Familie Klein').click())
    expect(setDogShares).toHaveBeenCalledTimes(1)
    expect(checkboxFor('Familie Klein').checked).toBe(true)

    await act(async () => resolveSave({ shares: [3, 5] }))
    expect(checkboxFor('Rudel Nachbarn').getAttribute('aria-busy')).toBeNull()
    expect(checkboxFor('Rudel Nachbarn').checked).toBe(true)
  })
})

describe('SharePanel – Texte über den Theme-Wortschatz', () => {
  async function renderThemed(themeId, props) {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () =>
      root.render(
        <ThemeProvider themeId={themeId}>
          <Wrapper {...props} />
        </ThemeProvider>
      )
    )
    return container
  }

  test('Standard-Theme: „Wer sieht …?“, Leerzustand und Knopf sprechen von "Familie(n)"', async () => {
    await renderThemed('standard', { family: { ...family, memberships: [] } })
    expect(container.querySelector('#share-panel-title').textContent).toBe('Wer sieht Pepper?')
    expect(container.querySelector('.share-panel-empty')).not.toBeNull()
    expect(container.querySelector('.share-panel-empty').textContent).toContain('Noch keine Familie verbunden.')
  })
})

describe('SharePanel – derselbe Satz wie in den Einstellungen (ShareNote)', () => {
  test('Standard', async () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () =>
      root.render(
        <ThemeProvider>
          <Wrapper />
        </ThemeProvider>
      )
    )
    const { entries } = getTheme().words
    expect(container.querySelector('.share-note').textContent).toBe(
      `Ausgewählte Tiere und ihre nicht privaten ${entries} sieht die ganze Familie. Private ${entries} bleiben immer bei euch.`
    )
    expect(checkboxFor('Familie Klein').getAttribute('aria-describedby')).toBe('share-panel-note')
  })
})
