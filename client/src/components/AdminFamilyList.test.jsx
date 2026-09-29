// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'

vi.mock('../api', () => ({ api: { admin: { family: vi.fn() } } }))

import AdminFamilyList, { HerkunftChip } from './AdminFamilyList.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

// Zeile aus GET /api/admin/overview (families) mit herkunft (Phase 5) und dem älteren Freitext quelle.
function family(overrides) {
  return {
    id: 1,
    name: 'Zuhause Birkenweg',
    art: 'zuhause',
    is_demo: 0,
    created_at: '2026-09-01 10:00:00',
    last_activity: null,
    quelle: null,
    herkunft: 'altbestand',
    dogs: 2,
    entries: 5,
    notes: 1,
    replies: 0,
    ...overrides
  }
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
})

async function render(ui) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(ui))
  return container
}

const chips = () => [...container.querySelectorAll('.admin-herkunft')].map((chip) => [chip.textContent, chip.className])

describe('AdminFamilyList – Herkunft als Chip', () => {
  test('zeigt je Bereich die Herkunft: Partner, Weitergabe, Stapel, Altbestand', async () => {
    await render(
      <AdminFamilyList
        families={[
          family({ id: 1, name: 'Zuhause Birkenweg', herkunft: 'partner:Hundeschule Pfotenglück' }),
          family({ id: 2, name: 'Zuhause Uferweg', herkunft: 'weitergabe:Rudel Sonnenhang' }),
          family({ id: 3, name: 'Rudel Sonnenhang', herkunft: 'stapel:Frühjahrsaktion' }),
          family({ id: 4, name: 'Zuhause Waldrand', herkunft: 'altbestand' })
        ]}
      />
    )

    expect(chips()).toEqual([
      ['über Partner Hundeschule Pfotenglück', 'pill admin-herkunft admin-herkunft-partner'],
      ['weitergegeben von Rudel Sonnenhang', 'pill admin-herkunft admin-herkunft-weitergabe'],
      ['Stapel Frühjahrsaktion', 'pill admin-herkunft admin-herkunft-stapel'],
      ['Altbestand', 'pill admin-herkunft admin-herkunft-altbestand']
    ])
    // Der alte Freitext "· über: …" steht nicht mehr in der Zeile darunter.
    expect(container.textContent).not.toContain('über:')
  })

  test('ohne herkunft bleibt der Freitext quelle, ohne beides kein Chip', async () => {
    await render(
      <AdminFamilyList
        families={[
          family({ id: 1, herkunft: undefined, quelle: 'Empfehlung einer Freundin' }),
          family({ id: 2, name: 'Zuhause Uferweg', herkunft: undefined, quelle: null })
        ]}
      />
    )

    expect(chips()).toEqual([['über: Empfehlung einer Freundin', 'pill admin-herkunft admin-herkunft-quelle']])
  })

  test('Altbestand mit Freitext zeigt ihn als Hinweis im Chip', async () => {
    await render(<AdminFamilyList families={[family({ herkunft: 'altbestand', quelle: 'Flyer im Tierheim' })]} />)

    const chip = container.querySelector('.admin-herkunft')
    expect(chip.textContent).toBe('Altbestand · Flyer im Tierheim')
    expect(chip.querySelector('.admin-herkunft-hint').textContent).toBe(' · Flyer im Tierheim')
  })

  test('HerkunftChip allein: nichts ohne Herkunft und Freitext', async () => {
    await render(<HerkunftChip family={family({ herkunft: undefined, quelle: '  ' })} />)

    expect(container.innerHTML).toBe('')
  })

  test('Name, Zeitangaben und Zähler-Pills bleiben wie zuvor, zugeklappt', async () => {
    await render(<AdminFamilyList families={[family({ last_activity: '2026-09-02 08:00:00' })]} />)

    expect(container.querySelector('h2').textContent).toBe('Alle Rudel')
    expect(container.querySelector('.admin-family-name').textContent).toBe('Zuhause Birkenweg')
    expect(container.querySelector('.admin-family-head .muted').textContent).toMatch(/^angelegt .* · zuletzt aktiv /)
    expect([...container.querySelectorAll('.admin-family-counts .pill')].map((pill) => pill.textContent)).toEqual([
      '2 Hunde',
      '5 Einträge',
      '1 Zettel',
      '0 Antworten'
    ])
    expect(container.querySelector('.admin-family-head').getAttribute('aria-expanded')).toBe('false')
    expect(container.querySelector('.admin-details')).toBeNull()
  })

  test('„Als Admin ansehen“ je Bereich: neuer Tab auf /admin-ansicht/:id, außerhalb des Aufklapp-Knopfs (Phase 5 Task 5b)', async () => {
    await render(<AdminFamilyList families={[family({ id: 7 }), family({ id: 9, name: 'Tierheim Sonnenhang', art: 'tierheim' })]} />)

    const links = [...container.querySelectorAll('.admin-view-link')]
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/admin-ansicht/7', '/admin-ansicht/9'])
    for (const link of links) {
      expect(link.textContent).toContain('Als Admin ansehen')
      expect(link.getAttribute('target')).toBe('_blank')
      expect(link.getAttribute('rel')).toBe('noopener noreferrer')
      // Kein Link innerhalb eines <button> (ungültiges HTML, und der Klick würde aufklappen).
      expect(link.closest('button')).toBeNull()
    }
    // Die Kopfzeile klappt weiterhin nur über den Knopf auf.
    expect(container.querySelectorAll('.admin-family-head').length).toBe(2)
  })
})
