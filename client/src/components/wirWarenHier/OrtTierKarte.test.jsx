// @vitest-environment jsdom
import { act } from 'react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import OrtTierKarte from './OrtTierKarte.jsx'
import { button, choose, cleanupUi, click, renderUi } from './testUtils.jsx'

const pepper = { checkinId: 40, tierName: 'Pepper', tierart: 'hund', fotoUrl: '/uploads/pepper.jpg', erinnerungen: [{ titel: 'Erste Stunde', datum: '2026-09-01' }] }
const eigene = [
  { dogId: 11, tierName: 'Benno' },
  { dogId: 12, tierName: 'Wilma' }
]

afterEach(cleanupUi)

describe('OrtTierKarte', () => {
  test('zeigt Name, Foto und angeheftete Erinnerung - nie mehr', async () => {
    const container = await renderUi(<OrtTierKarte tier={pepper} eigeneTiere={eigene} onRequest={vi.fn()} />)
    expect(container.querySelector('h4').textContent).toBe('Pepper')
    expect(container.querySelector('img').getAttribute('alt')).toBe('')
    expect(container.textContent).toContain('Erste Stunde')
  })

  test('Kontakt anfragen: Dialog erklärt, Tier wählen, senden; Fokus zurück auf den Knopf', async () => {
    const onRequest = vi.fn().mockResolvedValue(true)
    const container = await renderUi(<OrtTierKarte tier={pepper} eigeneTiere={eigene} onRequest={onRequest} />)
    const trigger = button(container, 'Kontakt zu Pepper anfragen')
    await click(trigger)

    const dialog = container.querySelector('dialog')
    expect(dialog.hasAttribute('open')).toBe(true)
    expect(dialog.textContent).toContain('ohne euren Namen')
    expect(dialog.textContent).toContain('seht ihr die nicht privaten Erinnerungen ihrer Tiere')
    await choose(dialog.querySelector('select'), 12)
    await click(button(dialog, 'Anfrage senden'))

    expect(onRequest).toHaveBeenCalledWith(40, 12, 'Pepper')
    expect(dialog.hasAttribute('open')).toBe(false)
    expect(document.activeElement).toBe(trigger)
  })

  test('Abbrechen schließt ohne Anfrage', async () => {
    const onRequest = vi.fn()
    const container = await renderUi(<OrtTierKarte tier={pepper} eigeneTiere={eigene.slice(0, 1)} onRequest={onRequest} />)
    await click(button(container, 'Kontakt zu Pepper anfragen'))
    const dialog = container.querySelector('dialog')
    expect(dialog.querySelector('select')).toBeNull()
    await act(async () => button(dialog, 'Abbrechen').click())
    expect(onRequest).not.toHaveBeenCalled()
    expect(dialog.hasAttribute('open')).toBe(false)
  })

  test('schon angefragt: kein zweiter Knopf', async () => {
    const container = await renderUi(<OrtTierKarte tier={pepper} eigeneTiere={eigene} angefragt onRequest={vi.fn()} />)
    expect(button(container, 'Kontakt zu Pepper anfragen')).toBeUndefined()
    expect(container.textContent).toContain('Angefragt')
  })
})
