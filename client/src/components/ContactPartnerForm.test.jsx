// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { contactPartner } = vi.hoisted(() => ({ contactPartner: vi.fn() }))
vi.mock('../api', () => ({ api: { contactPartner } }))

import ContactPartnerForm from './ContactPartnerForm.jsx'
import PortalContact from './PortalContact.jsx'
import { PreviewProvider } from '../lib/preview.js'

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

const partner = {
  id: 4,
  slug: 'hundeschule-wiesengrund',
  name: 'Hundeschule Wiesengrund',
  typ: 'hundeschule',
  website: 'https://wiesengrund.example.org',
  kontakt_email: 'info@wiesengrund.example.org',
  kontakt_telefon: '040 123456',
  kontakt_formular_url: 'https://wiesengrund.example.org/kontakt',
  kontaktformular: true
}

const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
const nativeTextareaValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set

function type(element, value) {
  const setter = element.tagName === 'TEXTAREA' ? nativeTextareaValueSetter : nativeInputValueSetter
  setter.call(element, value)
  element.dispatchEvent(new Event('input', { bubbles: true }))
}

function apiError(message, status) {
  return Object.assign(new Error(message), { status })
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
  contactPartner.mockReset()
})

async function render(ui, path = '/p/hundeschule-wiesengrund') {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>))
  return container
}

const field = (id) => container.querySelector(`#contact-partner-${id}`)

async function submit() {
  await act(async () => container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
}

describe('ContactPartnerForm – Prüfung', () => {
  test('ohne E-Mail und Telefon: Fehler am Feld, Fokus dorthin, nichts wird geschickt', async () => {
    await render(<ContactPartnerForm partner={partner} />)
    type(field('nachricht'), 'Habt ihr noch Plätze im Welpenkurs?')
    await submit()

    expect(contactPartner).not.toHaveBeenCalled()
    expect(field('email').getAttribute('aria-invalid')).toBe('true')
    expect(container.querySelector('#contact-partner-email-error').textContent).toBe(
      'Bitte gib eine E-Mail-Adresse oder Telefonnummer an, damit du eine Antwort bekommst.'
    )
    expect(document.activeElement).toBe(field('email'))

    // Telefon statt E-Mail reicht - der Fehler verschwindet beim Tippen.
    type(field('telefon'), '0171 2345678')
    expect(container.querySelector('#contact-partner-email-error')).toBeNull()
  })

  test('Nachricht zu kurz: Fehler an der Nachricht, der Zähler zeigt die Länge', async () => {
    await render(<ContactPartnerForm partner={partner} />)
    type(field('email'), 'wilma@example.org')
    type(field('nachricht'), 'Hallo')
    expect(container.querySelector('#contact-partner-nachricht-hint').textContent).toBe('5 / 2000 Zeichen · mindestens 10')
    await submit()

    expect(contactPartner).not.toHaveBeenCalled()
    expect(container.querySelector('#contact-partner-nachricht-error').textContent).toBe('Die Nachricht muss 10 bis 2000 Zeichen haben.')
    expect(field('nachricht').getAttribute('maxlength')).toBe('2000')
  })

  test('Honigtopf "website": versteckt, nicht per Tab erreichbar, ohne Autofill', async () => {
    await render(<ContactPartnerForm partner={partner} />)
    const honeypot = container.querySelector('#contact-partner-hp')
    expect(honeypot.closest('.honeypot').getAttribute('aria-hidden')).toBe('true')
    expect(honeypot.getAttribute('tabindex')).toBe('-1')
    expect(honeypot.getAttribute('autocomplete')).toBe('off')
  })

  test('Datenschutz-Hinweis mit Link auf /datenschutz', async () => {
    await render(<ContactPartnerForm partner={partner} />)
    const privacy = container.querySelector('.contact-partner-privacy')
    expect(privacy.textContent).toContain(
      'Deine Angaben gehen nur an Hundeschule Wiesengrund. Wir verschicken keine E-Mails; Nachrichten werden nach 180 Tagen gelöscht.'
    )
    expect(privacy.querySelector('a').getAttribute('href')).toBe('/datenschutz')
  })
})

describe('ContactPartnerForm – Absenden', () => {
  test('Erfolg: schickt die Nachricht samt Honigtopf, dankt und leert das Formular', async () => {
    contactPartner.mockResolvedValue({ ok: true })
    await render(<ContactPartnerForm partner={partner} />)
    type(field('name'), 'Wilma')
    type(field('email'), 'wilma@example.org')
    type(field('nachricht'), '  Habt ihr noch Plätze im Welpenkurs?  ')
    await submit()

    expect(contactPartner).toHaveBeenCalledWith(
      'hundeschule-wiesengrund',
      { name: 'Wilma', email: 'wilma@example.org', telefon: undefined, nachricht: 'Habt ihr noch Plätze im Welpenkurs?', website: '' },
      { demo: undefined }
    )
    expect(container.querySelector('[role="status"]').textContent).toBe('Danke! Hundeschule Wiesengrund meldet sich bei dir.')
    expect(field('name').value).toBe('')
    expect(field('email').value).toBe('')
    expect(field('nachricht').value).toBe('')
  })

  test('403 in der Demo: die Meldung des Servers steht oben, der Fokus springt hin', async () => {
    contactPartner.mockRejectedValue(apiError('In der Demo werden keine Nachrichten verschickt.', 403))
    await render(<ContactPartnerForm partner={partner} demo="1" />)
    type(field('email'), 'wilma@example.org')
    type(field('nachricht'), 'Habt ihr noch Plätze im Welpenkurs?')
    await submit()

    expect(contactPartner.mock.calls[0][2]).toEqual({ demo: '1' })
    const banner = container.querySelector('.error-banner')
    expect(banner.textContent).toBe('In der Demo werden keine Nachrichten verschickt.')
    expect(document.activeElement).toBe(banner)
    expect(field('nachricht').value).toBe('Habt ihr noch Plätze im Welpenkurs?')
  })

  test('429: eigener, kurzer Satz', async () => {
    contactPartner.mockRejectedValue(apiError('Zu viele Nachrichten in kurzer Zeit – bitte später noch einmal versuchen.', 429))
    await render(<ContactPartnerForm partner={partner} />)
    type(field('telefon'), '0171 2345678')
    type(field('nachricht'), 'Habt ihr noch Plätze im Welpenkurs?')
    await submit()

    expect(container.querySelector('.error-banner').textContent).toBe('Zu viele Nachrichten – bitte später noch einmal.')
  })

  test('400 vom Server zur E-Mail: Fehler am Feld', async () => {
    contactPartner.mockRejectedValue(apiError('Die E-Mail-Adresse ist ungültig', 400))
    await render(<ContactPartnerForm partner={partner} />)
    type(field('email'), 'wilma@beispiel')
    type(field('nachricht'), 'Habt ihr noch Plätze im Welpenkurs?')
    await submit()

    expect(container.querySelector('#contact-partner-email-error').textContent).toBe('Die E-Mail-Adresse ist ungültig')
    expect(document.activeElement).toBe(field('email'))
  })

  test('bezugSlug geht mit, wenn gesetzt', async () => {
    contactPartner.mockResolvedValue({ ok: true })
    await render(<ContactPartnerForm partner={partner} bezugSlug="benno-ab12cd" />)
    type(field('email'), 'wilma@example.org')
    type(field('nachricht'), 'Ist Benno noch zu haben?')
    await submit()

    expect(contactPartner.mock.calls[0][1].bezugSlug).toBe('benno-ab12cd')
  })
})

describe('PortalContact – Kontakt-Kasten (Phase P2)', () => {
  function button(label) {
    return [...container.querySelectorAll('button')].find((btn) => btn.textContent.trim() === label)
  }

  test('"Schreib uns" öffnet das Formular im Modal; eigenes Kontaktformular extern mit noopener noreferrer', async () => {
    await render(<PortalContact partner={partner} />)

    expect(container.querySelector('h2').textContent).toBe('Kontakt')
    const external = [...container.querySelectorAll('a')].find((a) => a.textContent.includes('Zum Kontaktformular von Hundeschule Wiesengrund'))
    expect(external.getAttribute('href')).toBe('https://wiesengrund.example.org/kontakt')
    expect(external.getAttribute('target')).toBe('_blank')
    expect(external.getAttribute('rel')).toBe('noopener noreferrer')
    expect(container.querySelector('a[href="mailto:info@wiesengrund.example.org"]')).not.toBeNull()
    expect(container.querySelector('a[href="tel:040123456"]')).not.toBeNull()

    expect(container.querySelector('dialog').open).toBe(false)
    await act(async () => button('Schreib uns').click())
    expect(container.querySelector('dialog').open).toBe(true)
    expect(container.querySelector('#modal-title').textContent).toBe('Nachricht an Hundeschule Wiesengrund')
    expect(container.querySelector('dialog form.contact-partner-form')).not.toBeNull()
  })

  test('ohne kontaktformular: true vom Server kein "Schreib uns" (der Rest bleibt)', async () => {
    const { kontaktformular, ...withoutFlag } = partner
    await render(<PortalContact partner={withoutFlag} />)
    expect(button('Schreib uns')).toBeUndefined()
    expect(container.textContent).toContain('Zum Kontaktformular von Hundeschule Wiesengrund')

    act(() => root.unmount())
    container.remove()
    await render(<PortalContact partner={{ ...partner, kontaktformular: false }} />)
    expect(button('Schreib uns')).toBeUndefined()
  })

  test('Kundensicht: "Schreib uns" sichtbar, aber deaktiviert ("In der Vorschau deaktiviert")', async () => {
    await render(
      <PreviewProvider value>
        <PortalContact partner={partner} />
      </PreviewProvider>
    )

    const writeUs = button('Schreib uns')
    expect(writeUs.disabled).toBe(true)
    expect(writeUs.getAttribute('title')).toBe('In der Vorschau deaktiviert')
    expect(container.textContent).toContain('In der Vorschau deaktiviert')
    expect(container.querySelector('dialog')).toBeNull()
    expect(container.querySelector('a[href="https://wiesengrund.example.org/kontakt"]')).toBeNull()
  })

  test('Kundensicht ohne kontaktformular: kein Knopf', async () => {
    await render(
      <PreviewProvider value>
        <PortalContact partner={{ ...partner, kontaktformular: false }} />
      </PreviewProvider>
    )
    expect(button('Schreib uns')).toBeUndefined()
  })

  test('Demo-Partner (kontaktformularDemo): "Schreib uns" sichtbar, aber gesperrt, mit Hinweis - kein Modal', async () => {
    await render(<PortalContact partner={{ ...partner, kontaktformular: false, kontaktformularDemo: true }} />)

    const writeUs = button('Schreib uns')
    expect(writeUs.disabled).toBe(true)
    expect(writeUs.getAttribute('title')).toBe('In der Demo werden keine Nachrichten verschickt.')
    expect(writeUs.getAttribute('aria-description')).toBe('In der Demo werden keine Nachrichten verschickt.')
    expect(container.querySelector('.contact-partner-preview .field-hint').textContent).toBe('In der Demo werden keine Nachrichten verschickt.')
    expect(container.querySelector('dialog')).toBeNull()
  })

  test('die alten Felder kontaktformularAktiv/kontaktformular_aktiv zählen nicht mehr', async () => {
    const { kontaktformular, ...withoutFlag } = partner
    await render(<PortalContact partner={{ ...withoutFlag, kontaktformularAktiv: true, kontaktformular_aktiv: 1 }} />)
    expect(button('Schreib uns')).toBeUndefined()
  })
})
