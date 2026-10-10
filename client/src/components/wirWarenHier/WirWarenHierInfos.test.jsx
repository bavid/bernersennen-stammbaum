// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ wwhCheckins: vi.fn(), wwhKontaktOffen: vi.fn() }))
vi.mock('../../api', () => ({ api: mocks }))

import WirWarenHierInfos from './WirWarenHierInfos.jsx'
import { cleanupUi, renderUi } from './testUtils.jsx'

const checkins = [
  { id: 1, partnerId: 7, partnerName: 'Hundeschule Pfotenglück', partnerSlug: 'hundeschule-pfotenglueck', dogId: 11, tierName: 'Benno', status: 'bestaetigt', zeigeMich: true },
  { id: 2, partnerId: 8, partnerName: 'Salon Flocke', partnerSlug: 'salon-flocke', dogId: 11, tierName: 'Benno', status: 'offen', zeigeMich: false },
  { id: 3, partnerId: 7, partnerName: 'Hundeschule Pfotenglück', partnerSlug: 'hundeschule-pfotenglueck', dogId: 12, tierName: 'Wilma', status: 'offen', zeigeMich: false }
]

afterEach(() => {
  cleanupUi()
  for (const mock of Object.values(mocks)) mock.mockReset()
})

describe('WirWarenHierInfos', () => {
  test('Orte des Tiers mit Link, Stand, „hier gezeigt“ und wartenden Kontaktwünschen', async () => {
    mocks.wwhCheckins.mockResolvedValue(checkins)
    mocks.wwhKontaktOffen.mockResolvedValue({ an: [{ id: 3, tierName: 'Pepper', eigenesTierName: 'Benno', ortName: 'Hundeschule Pfotenglück', partnerId: 7, checkinId: 1 }, { id: 4, tierName: 'Lotte', eigenesTierName: 'Benno', ortName: 'Hundeschule Pfotenglück', partnerId: 7, checkinId: 3 }], von: [] })
    const container = await renderUi(<WirWarenHierInfos dog={{ id: 11, name: 'Benno' }} />)

    expect(container.querySelector('h2').textContent).toBe('Orte, an denen wir waren')
    const links = [...container.querySelectorAll('a')]
    expect(links.map((a) => a.textContent)).toEqual(['Hundeschule Pfotenglück', 'Salon Flocke'])
    expect(links[0].getAttribute('href')).toBe('/p/hundeschule-pfotenglueck?reiter=wir-waren-hier')
    expect(container.textContent).toContain('Von Hundeschule Pfotenglück freigegeben')
    expect(container.textContent).toContain('hier gezeigt')
    expect(container.textContent).toContain('1 Kontaktwunsch wartet')
    expect(container.textContent).toContain('Wartet auf Freigabe durch Salon Flocke')
  })

  test('noch kein Ort: kurzer Hinweis mit Weg zu den Partnern', async () => {
    mocks.wwhCheckins.mockResolvedValue([])
    mocks.wwhKontaktOffen.mockResolvedValue({ an: [], von: [] })
    const container = await renderUi(<WirWarenHierInfos dog={{ id: 11, name: 'Benno' }} />)
    expect(container.textContent).toContain('Noch an keinem Ort angemeldet.')
    expect(container.querySelector('a').getAttribute('href')).toBe('/partner')
  })
})
