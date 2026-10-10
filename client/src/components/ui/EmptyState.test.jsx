// @vitest-environment jsdom
import { describe, expect, test } from 'vitest'
import EmptyState from './EmptyState.jsx'
import { render } from './renderForTest.js'

describe('EmptyState', () => {
  test('Zeichen (verborgen), Titel, Text und Aktion', () => {
    const empty = render(
      <EmptyState icon="image" title="Noch keine Fotos" action={<button type="button">Foto hinzufügen</button>}>
        Ladet das erste Bild hoch.
      </EmptyState>
    )
    expect(empty.className).toBe('ui-empty')
    expect(empty.querySelector('.ui-empty-icon').getAttribute('aria-hidden')).toBe('true')
    expect(empty.querySelector('.ui-empty-title').textContent).toBe('Noch keine Fotos')
    expect(empty.querySelector('.ui-empty-text').textContent).toBe('Ladet das erste Bild hoch.')
    expect(empty.querySelector('.ui-empty-action button')).not.toBeNull()
    expect(empty.getAttribute('role')).toBeNull()
  })

  test('live meldet sich als Status; ohne Icon kein Zeichen', () => {
    const empty = render(<EmptyState icon={null} title="Leer" live />)
    expect(empty.getAttribute('role')).toBe('status')
    expect(empty.querySelector('.ui-empty-icon')).toBeNull()
  })
})
