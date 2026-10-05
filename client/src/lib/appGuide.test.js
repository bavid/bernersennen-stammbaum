import { describe, expect, test } from 'vitest'
import { GUIDES, PLATFORMS, STORES_LINE, guideFor, isPlatform } from './appGuide.js'

describe('appGuide: die Anleitung je Gerät', () => {
  test('drei Geräte, jedes mit Schritten und Symbolen', () => {
    expect(PLATFORMS.map((p) => p.key)).toEqual(['android', 'ios', 'desktop'])
    for (const { key } of PLATFORMS) {
      const guide = GUIDES[key]
      expect(guide.steps.length).toBeGreaterThanOrEqual(2)
      for (const step of guide.steps) {
        expect(step.icon).toMatch(/^[a-z]+$/)
        expect(step.text.length).toBeGreaterThan(10)
      }
    }
  })

  test('iPhone: Teilen → ggf. scrollen/„Mehr“ → Zum Home-Bildschirm → Hinzufügen, andere iOS-Browser und „in Safari öffnen“', () => {
    const text = GUIDES.ios.steps.map((s) => s.text).join(' ')
    expect(text).toMatch(/Teilen-Symbol/)
    expect(text).toMatch(/Quadrat mit dem Pfeil/)
    expect(text).toMatch(/„Mehr“/)
    expect(text).toMatch(/Zum Home-Bildschirm/)
    expect(text).toMatch(/Hinzufügen/)
    expect(GUIDES.ios.notes.join(' ')).toMatch(/Chrome oder Firefox/)
    expect(GUIDES.ios.notes.join(' ')).toMatch(/in Safari öffnen/)
  })

  test('Android nennt den Installieren-Knopf und ⋮ → „App installieren“, Desktop die Adressleiste', () => {
    expect(GUIDES.android.steps.map((s) => s.text).join(' ')).toMatch(/⋮.*„App installieren“/)
    expect(GUIDES.desktop.steps[0].text).toMatch(/Adressleiste/)
  })

  test('unbekannte Geräte fallen auf PC & Laptop; ehrliche Zeile zu den Stores ohne „bald“', () => {
    expect(isPlatform('ios')).toBe(true)
    expect(isPlatform('toaster')).toBe(false)
    expect(guideFor('toaster')).toBe(GUIDES.desktop)
    expect(guideFor('android')).toBe(GUIDES.android)
    expect(STORES_LINE).toMatch(/Später auch in den App Stores/)
    expect(STORES_LINE).not.toMatch(/bald/)
  })
})
