// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ wwh: vi.fn(), wwhDecideCheckin: vi.fn(), wwhDecidePin: vi.fn(), wwhRemoveCheckin: vi.fn() }))
vi.mock('../../api', () => ({ api: { partnerArea: mocks } }))

import WirWarenHierPartnerListe from './WirWarenHierPartnerListe.jsx'
import { button, cleanupUi, click, renderUi } from './testUtils.jsx'

const overview = {
  anmeldungen: [
    { id: 1, status: 'offen', createdAt: '2026-10-01 10:00:00', tierName: 'Benno', tierart: 'hund', fotoUrl: null },
    { id: 2, status: 'bestaetigt', createdAt: '2026-09-01 10:00:00', tierName: 'Wilma', tierart: 'hund', fotoUrl: null }
  ],
  erinnerungen: [{ id: 5, checkinId: 2, status: 'offen', createdAt: '2026-10-02 10:00:00', tierName: 'Wilma', titel: 'Erste Stunde', datum: '2026-09-01', text: 'Toll war es.' }]
}

afterEach(() => {
  cleanupUi()
  for (const mock of Object.values(mocks)) mock.mockReset()
})

describe('WirWarenHierPartnerListe', () => {
  test('offene Anmeldung freigeben: API, neuer Stand, Ansage; Zähler an die Seite', async () => {
    mocks.wwh.mockResolvedValue(overview)
    const onCount = vi.fn()
    const container = await renderUi(<WirWarenHierPartnerListe onCount={onCount} />)
    expect(onCount).toHaveBeenLastCalledWith(2)
    expect(container.textContent).toContain('Benno')
    expect(container.textContent).toContain('wartet auf euch')

    mocks.wwhDecideCheckin.mockResolvedValue({ id: 1, status: 'bestaetigt' })
    mocks.wwh.mockResolvedValue({ ...overview, anmeldungen: overview.anmeldungen.map((a) => ({ ...a, status: 'bestaetigt' })) })
    await click(button(container, 'Benno freigeben'))
    expect(mocks.wwhDecideCheckin).toHaveBeenCalledWith(1, true)
    expect(container.querySelector('[role="status"]').textContent).toBe('Benno ist freigegeben.')
    expect(onCount).toHaveBeenLastCalledWith(1)
  })

  test('Erinnerung freigeben oder ablehnen; Text wird als Text gezeigt', async () => {
    mocks.wwh.mockResolvedValue(overview)
    const container = await renderUi(<WirWarenHierPartnerListe />)
    expect(container.textContent).toContain('Toll war es.')
    mocks.wwhDecidePin.mockResolvedValue({ id: 5, status: 'abgelehnt' })
    await click(button(container, '„Erste Stunde“ ablehnen'))
    expect(mocks.wwhDecidePin).toHaveBeenCalledWith(5, false)
  })

  test('Demo: Knöpfe gesperrt, Hinweis', async () => {
    mocks.wwh.mockResolvedValue(overview)
    const container = await renderUi(<WirWarenHierPartnerListe />, { isDemo: true })
    expect(button(container, 'Benno freigeben').disabled).toBe(true)
    expect(container.textContent).toContain('In der Demo nicht möglich.')
  })

  test('leer: ruhiger Hinweis', async () => {
    mocks.wwh.mockResolvedValue({ anmeldungen: [], erinnerungen: [] })
    const container = await renderUi(<WirWarenHierPartnerListe />)
    expect(container.textContent).toContain('Noch keine Anmeldungen.')
  })
})
