// @vitest-environment jsdom
import { describe, expect, test } from 'vitest'
import SectionHeader from './SectionHeader.jsx'
import { render } from './renderForTest.js'

describe('SectionHeader', () => {
  test('Titel als h2 mit id, Erklärung und Aktion', () => {
    const header = render(
      <SectionHeader id="fotos" title="Fotos" description="Die schönsten Bilder" action={<button type="button">Neu</button>} />
    )
    expect(header.tagName).toBe('HEADER')
    const heading = header.querySelector('h2')
    expect(heading.id).toBe('fotos')
    expect(heading.textContent).toBe('Fotos')
    expect(header.querySelector('.ui-section-header-desc').textContent).toBe('Die schönsten Bilder')
    expect(header.querySelector('.ui-section-header-action button')).not.toBeNull()
  })

  test('Ebene 3 und 4 möglich, Unsinn wird h2; ohne Aktion kein leerer Platz', () => {
    expect(render(<SectionHeader title="a" level={3} />).querySelector('h3')).not.toBeNull()
    const header = render(<SectionHeader title="a" level={9} />)
    expect(header.querySelector('h2')).not.toBeNull()
    expect(header.querySelector('.ui-section-header-action')).toBeNull()
    expect(header.querySelector('.ui-section-header-desc')).toBeNull()
  })
})
