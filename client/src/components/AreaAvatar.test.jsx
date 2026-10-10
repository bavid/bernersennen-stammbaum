// @vitest-environment jsdom
import { describe, expect, test } from 'vitest'
import AreaAvatar from './AreaAvatar.jsx'
import { render } from './ui/renderForTest.js'

describe('AreaAvatar (Profil)', () => {
  test('mit Bild: das Bild, schmückend (leeres alt, aria-hidden)', () => {
    const el = render(<AreaAvatar name="Familie Sonnenhang" bild="/api/profil/3/bild?v=ab" size="lg" />)
    expect(el.getAttribute('aria-hidden')).toBe('true')
    expect(el.className).toContain('area-avatar--lg')
    expect(el.querySelector('img').getAttribute('src')).toBe('/api/profil/3/bild?v=ab')
    expect(el.querySelector('img').getAttribute('alt')).toBe('')
    expect(el.hasAttribute('data-initial')).toBe(false)
  })

  test('ohne Bild: der Anfangsbuchstabe - kein Text im Element', () => {
    const el = render(<AreaAvatar name="Zuhause Lindenhof (Demo)" bild={null} />)
    expect(el.querySelector('img')).toBeNull()
    expect(el.getAttribute('data-initial')).toBe('L')
    expect(el.textContent).toBe('')
  })
})
