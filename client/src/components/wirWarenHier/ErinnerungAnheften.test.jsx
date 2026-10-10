// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from 'vitest'

const { listTimeline } = vi.hoisted(() => ({ listTimeline: vi.fn() }))
vi.mock('../../api', () => ({ api: { listTimeline } }))

import ErinnerungAnheften from './ErinnerungAnheften.jsx'
import { button, cleanupUi, click, renderUi } from './testUtils.jsx'

const checkin = {
  id: 1,
  dogId: 11,
  tierName: 'Benno',
  status: 'bestaetigt',
  erinnerungen: [{ id: 5, entryId: 21, status: 'offen', titel: 'Erste Stunde', datum: '2026-09-01' }]
}
const entries = [
  { id: 21, dog_id: 11, titel: 'Erste Stunde', datum: '2026-09-01', privat: 0 },
  { id: 22, dog_id: 11, titel: 'Prüfung bestanden', datum: '2026-09-20', privat: 0 },
  { id: 23, dog_id: 11, titel: 'Tierarzt', datum: '2026-09-21', privat: 1 },
  { id: 24, dog_id: 11, titel: 'Strandtag bei Lotte', datum: '2026-09-22', privat: 0, gespiegelt: { zuhause: 'Möwenweg' } }
]

afterEach(() => {
  cleanupUi()
  listTimeline.mockReset()
})

describe('ErinnerungAnheften', () => {
  test('zeigt angeheftete Erinnerungen mit Stand und löst sie', async () => {
    const onUnpin = vi.fn().mockResolvedValue(true)
    const container = await renderUi(<ErinnerungAnheften checkin={checkin} ortName="Hundeschule Pfotenglück" onPin={vi.fn()} onUnpin={onUnpin} />)
    expect(container.textContent).toContain('Erste Stunde')
    expect(container.textContent).toContain('wartet auf Freigabe')
    await click(button(container, '„Erste Stunde“ lösen'))
    expect(onUnpin).toHaveBeenCalledWith(1, checkin.erinnerungen[0])
  })

  test('Dialog bietet nur eigene, nicht private, noch nicht angeheftete Erinnerungen an', async () => {
    listTimeline.mockResolvedValue(entries)
    const onPin = vi.fn().mockResolvedValue(true)
    const container = await renderUi(<ErinnerungAnheften checkin={checkin} ortName="Hundeschule Pfotenglück" onPin={onPin} onUnpin={vi.fn()} />)
    await click(button(container, 'Erinnerung anheften'))

    expect(listTimeline).toHaveBeenCalledWith(11)
    const dialog = container.querySelector('dialog')
    const options = [...dialog.querySelectorAll('input[type="radio"]')].map((input) => input.closest('label').textContent)
    expect(options).toHaveLength(1)
    expect(options[0]).toContain('Prüfung bestanden')

    await click(dialog.querySelector('input[type="radio"]'))
    await click(button(dialog, 'Anheften'))
    expect(onPin).toHaveBeenCalledWith(1, 22, 'Prüfung bestanden')
  })

  test('vor der Freigabe: kein Anheften, nur ein Satz', async () => {
    const container = await renderUi(
      <ErinnerungAnheften checkin={{ ...checkin, status: 'offen', erinnerungen: [] }} ortName="Hundeschule Pfotenglück" onPin={vi.fn()} onUnpin={vi.fn()} />
    )
    expect(button(container, 'Erinnerung anheften')).toBeUndefined()
    expect(container.textContent).toContain('Erinnerungen könnt ihr anheften, sobald Hundeschule Pfotenglück euch freigegeben hat.')
  })
})
