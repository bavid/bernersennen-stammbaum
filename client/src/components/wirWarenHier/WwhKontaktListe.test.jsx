// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from 'vitest'
import WwhKontaktListe from './WwhKontaktListe.jsx'
import { button, cleanupUi, click, renderUi } from './testUtils.jsx'

const wishes = {
  an: [{ id: 3, tierName: 'Pepper', tierart: 'hund', fotoUrl: null, eigenesTierName: 'Benno', ortName: 'Hundeschule Pfotenglück' }],
  von: [{ id: 4, tierName: 'Lotte', tierart: 'hund', fotoUrl: null, eigenesTierName: 'Wilma', ortName: 'Hundeschule Pfotenglück' }]
}

afterEach(cleanupUi)

describe('WwhKontaktListe', () => {
  test('Annehmen fragt nach und nennt, was die andere Familie danach sieht', async () => {
    const actions = { accept: vi.fn().mockResolvedValue(true), reject: vi.fn(), withdraw: vi.fn() }
    const container = await renderUi(<WwhKontaktListe wishes={wishes} actions={actions} />)
    expect(container.textContent).toContain('Pepper möchte Benno kennenlernen.')
    expect(container.textContent).toContain('Ihr habt Lotte gefragt – die Antwort steht noch aus.')

    const trigger = button(container, 'Annehmen')
    await click(trigger)
    const dialog = container.querySelector('dialog')
    expect(dialog.textContent).toContain('Dann sieht diese Familie die nicht privaten Erinnerungen eurer Tiere.')
    expect(dialog.textContent).toContain('Grüße schreiben')
    expect(actions.accept).not.toHaveBeenCalled()

    await click(button(dialog, 'Ja, annehmen'))
    expect(actions.accept).toHaveBeenCalledWith(wishes.an[0])
    expect(dialog.hasAttribute('open')).toBe(false)
  })

  test('Ablehnen und Zurückziehen (zweistufig)', async () => {
    const actions = { accept: vi.fn(), reject: vi.fn().mockResolvedValue(true), withdraw: vi.fn().mockResolvedValue(true) }
    const container = await renderUi(<WwhKontaktListe wishes={wishes} actions={actions} />)
    await click(button(container, 'Ablehnen'))
    expect(actions.reject).toHaveBeenCalledWith(wishes.an[0])

    const withdraw = button(container, 'Zurückziehen')
    await click(withdraw)
    expect(actions.withdraw).not.toHaveBeenCalled()
    await click(withdraw)
    expect(actions.withdraw).toHaveBeenCalledWith(wishes.von[0])
  })

  test('ohne Wünsche: nichts', async () => {
    const container = await renderUi(<WwhKontaktListe wishes={{ an: [], von: [] }} actions={{}} />)
    expect(container.textContent).toBe('')
  })
})
