// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'
import HinweisCarousel from './HinweisCarousel.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const WARTUNG = { id: 3, titel: 'Wartung heute Abend', text: 'Ab 22 Uhr kurz nicht erreichbar.\nDanach läuft alles wieder.', stufe: 'wartung' }
const NEU = { id: 2, titel: 'Neu: Kalender für Partner', text: null, stufe: 'info' }
const WICHTIG = { id: 1, titel: 'Bitte Schlüssel sichern', text: 'Einmal notieren.', stufe: 'wichtig' }

let container
let root

afterEach(() => {
  if (root) act(() => root.unmount())
  root = null
  container?.remove()
  container = null
})

function render(props) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root.render(<HinweisCarousel {...props} />))
  return container
}

const region = () => container.querySelector('[role="region"]')
const button = (label) =>
  [...container.querySelectorAll('button')].find((btn) => btn.getAttribute('aria-label') === label || btn.textContent.trim() === label)
const titel = () => container.querySelector('.hinweis-titel-text').textContent
const live = () => container.querySelector('[aria-live="polite"]')
const click = (el) => act(() => el.click())

describe('HinweisCarousel – ein Hinweis', () => {
  test('Region "Hinweise", Titel, Text erst nach „Mehr“ (aria-expanded), kein Blättern', () => {
    render({ hinweise: [WARTUNG], onDismiss: () => {} })
    expect(region().getAttribute('aria-label')).toBe('Hinweise')
    expect(titel()).toBe('Wartung heute Abend')
    expect(container.querySelector('.hinweis-count')).toBeNull()
    expect(button('Nächster Hinweis')).toBeUndefined()

    const text = container.querySelector('.hinweis-text')
    const more = button('Mehr')
    expect(more.getAttribute('aria-expanded')).toBe('false')
    expect(more.getAttribute('aria-controls')).toBe(text.id)
    expect(text.hidden).toBe(true)

    click(more)
    expect(more.getAttribute('aria-expanded')).toBe('true')
    expect(more.textContent).toContain('Weniger')
    expect(text.hidden).toBe(false)
    // Zeilenumbrüche bleiben im Text (white-space: pre-line in hinweise.css), kein HTML.
    expect(text.textContent).toBe(WARTUNG.text)
  })

  test('ohne Text kein „Mehr“; Stufe als Klasse und für Screenreader als Wort', () => {
    render({ hinweise: [NEU], onDismiss: () => {} })
    expect(button('Mehr')).toBeUndefined()
    expect(region().classList.contains('hinweis-info')).toBe(true)
    act(() => root.render(<HinweisCarousel hinweise={[WARTUNG]} onDismiss={() => {}} />))
    expect(region().classList.contains('hinweis-wartung')).toBe(true)
    expect(container.querySelector('.hinweis-stufe').textContent).toBe('Wartung')
  })

  test('Text wird nie als HTML gedeutet', () => {
    render({ hinweise: [{ ...WICHTIG, titel: '<b>fett</b>', text: '<img src=x onerror=alert(1)>' }], onDismiss: () => {} })
    expect(titel()).toBe('<b>fett</b>')
    expect(container.querySelector('b')).toBeNull()
    expect(container.querySelector('img')).toBeNull()
  })

  test('× ruft onDismiss mit der Id und hat ein sprechendes Label', () => {
    const onDismiss = vi.fn()
    render({ hinweise: [WARTUNG], onDismiss })
    click(button('Hinweis ausblenden'))
    expect(onDismiss).toHaveBeenCalledWith(3)
  })
})

describe('HinweisCarousel – mehrere Hinweise', () => {
  test('„1 / 3“, Weiter und Zurück (mit Umlauf), kein Auto-Wechsel', () => {
    vi.useFakeTimers()
    try {
      render({ hinweise: [WARTUNG, NEU, WICHTIG], onDismiss: () => {} })
      expect(container.querySelector('.hinweis-count').textContent).toContain('1 / 3')
      expect(titel()).toBe('Wartung heute Abend')
      act(() => vi.advanceTimersByTime(60_000))
      expect(titel()).toBe('Wartung heute Abend')

      click(button('Nächster Hinweis'))
      expect(titel()).toBe('Neu: Kalender für Partner')
      expect(container.querySelector('.hinweis-count').textContent).toContain('2 / 3')
      click(button('Vorheriger Hinweis'))
      click(button('Vorheriger Hinweis'))
      expect(titel()).toBe('Bitte Schlüssel sichern')
      click(button('Nächster Hinweis'))
      expect(titel()).toBe('Wartung heute Abend')
    } finally {
      vi.useRealTimers()
    }
  })

  test('aria-live sagt erst beim Wechsel etwas an, nicht beim Laden', () => {
    render({ hinweise: [WARTUNG, NEU, WICHTIG], onDismiss: () => {} })
    expect(live().textContent).toBe('')
    click(button('Nächster Hinweis'))
    expect(live().textContent).toBe('Hinweis 2 von 3: Neu: Kalender für Partner')
  })

  test('ein Wechsel klappt den Text wieder zu', () => {
    render({ hinweise: [WARTUNG, WICHTIG], onDismiss: () => {} })
    click(button('Mehr'))
    click(button('Nächster Hinweis'))
    expect(button('Mehr').getAttribute('aria-expanded')).toBe('false')
  })

  test('nach dem Wegklicken des letzten in der Reihe zeigt das Band den neuen letzten', () => {
    const onDismiss = vi.fn()
    render({ hinweise: [WARTUNG, NEU, WICHTIG], onDismiss })
    click(button('Vorheriger Hinweis'))
    click(button('Hinweis ausblenden'))
    expect(onDismiss).toHaveBeenCalledWith(1)
    act(() => root.render(<HinweisCarousel hinweise={[WARTUNG, NEU]} onDismiss={onDismiss} />))
    expect(titel()).toBe('Neu: Kalender für Partner')
    expect(container.querySelector('.hinweis-count').textContent).toContain('2 / 2')
    expect(live().textContent).toBe('Hinweis ausgeblendet.')
  })
})

test('ohne Hinweise rendert das Band nichts', () => {
  render({ hinweise: [], onDismiss: () => {} })
  expect(container.innerHTML).toBe('')
})

describe('HinweisCarousel – Vorschau im Admin', () => {
  test('eigene Beschriftung, × ohne Wirkung', () => {
    render({ hinweise: [WARTUNG], preview: true })
    expect(region().getAttribute('aria-label')).toBe('Vorschau des Hinweis-Bands')
    expect(button('Hinweis ausblenden').disabled).toBe(true)
  })
})
