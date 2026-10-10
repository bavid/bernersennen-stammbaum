// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'

const api = vi.hoisted(() => ({ gesundheit: vi.fn(), gesundheitBald: vi.fn() }))
vi.mock('../../api', () => ({ api }))

import GesundheitInfos from './GesundheitInfos.jsx'
import StartSoon from '../start/StartSoon.jsx'
import { setLang } from '../../lib/i18n/index.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

async function render(element) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<MemoryRouter>{element}</MemoryRouter>))
}

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  Object.values(api).forEach((fn) => fn.mockReset())
  setLang('de')
})

const LETZTE = [
  { art: 'impfung', datum: '2026-09-20', titel: 'Impfung', entryId: 4, naechstesAm: '2027-09-20' },
  { art: 'wurmkur_floh', datum: '2026-08-01', titel: 'Wurmkur', entryId: 5, naechstesAm: null }
]

describe('Gesundheit im Reiter Infos', () => {
  test('je Art die letzte Erinnerung und der nächste Termin', async () => {
    api.gesundheit.mockResolvedValue({ letzte: LETZTE })
    await render(<GesundheitInfos dog={{ id: 7, name: 'Benno' }} />)
    expect(api.gesundheit).toHaveBeenCalledWith(7)
    expect(container.querySelector('h2').textContent).toBe('Gesundheit')
    const rows = [...container.querySelectorAll('.gesundheit-liste li')].map((li) => li.textContent)
    expect(rows).toEqual(['Impfungzuletzt am 20. September 2026 · nächstes Mal am 20. September 2027', 'Wurmkur & Flohzuletzt am 1. August 2026'])
  })

  test('ohne Einträge ein Satz, wie man es festhält; bei Fehler ein ruhiger Hinweis', async () => {
    api.gesundheit.mockResolvedValue({ letzte: [] })
    await render(<GesundheitInfos dog={{ id: 7 }} />)
    expect(container.textContent).toContain('mit „Nächstes Mal am“ erinnern wir euch')
    act(() => root.unmount())
    container.remove()
    api.gesundheit.mockRejectedValue(new Error('404'))
    await render(<GesundheitInfos dog={{ id: 8 }} />)
    expect(container.textContent).toContain('Gesundheit lässt sich gerade nicht laden.')
  })

  test('Englisch', async () => {
    setLang('en')
    api.gesundheit.mockResolvedValue({ letzte: LETZTE.slice(1) })
    await render(<GesundheitInfos dog={{ id: 7 }} />)
    expect(container.querySelector('h2').textContent).toBe('Health')
    expect(container.querySelector('.gesundheit-liste').textContent).toBe('Worming & fleaslast on 1 August 2026')
  })
})

describe('„Bald“ auf Start mit Gesundheit', () => {
  test('fällige Termine als Zeile mit Link zum Reiter Infos - auch ohne andere Termine', async () => {
    const gesundheit = [{ dogId: 7, dogName: 'Benno', art: 'impfung', naechstesAm: '2026-10-11', entryId: 4 }]
    await render(<StartSoon gesundheit={gesundheit} heute="2026-10-10" />)
    expect(container.querySelector('h2').textContent).toBe('Bald')
    const link = container.querySelector('.start-soon-list a')
    expect(link.textContent).toBe('Morgen: Impfung bei Benno')
    expect(link.getAttribute('href')).toBe('/tier/7?reiter=infos')
  })

  test('ohne alles bleibt der Kasten weg', async () => {
    await render(<StartSoon gesundheit={[]} />)
    expect(container.querySelector('.start-soon')).toBeNull()
  })
})
