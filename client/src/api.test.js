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

describe('api.discover – Reiter "Entdecken" (Phase 3)', () => {
  test('mit PLZ: POST an /discover, PLZ und Radius stehen im Body, nicht in der URL', async () => {
    const fetchMock = stubFetch({})

    await api.discover({ plz: '20095', radius: 10 })

    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/discover')
    expect(url).not.toContain('20095')
    expect(options.method).toBe('POST')
    expect(JSON.parse(options.body)).toEqual({ plz: '20095', radius: 10 })
  })

  test('ohne PLZ: POST mit leerem Body (alle Einträge, nach Name)', async () => {
    const fetchMock = stubFetch({})

    await api.discover()

    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/discover')
    expect(options.method).toBe('POST')
    expect(JSON.parse(options.body)).toEqual({})
  })
})

describe('api.admin – Entdecken pflegen (Phase 3 Task 5)', () => {
  test('Empfehlungen: Liste, Anlegen, Ändern, Löschen an /admin/promotions', async () => {
    const fetchMock = stubFetch({})

    await api.admin.promotions()
    await api.admin.createPromotion({ titel: 'Welpenkurs' })
    await api.admin.updatePromotion(7, { titel: 'Welpenkurs' })
    await api.admin.deletePromotion(7)

    const calls = fetchMock.mock.calls.map(([url, options]) => [url, options.method ?? 'GET'])
    expect(calls).toEqual([
      ['/api/admin/promotions', 'GET'],
      ['/api/admin/promotions', 'POST'],
      ['/api/admin/promotions/7', 'PUT'],
      ['/api/admin/promotions/7', 'DELETE']
    ])
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ titel: 'Welpenkurs' })
  })

  test('Bild: POST multipart (FormData, Feld "file") ohne JSON-Content-Type', async () => {
    const fetchMock = stubFetch({ bildUrl: '/partner-media/x.png' })
    const file = new File(['x'], 'bild.png', { type: 'image/png' })

    await api.admin.uploadPromotionImage(7, file)

    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/admin/promotions/7/image')
    expect(options.method).toBe('POST')
    expect(options.body).toBeInstanceOf(FormData)
    expect(options.body.get('file')).toBeInstanceOf(File)
    expect(options.headers).toBeUndefined()
  })

  test('Einstellungen: GET und PUT an /admin/settings', async () => {
    const fetchMock = stubFetch({})

    await api.admin.settings()
    await api.admin.updateSettings({ gofundme_url: 'https://example.org/spenden' })

    expect(fetchMock.mock.calls[0][0]).toBe('/api/admin/settings')
    const [url, options] = fetchMock.mock.calls[1]
    expect(url).toBe('/api/admin/settings')
    expect(options.method).toBe('PUT')
    expect(JSON.parse(options.body)).toEqual({ gofundme_url: 'https://example.org/spenden' })
  })

  test('Spendenberichte: Liste, Anlegen, Ändern, Löschen an /admin/donation-reports', async () => {
    const fetchMock = stubFetch({})

    await api.admin.donationReports()
    await api.admin.createDonationReport({ zeitraum: '2026 Q3', eingangCents: 125050 })
    await api.admin.updateDonationReport(3, { zeitraum: '2026 Q3' })
    await api.admin.deleteDonationReport(3)

    const calls = fetchMock.mock.calls.map(([url, options]) => [url, options.method ?? 'GET'])
    expect(calls).toEqual([
      ['/api/admin/donation-reports', 'GET'],
      ['/api/admin/donation-reports', 'POST'],
      ['/api/admin/donation-reports/3', 'PUT'],
      ['/api/admin/donation-reports/3', 'DELETE']
    ])
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ zeitraum: '2026 Q3', eingangCents: 125050 })
  })
})

// Phase N: Anfragen (öffentlich und im Admin) und Telegram-Benachrichtigungen.
describe('api – Anfragen und Benachrichtigungen (Phase N)', () => {
  test('sendAnfrage: POST an /public/anfragen mit Honigtopf im Body', async () => {
    const fetchMock = stubFetch({ ok: true })

    await api.sendAnfrage({ typ: 'gutschein', email: 'wilma@example.org', website: '' })

    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/public/anfragen')
    expect(options.method).toBe('POST')
    expect(JSON.parse(options.body)).toEqual({ typ: 'gutschein', email: 'wilma@example.org', website: '' })
  })

  test('Admin-Anfragen: Liste mit Status und Seite, Ändern, Zuweisen, Löschen', async () => {
    const fetchMock = stubFetch({})

    await api.admin.anfragen()
    await api.admin.anfragen({ status: 'offen', seite: 2 })
    await api.admin.updateAnfrage(7, { status: 'erledigt' })
    await api.admin.assignAnfrageGutschein(7, 12)
    await api.admin.deleteAnfrage(7)

    const calls = fetchMock.mock.calls.map(([url, options]) => [url, options.method ?? 'GET'])
    expect(calls).toEqual([
      ['/api/admin/anfragen', 'GET'],
      ['/api/admin/anfragen?status=offen&seite=2', 'GET'],
      ['/api/admin/anfragen/7', 'PUT'],
      ['/api/admin/anfragen/7/gutschein', 'POST'],
      ['/api/admin/anfragen/7', 'DELETE']
    ])
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({ status: 'erledigt' })
    expect(JSON.parse(fetchMock.mock.calls[3][1].body)).toEqual({ batchId: 12 })
  })

  test('Telegram: Einstellungen, Zugangsdaten, Chat finden, Testnachricht', async () => {
    const fetchMock = stubFetch({})

    await api.admin.notifySettings()
    await api.admin.updateNotifySettings({ details: true })
    await api.admin.saveTelegram({ chatId: '424242' })
    await api.admin.findTelegramChats()
    await api.admin.sendNotifyTest()

    const calls = fetchMock.mock.calls.map(([url, options]) => [url, options.method ?? 'GET'])
    expect(calls).toEqual([
      ['/api/admin/notify-settings', 'GET'],
      ['/api/admin/notify-settings', 'PUT'],
      ['/api/admin/notify-settings/telegram', 'PUT'],
      ['/api/admin/notify-settings/chat-finden', 'POST'],
      ['/api/admin/notify-test', 'POST']
    ])
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ details: true })
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({ chatId: '424242' })
    expect(JSON.parse(fetchMock.mock.calls[3][1].body)).toEqual({})
  })
})

describe('api.partnerArea – eigenes Profil, Einblicke, Vorschau (Phase P)', () => {
  test('Profil: lesen, nur geänderte Felder per PUT, veröffentlichen mit { aktiv }', async () => {
    const fetchMock = stubFetch({})

    await api.partnerArea.profile()
    await api.partnerArea.updateProfile({ portalTitel: 'Willkommen' })
    await api.partnerArea.publish(false)

    const calls = fetchMock.mock.calls.map(([url, options]) => [url, options.method ?? 'GET'])
    expect(calls).toEqual([
      ['/api/partner-area/profile', 'GET'],
      ['/api/partner-area/profile', 'PUT'],
      ['/api/partner-area/profile/publish', 'POST']
    ])
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ portalTitel: 'Willkommen' })
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({ aktiv: false })
  })

  test('Logo: multipart mit dem Feld "file", ohne JSON-Content-Type', async () => {
    const fetchMock = stubFetch({ logoUrl: '/partner-media/a.png' })

    await api.partnerArea.uploadLogo(new File(['x'], 'logo.png', { type: 'image/png' }))

    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/partner-area/profile/logo')
    expect(options.method).toBe('POST')
    expect(options.body.get('file')).toBeInstanceOf(File)
    expect(options.headers).toBeUndefined()
  })

  test('Einblicke: Liste, Anlegen (FormData), Ändern, Löschen', async () => {
    const fetchMock = stubFetch({})
    const formData = new FormData()
    formData.append('datum', '2026-09-01')

    await api.partnerArea.einblicke()
    await api.partnerArea.createEinblick(formData)
    await api.partnerArea.updateEinblick(4, { text: 'Neu' })
    await api.partnerArea.deleteEinblick(4)

    const calls = fetchMock.mock.calls.map(([url, options]) => [url, options.method ?? 'GET'])
    expect(calls).toEqual([
      ['/api/partner-area/einblicke', 'GET'],
      ['/api/partner-area/einblicke', 'POST'],
      ['/api/partner-area/einblicke/4', 'PUT'],
      ['/api/partner-area/einblicke/4', 'DELETE']
    ])
    expect(fetchMock.mock.calls[1][1].body).toBe(formData)
    expect(fetchMock.mock.calls[1][1].headers).toBeUndefined()
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({ text: 'Neu' })
  })

  test('Vorschau: Portal, Entdecken (PLZ im Body, nicht in der URL), Steckbrief eines Tiers', async () => {
    const fetchMock = stubFetch({})

    await api.partnerArea.previewPortal()
    await api.partnerArea.previewDiscover({ plz: '10115', radius: 25 })
    await api.partnerArea.previewDiscover()
    await api.partnerArea.previewAnimal(9)

    const calls = fetchMock.mock.calls.map(([url, options]) => [url, options.method ?? 'GET'])
    expect(calls).toEqual([
      ['/api/partner-area/preview/portal', 'GET'],
      ['/api/partner-area/preview/discover', 'POST'],
      ['/api/partner-area/preview/discover', 'POST'],
      ['/api/partner-area/preview/animals/9', 'GET']
    ])
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ plz: '10115', radius: 25 })
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({})
  })
})

describe('api.demo – Demo-Bereiche (Phase P1)', () => {
  test('ohne Angabe: leerer Body (Demo-Zuhause)', async () => {
    const fetchMock = stubFetch({})
    await api.demo()
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({})
  })

  test('als Partner: as und slug im Body', async () => {
    const fetchMock = stubFetch({})
    await api.demo({ as: 'partner', slug: 'hundeschule-wiesengrund' })
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/demo')
    expect(options.method).toBe('POST')
    expect(JSON.parse(options.body)).toEqual({ as: 'partner', slug: 'hundeschule-wiesengrund' })
  })

  test('als Tierheim: nur as', async () => {
    const fetchMock = stubFetch({})
    await api.demo({ as: 'tierheim' })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ as: 'tierheim' })
  })
})

describe('api.admin – Partner-Bereiche und Einblicke (Phase P1)', () => {
  test('createPartnerArea und renewPartnerAreaKey: POST an /area bzw. /area/key', async () => {
    const fetchMock = stubFetch({ key: 'ABCD-1234-EFGH' })
    await api.admin.createPartnerArea(4)
    await api.admin.renewPartnerAreaKey(4)
    expect(fetchMock.mock.calls.map(([url, options]) => [url, options.method])).toEqual([
      ['/api/admin/partners/4/area', 'POST'],
      ['/api/admin/partners/4/area/key', 'POST']
    ])
  })

  test('einblicke: partnerId als Query-Parameter; ausblenden: POST mit { ausgeblendet }', async () => {
    const fetchMock = stubFetch([])
    await api.admin.einblicke(4)
    await api.admin.setEinblickAusgeblendet(7, true)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/admin/einblicke?partnerId=4')
    const [url, options] = fetchMock.mock.calls[1]
    expect(url).toBe('/api/admin/einblicke/7/ausblenden')
    expect(options.method).toBe('POST')
    expect(JSON.parse(options.body)).toEqual({ ausgeblendet: true })
  })
})

describe('Phase P2 – Beiträge, Postfach, Schreib uns, Freigabe', () => {
  const callsOf = (fetchMock) => fetchMock.mock.calls.map(([url, options]) => [url, options.method ?? 'GET'])

  test('Beiträge: Liste, Anlegen, Ändern, Löschen und Bild (multipart) an /partner-area/posts', async () => {
    const fetchMock = stubFetch({})

    await api.partnerArea.posts()
    await api.partnerArea.createPost({ titel: 'Welpenkurs', bereich: 'hundeschule' })
    await api.partnerArea.updatePost(3, { titel: 'Welpenkurs neu', bereich: 'hundeschule' })
    await api.partnerArea.deletePost(3)
    await api.partnerArea.uploadPostImage(3, new File(['x'], 'bild.jpg', { type: 'image/jpeg' }))

    expect(callsOf(fetchMock)).toEqual([
      ['/api/partner-area/posts', 'GET'],
      ['/api/partner-area/posts', 'POST'],
      ['/api/partner-area/posts/3', 'PUT'],
      ['/api/partner-area/posts/3', 'DELETE'],
      ['/api/partner-area/posts/3/image', 'POST']
    ])
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ titel: 'Welpenkurs', bereich: 'hundeschule' })
    expect(fetchMock.mock.calls[4][1].body.get('file')).toBeInstanceOf(File)
  })

  test('Postfach: Liste, gelesen, löschen', async () => {
    const fetchMock = stubFetch({})

    await api.partnerArea.messages()
    await api.partnerArea.markMessageRead(9)
    await api.partnerArea.deleteMessage(9)

    expect(callsOf(fetchMock)).toEqual([
      ['/api/partner-area/messages', 'GET'],
      ['/api/partner-area/messages/9/read', 'POST'],
      ['/api/partner-area/messages/9', 'DELETE']
    ])
  })

  test('Schreib uns: POST an /contact, Nachricht im Body, demo nur als Query-Parameter', async () => {
    const fetchMock = stubFetch({ ok: true })

    await api.contactPartner('hundeschule-wiesengrund', { nachricht: 'Hallo, habt ihr noch Plätze?', website: '' })
    await api.contactPartner('hundeschule-wiesengrund', { nachricht: 'Hallo, habt ihr noch Plätze?' }, { demo: '1' })

    expect(callsOf(fetchMock)).toEqual([
      ['/api/public/partners/hundeschule-wiesengrund/contact', 'POST'],
      ['/api/public/partners/hundeschule-wiesengrund/contact?demo=1', 'POST']
    ])
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ nachricht: 'Hallo, habt ihr noch Plätze?', website: '' })
  })

  test('Portal-Beiträge: GET /posts, mit demo als Query-Parameter', async () => {
    const fetchMock = stubFetch([])

    await api.publicPartnerPosts('pfotenglueck')
    await api.publicPartnerPosts('pfotenglueck', { demo: '1' })

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/public/partners/pfotenglueck/posts',
      '/api/public/partners/pfotenglueck/posts?demo=1'
    ])
  })

  test('Admin: Liste mit Freigabe-Filter, freigeben und ablehnen mit Grund', async () => {
    const fetchMock = stubFetch({})

    await api.admin.promotions({ freigabe: 'eingereicht' })
    await api.admin.approvePromotion(5)
    await api.admin.rejectPromotion(5, 'Bitte ohne Preisangaben.')

    expect(callsOf(fetchMock)).toEqual([
      ['/api/admin/promotions?freigabe=eingereicht', 'GET'],
      ['/api/admin/promotions/5/freigeben', 'POST'],
      ['/api/admin/promotions/5/ablehnen', 'POST']
    ])
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({ grund: 'Bitte ohne Preisangaben.' })
  })
})
