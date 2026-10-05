// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { saveTelegramBot, removeTelegramBot } = vi.hoisted(() => ({ saveTelegramBot: vi.fn(), removeTelegramBot: vi.fn() }))
vi.mock('../api', () => ({ api: { partnerArea: { saveTelegramBot, removeTelegramBot } } }))

import TelegramOwnBot from './TelegramOwnBot.jsx'
import { DemoProvider } from '../lib/demo.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const TOKEN = '737373:EIGENER-token_nur-fuer-tests-wxyzUVWX'
const none = { eingerichtet: false, verbunden: false, getrennt: null, hinweise: { nachricht: false, freigabe: false }, bot: null }
const platform = { ...none, eingerichtet: true, bot: { quelle: 'plattform', username: null } }
const own = { ...none, eingerichtet: true, bot: { quelle: 'eigener', username: 'lindenhof_bot' } }

let container
let root
let onStatus

const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set

function setValue(input, value) {
  nativeInputValueSetter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

async function render(status, { isDemo = false, openByDefault = false } = {}) {
  onStatus = vi.fn()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <DemoProvider value={isDemo}>
        <TelegramOwnBot status={status} onStatus={onStatus} openByDefault={openByDefault} />
      </DemoProvider>
    )
  )
}

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  container?.remove()
  container = null
  saveTelegramBot.mockReset()
  removeTelegramBot.mockReset()
})

function button(text) {
  return [...container.querySelectorAll('button')].find((btn) => btn.textContent.trim() === text)
}

async function submit() {
  await act(async () => container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
}

describe('TelegramOwnBot', () => {
  test('ohne eigenen Bot: Hinweis, „Eigenen Bot einrichten“ öffnet die drei Schritte und das Token-Feld', async () => {
    await render(platform)
    expect(container.querySelector('h3').textContent).toBe('Eigener Telegram-Bot')
    expect(container.textContent).toContain('Zurzeit schreibt euch der Bot von Familie auf Pfoten')
    expect(container.querySelector('form')).toBeNull()
    await act(async () => button('Eigenen Bot einrichten').click())
    expect(container.querySelectorAll('.telegram-bot-steps li')).toHaveLength(3)
    expect(container.textContent).toContain('BotFather')
    const input = container.querySelector('input')
    expect(input.type).toBe('password')
    expect(input.autocomplete).toBe('off')
    expect(container.textContent).toContain('nie wieder angezeigt')
  })

  test('ohne irgendeinen Bot steht die Anleitung gleich offen, ohne „Abbrechen“', async () => {
    await render(none, { openByDefault: true })
    expect(container.querySelector('form')).not.toBeNull()
    expect(button('Abbrechen')).toBeUndefined()
  })

  test('speichern: leer und falsches Format bleiben lokal; ein Token geht getrimmt zum Server, das Feld wird geleert', async () => {
    saveTelegramBot.mockResolvedValue(own)
    await render(platform)
    await act(async () => button('Eigenen Bot einrichten').click())
    await submit()
    expect(container.querySelector('.field-error').textContent).toContain('Bitte zuerst den Token einfügen')
    const input = container.querySelector('input')
    await act(async () => setValue(input, 'kein-token'))
    await submit()
    expect(container.querySelector('.field-error').textContent).toMatch(/nicht wie ein Token/)
    expect(saveTelegramBot).not.toHaveBeenCalled()

    await act(async () => setValue(input, ` ${TOKEN} `))
    await submit()
    expect(saveTelegramBot).toHaveBeenCalledWith(TOKEN)
    expect(onStatus).toHaveBeenCalledWith(own)
    expect(container.textContent).not.toContain(TOKEN.split(':')[1])
    expect(container.querySelector('form')).toBeNull()
  })

  test('lehnt der Server ab, steht die Meldung am Feld', async () => {
    saveTelegramBot.mockRejectedValue(new Error('Telegram hat diesen Token nicht angenommen – bitte den Token aus BotFather noch einmal kopieren.'))
    await render(platform)
    await act(async () => button('Eigenen Bot einrichten').click())
    await act(async () => setValue(container.querySelector('input'), TOKEN))
    await submit()
    expect(container.querySelector('.field-error').textContent).toMatch(/nicht angenommen/)
    expect(onStatus).not.toHaveBeenCalled()
    expect(container.querySelector('input').value).toBe(TOKEN)
  })

  test('eingerichtet: „Eingerichtet · @name“, „Bot wechseln“ öffnet das Feld, „Bot entfernen“ fragt nach', async () => {
    removeTelegramBot.mockResolvedValue({ ...platform, getrennt: 'bot-gewechselt' })
    await render(own)
    expect(container.querySelector('.telegram-state.is-connected').textContent).toContain('Eingerichtet · @lindenhof_bot')
    await act(async () => button('Bot wechseln').click())
    expect(container.querySelector('form')).not.toBeNull()
    await act(async () => button('Abbrechen').click())
    expect(container.querySelector('form')).toBeNull()

    const remove = button('Bot entfernen')
    await act(async () => remove.click())
    expect(removeTelegramBot).not.toHaveBeenCalled()
    await act(async () => container.querySelector('.telegram-actions .btn-danger').click())
    expect(removeTelegramBot).toHaveBeenCalledTimes(1)
    expect(onStatus).toHaveBeenCalledWith({ ...platform, getrennt: 'bot-gewechselt' })
  })

  test('Demo: sichtbar, aber gesperrt', async () => {
    await render(own, { isDemo: true })
    expect(button('Bot wechseln').disabled).toBe(true)
    expect(container.querySelector('.telegram-actions .btn-danger, .telegram-actions button:last-child').disabled).toBe(true)
    expect(container.textContent).toContain('In der Demo nicht möglich.')
  })
})
