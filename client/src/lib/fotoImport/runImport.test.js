import { describe, expect, test, vi } from 'vitest'
import { runImport } from './runImport.js'

const plan = [
  { date: '2024-01-01', items: [{ id: 'a' }, { id: 'b' }] },
  { date: '2024-01-02', items: [{ id: 'c' }] }
]

function fakeApi({ failOn } = {}) {
  const calls = []
  return {
    calls,
    upload: vi.fn(async (file) => {
      calls.push(`upload:${file}`)
      if (file === failOn) throw new Error('Zu groß')
      return { url: `/uploads/${file}.jpg` }
    }),
    createTimelineEntry: vi.fn(async (payload) => {
      calls.push(`entry:${payload.datum}`)
      return { id: payload.datum, ...payload }
    })
  }
}

const base = { dogId: 5, autorName: 'Wilma', privat: false, titleFor: (d) => `Fotos vom ${d}`, prepare: async (item) => item.id }

describe('runImport', () => {
  test('lädt nacheinander hoch und legt je Tag eine Erinnerung an', async () => {
    const api = fakeApi()
    const progress = []
    const result = await runImport({ ...base, plan, api, onProgress: (p) => progress.push(p.done) })
    expect(api.calls).toEqual(['upload:a', 'upload:b', 'entry:2024-01-01', 'upload:c', 'entry:2024-01-02'])
    expect(api.createTimelineEntry).toHaveBeenCalledWith({
      dogId: 5,
      autorName: 'Wilma',
      datum: '2024-01-01',
      titel: 'Fotos vom 2024-01-01',
      text: '',
      fotoUrls: ['/uploads/a.jpg', '/uploads/b.jpg'],
      privat: false
    })
    expect(result.created).toHaveLength(2)
    expect(progress).toEqual([0, 1, 2, 3])
  })

  test('Fehler je Tag: der Tag fehlt, der nächste kommt trotzdem', async () => {
    const api = fakeApi({ failOn: 'a' })
    const result = await runImport({ ...base, plan, api })
    expect(result.errors).toEqual([{ date: '2024-01-01', message: 'Zu groß' }])
    expect(result.created.map((c) => c.date)).toEqual(['2024-01-02'])
  })

  test('Abbrechen stoppt vor dem nächsten Foto, erledigte Tage werden beim Wiederholen übersprungen', async () => {
    const controller = new AbortController()
    const api = fakeApi()
    const prepare = async (item) => {
      if (item.id === 'c') controller.abort()
      return item.id
    }
    const first = await runImport({ ...base, plan, api, prepare, signal: controller.signal })
    expect(first.cancelled).toBe(true)
    expect(first.created.map((c) => c.date)).toEqual(['2024-01-01'])
    const again = fakeApi()
    await runImport({ ...base, plan, api: again, done: new Set(['2024-01-01']) })
    expect(again.calls).toEqual(['upload:c', 'entry:2024-01-02'])
  })
})
