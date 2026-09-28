// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from 'vitest'
import { api } from './api'

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubFetch(responseBody = []) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => responseBody
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('api.publicPartners – PLZ nicht in der URL (Proxy-Zugriffslog, Finding 9)', () => {
  test('mit PLZ: POST an /near, PLZ und Radius stehen im Body, nicht in der URL', async () => {
    const fetchMock = stubFetch([])

    await api.publicPartners({ plz: '10115', radius: 25 })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/public/partners/near')
    expect(url).not.toContain('10115')
    expect(options.method).toBe('POST')
    expect(JSON.parse(options.body)).toEqual({ plz: '10115', radius: 25 })
  })

  test('mit PLZ und demo: demo bleibt Query-Parameter (Server liest demo nur aus der Query)', async () => {
    const fetchMock = stubFetch([])

    await api.publicPartners({ plz: '10115', radius: 25, demo: '1' })

    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/public/partners/near?demo=1')
    expect(url).not.toContain('10115')
    expect(options.method).toBe('POST')
    expect(JSON.parse(options.body)).toEqual({ plz: '10115', radius: 25 })
  })

  test('ohne PLZ: weiterhin GET auf /public/partners, ohne Body', async () => {
    const fetchMock = stubFetch([])

    await api.publicPartners({})

    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/public/partners')
    expect(options.method ?? 'GET').toBe('GET')
    expect(options.body).toBeUndefined()
  })

  test('ohne PLZ mit demo: demo bleibt Query-Parameter wie zuvor', async () => {
    const fetchMock = stubFetch([])

    await api.publicPartners({ demo: '1' })

    const [url] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/public/partners?demo=1')
  })
})

describe('api.publicPartnerAnimals – Vermittlungs-Tiere eines Partners (Phase T Task 5)', () => {
  test('ohne demo: einfacher GET ohne Query-String', async () => {
    const fetchMock = stubFetch([])

    await api.publicPartnerAnimals('tierheim-sonnenhang')

    const [url] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/public/partners/tierheim-sonnenhang/animals')
  })

  test('mit demo: demo bleibt Query-Parameter wie bei publicPartners', async () => {
    const fetchMock = stubFetch([])

    await api.publicPartnerAnimals('tierheim-sonnenhang', { demo: '1' })

    const [url] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/public/partners/tierheim-sonnenhang/animals?demo=1')
  })
})

describe('api.publicAnimal – öffentlicher Steckbrief', () => {
  test('GET auf /public/animals/:slug', async () => {
    const fetchMock = stubFetch({})

    await api.publicAnimal('pepper-ab12cd')

    const [url] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/public/animals/pepper-ab12cd')
  })
})

describe('api.claimVoucher – Übergabe-Gutschein ins eigene Zuhause übernehmen', () => {
  test('POST an /vouchers/claim mit code und shelterMayRead', async () => {
    const fetchMock = stubFetch({ dogId: 42 })

    await api.claimVoucher({ code: 'ABCD-1234-HJKM', shelterMayRead: true })

    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/vouchers/claim')
    expect(options.method).toBe('POST')
    expect(JSON.parse(options.body)).toEqual({ code: 'ABCD-1234-HJKM', shelterMayRead: true })
  })
})
