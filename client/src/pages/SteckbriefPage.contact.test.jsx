// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { publicAnimal, contactPartner } = vi.hoisted(() => ({ publicAnimal: vi.fn(), contactPartner: vi.fn() }))
vi.mock('../api', () => ({ api: { publicAnimal, contactPartner } }))

import SteckbriefPage from './SteckbriefPage.jsx'
import { ThemeProvider } from '../themes/ThemeProvider.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

// jsdom implementiert <dialog> nicht vollständig (kein showModal/close) - "Schreib uns" öffnet ein Modal.
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function close() {
    this.open = false
  }
}

let container
let root

const shelter = {
  name: 'Tierheim Sonnenhang',
  slug: 'tierheim-sonnenhang',
  website: 'https://sonnenhang.example.org',
  kontakt_email: 'info@sonnenhang.example.org',
  kontakt_telefon: '030 1234567',
  vermittlung_url: null,
  logoUrl: null,
  kontaktformular: true
}

const animal = {
  name: 'Benno',
  tierart: 'hund',
  geschlecht: 'ruede',
  rasse: 'Mischling',
  geburtsdatum: '2021-05-01',
  beschreibung: 'Benno mag lange Spaziergänge.',
  fotoUrl: null,
  vermittlung_status: 'in_vermittlung',
  entries: [],
  shelter
}

const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
const nativeTextareaValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set

function type(element, value) {
  const setter = element.tagName === 'TEXTAREA' ? nativeTextareaValueSetter : nativeInputValueSetter
  setter.call(element, value)
  element.dispatchEvent(new Event('input', { bubbles: true }))
}

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  if (container) {
    container.remove()
    container = null
  }
  publicAnimal.mockReset()
  contactPartner.mockReset()
})

async function render(props = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter>
        <ThemeProvider themeId="standard">
          <SteckbriefPage slug="benno-ab12cd" {...props} />
        </ThemeProvider>
      </MemoryRouter>
    )
  )
  return container
}

function button(label) {
  return [...container.querySelectorAll('button')].find((btn) => btn.textContent.trim() === label)
}

describe('SteckbriefPage – "Schreib uns zu {Tiername}" (Phase P2)', () => {
  test('öffnet das Formular für das Tierheim und schickt bezugSlug des Tiers mit', async () => {
    publicAnimal.mockResolvedValue(animal)
    contactPartner.mockResolvedValue({ ok: true })
    await render()

    await act(async () => button('Schreib uns zu Benno').click())
    expect(container.querySelector('#modal-title').textContent).toBe('Nachricht an Tierheim Sonnenhang')

    type(container.querySelector('#contact-partner-email'), 'lotte@example.org')
    type(container.querySelector('#contact-partner-nachricht'), 'Ist Benno noch zu haben? Wir würden ihn gern kennenlernen.')
    await act(async () => container.querySelector('dialog form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))

    expect(contactPartner).toHaveBeenCalledTimes(1)
    const [slug, payload] = contactPartner.mock.calls[0]
    expect(slug).toBe('tierheim-sonnenhang')
    expect(payload.bezugSlug).toBe('benno-ab12cd')
    expect(container.querySelector('dialog [role="status"]').textContent).toBe('Danke! Tierheim Sonnenhang meldet sich bei dir.')
  })

  test('ohne kontaktformular: true vom Server kein Knopf - Website, E-Mail und Telefon bleiben', async () => {
    const { kontaktformular, ...withoutFlag } = shelter
    publicAnimal.mockResolvedValue({ ...animal, shelter: withoutFlag })
    await render()

    expect(button('Schreib uns zu Benno')).toBeUndefined()
    expect(container.querySelector('a[href="mailto:info@sonnenhang.example.org"]')).not.toBeNull()
    const portal = [...container.querySelectorAll('a')].find((a) => a.textContent.includes('Zum Portal von Tierheim Sonnenhang'))
    expect(portal.classList.contains('btn-primary')).toBe(true)
  })

  test('Kundensicht: der Knopf ist sichtbar, aber deaktiviert', async () => {
    const load = vi.fn().mockResolvedValue({ ...animal, vorschau: true })
    await render({ slug: undefined, load, preview: true })

    const writeUs = button('Schreib uns zu Benno')
    expect(writeUs.disabled).toBe(true)
    expect(writeUs.getAttribute('title')).toBe('In der Vorschau deaktiviert')
    expect(container.querySelector('dialog')).toBeNull()
  })

  test('Demo-Tierheim (kontaktformularDemo): der Knopf ist gesperrt, mit Hinweis', async () => {
    publicAnimal.mockResolvedValue({ ...animal, shelter: { ...shelter, kontaktformular: false, kontaktformularDemo: true } })
    await render()

    const writeUs = button('Schreib uns zu Benno')
    expect(writeUs.disabled).toBe(true)
    expect(container.querySelector('.steckbrief-shelter').textContent).toContain('In der Demo werden keine Nachrichten verschickt.')
    expect(container.querySelector('dialog')).toBeNull()
    expect(contactPartner).not.toHaveBeenCalled()
  })
})
