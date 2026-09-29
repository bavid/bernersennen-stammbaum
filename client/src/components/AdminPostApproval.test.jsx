// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { promotions, approvePromotion, rejectPromotion, createPromotion, updatePromotion, deletePromotion, uploadPromotionImage } = vi.hoisted(
  () => ({
    promotions: vi.fn(),
    approvePromotion: vi.fn(),
    rejectPromotion: vi.fn(),
    createPromotion: vi.fn(),
    updatePromotion: vi.fn(),
    deletePromotion: vi.fn(),
    uploadPromotionImage: vi.fn()
  })
)
vi.mock('../api', () => ({
  api: { admin: { promotions, approvePromotion, rejectPromotion, createPromotion, updatePromotion, deletePromotion, uploadPromotionImage } }
}))

import AdminPostApproval from './AdminPostApproval.jsx'
import AdminPromotions from './AdminPromotions.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

// Admin-Zeilen (snake_case) wie GET /api/admin/promotions, mit partnerName und erstelltVonPartner.
function row(overrides) {
  return {
    id: 11,
    partner_id: 4,
    partnerName: 'Hundeschule Pfotenglück',
    erstelltVonPartner: true,
    bereich: 'hundeschule',
    kennzeichnung: 'Anzeige',
    empfohlen_von: null,
    titel: 'Tag der offenen Tür',
    text: 'Kommt vorbei und lernt uns kennen.',
    url: 'https://example.org/offene-tuer',
    bildUrl: null,
    tierart: null,
    aktiv: 1,
    start: '2026-10-03',
    ende: null,
    sort: 0,
    is_demo: 0,
    freigabe: 'eingereicht',
    ablehnungsgrund: null,
    clicks7: 0,
    clicksTotal: 0,
    ...overrides
  }
}

const nativeTextareaValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set

function typeInto(textarea, value) {
  nativeTextareaValueSetter.call(textarea, value)
  textarea.dispatchEvent(new Event('input', { bubbles: true }))
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
  for (const mock of [promotions, approvePromotion, rejectPromotion, createPromotion, updatePromotion, deletePromotion, uploadPromotionImage]) {
    mock.mockReset()
  }
})

async function render(ui) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(ui))
  return container
}

function button(text, scope = container) {
  return [...scope.querySelectorAll('button')].find((btn) => btn.textContent.trim() === text)
}

async function click(element) {
  await act(async () => element.click())
}

describe('AdminPostApproval – "Zur Freigabe"', () => {
  test('lädt die eingereichten Beiträge, zählt sie und zeigt Partner und Vorschau (Link deaktiviert)', async () => {
    promotions.mockResolvedValue([row(), row({ id: 12, titel: 'Herbst-Pflegetag', partnerName: 'Hundesalon Flocke', bereich: 'salon' })])
    const onCountChange = vi.fn()
    await render(<AdminPostApproval onCountChange={onCountChange} />)

    expect(promotions).toHaveBeenCalledWith({ freigabe: 'eingereicht' })
    expect(container.querySelector('h2').textContent).toBe('Zur Freigabe 2 Beiträge warten')
    expect(container.querySelector('.admin-approval-count').textContent).toBe('2 Beiträge warten')
    expect(onCountChange).toHaveBeenLastCalledWith(2)

    const [first, second] = container.querySelectorAll('.admin-approval-item')
    expect(first.querySelector('.admin-approval-partner').textContent).toBe('von Partner Hundeschule Pfotenglück')
    expect(second.textContent).toContain('Salon & Betreuung')
    const preview = first.querySelector('.promotion-card')
    expect(preview.querySelector('.promotion-badge').textContent).toBe('Anzeige')
    expect(preview.querySelector('h3').textContent).toBe('Tag der offenen Tür')
    expect(preview.querySelector('a')).toBeNull()
    expect(preview.querySelector('[role="link"][aria-disabled="true"]')).not.toBeNull()
  })

  test('nichts zu prüfen: freundlicher Hinweis, Zähler 0', async () => {
    promotions.mockResolvedValue([])
    const onCountChange = vi.fn()
    await render(<AdminPostApproval onCountChange={onCountChange} />)

    expect(container.textContent).toContain('Nichts zu prüfen')
    expect(container.querySelector('.admin-approval-count')).toBeNull()
    expect(onCountChange).toHaveBeenLastCalledWith(0)
  })

  test('Freigeben ruft die API und nimmt den Beitrag aus der Liste', async () => {
    promotions.mockResolvedValue([row(), row({ id: 12, titel: 'Herbst-Pflegetag' })])
    approvePromotion.mockResolvedValue(row({ freigabe: 'freigegeben' }))
    const onChanged = vi.fn()
    const onCountChange = vi.fn()
    await render(<AdminPostApproval onChanged={onChanged} onCountChange={onCountChange} />)

    await click(button('Freigeben', container.querySelector('.admin-approval-item')))

    expect(approvePromotion).toHaveBeenCalledWith(11)
    expect([...container.querySelectorAll('.admin-approval-item h3')].map((h) => h.textContent)).toEqual(['Herbst-Pflegetag'])
    expect(onChanged).toHaveBeenCalledTimes(1)
    expect(onCountChange).toHaveBeenLastCalledWith(1)
  })

  test('Ablehnen verlangt einen Grund mit 3-300 Zeichen und schickt ihn mit', async () => {
    promotions.mockResolvedValue([row()])
    rejectPromotion.mockResolvedValue(row({ freigabe: 'abgelehnt', ablehnungsgrund: 'Bitte ohne Preisangaben im Titel.' }))
    await render(<AdminPostApproval />)

    await click(button('Ablehnen …'))
    const textarea = container.querySelector('#admin-reject-grund-11')
    expect(textarea.getAttribute('maxlength')).toBe('300')

    // Ohne Grund: Fehler am Feld, keine Anfrage.
    await act(async () => container.querySelector('.admin-approval-reject').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(rejectPromotion).not.toHaveBeenCalled()
    expect(container.querySelector('#admin-reject-grund-11-error').textContent).toBe('Bitte einen Grund mit 3 bis 300 Zeichen angeben')
    expect(textarea.getAttribute('aria-invalid')).toBe('true')
    expect(document.activeElement).toBe(textarea)

    typeInto(textarea, '  ok ')
    await act(async () => container.querySelector('.admin-approval-reject').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(rejectPromotion).not.toHaveBeenCalled()

    typeInto(textarea, '  Bitte ohne Preisangaben im Titel.  ')
    await act(async () => container.querySelector('.admin-approval-reject').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(rejectPromotion).toHaveBeenCalledWith(11, 'Bitte ohne Preisangaben im Titel.')
    expect(container.querySelector('.admin-approval-item')).toBeNull()
  })

  test('ein Fehler beim Freigeben erscheint oben, der Beitrag bleibt', async () => {
    promotions.mockResolvedValue([row()])
    approvePromotion.mockRejectedValue(new Error('Diese Empfehlung gibt es nicht'))
    await render(<AdminPostApproval />)

    await click(button('Freigeben'))
    expect(container.querySelector('[role="alert"]').textContent).toBe('Diese Empfehlung gibt es nicht')
    expect(container.querySelector('.admin-approval-item')).not.toBeNull()
  })

  test('lädt neu, wenn sich version ändert', async () => {
    promotions.mockResolvedValue([row()])
    await render(<AdminPostApproval version={0} />)
    promotions.mockResolvedValue([])
    await act(async () => root.render(<AdminPostApproval version={1} />))

    expect(promotions).toHaveBeenCalledTimes(2)
    expect(container.querySelector('.admin-approval-item')).toBeNull()
  })
})

describe('AdminPromotions – Freigabe und Herkunft (Phase P2)', () => {
  test('zeigt den Freigabe-Chip, "von Partner {Name}" bei Beiträgen der Partner und den Ablehnungsgrund', async () => {
    promotions.mockResolvedValue([
      row(),
      row({ id: 12, titel: 'Agility-Schnupperstunde', freigabe: 'abgelehnt', ablehnungsgrund: 'Bitte ohne Preisangaben im Titel.' }),
      row({ id: 13, titel: 'Futterhof Deichland', partner_id: null, partnerName: null, erstelltVonPartner: false, freigabe: 'freigegeben' })
    ])
    await render(<AdminPromotions partners={[]} />)

    const rows = [...container.querySelectorAll('.admin-promo-row')]
    expect(rows[0].querySelector('.freigabe-chip').textContent).toBe('Wartet auf Freigabe')
    expect(rows[0].querySelector('.admin-promo-origin').textContent).toBe('von Partner Hundeschule Pfotenglück')
    expect(rows[1].querySelector('.freigabe-chip').textContent).toBe('Abgelehnt')
    expect(rows[1].querySelector('.admin-promo-reason').textContent).toBe('Abgelehnt: Bitte ohne Preisangaben im Titel.')
    expect(rows[2].querySelector('.freigabe-chip').textContent).toBe('Freigegeben')
    expect(rows[2].querySelector('.admin-promo-origin')).toBeNull()
  })

  test('mit onChanged meldet Löschen die Änderung (AdminPage lädt beide Karten neu)', async () => {
    promotions.mockResolvedValue([row()])
    deletePromotion.mockResolvedValue(null)
    const onChanged = vi.fn()
    await render(<AdminPromotions partners={[]} onChanged={onChanged} />)

    const remove = container.querySelector('.admin-promo-row .btn-danger')
    await click(remove)
    await click(remove)
    expect(deletePromotion).toHaveBeenCalledWith(11)
    expect(onChanged).toHaveBeenCalledTimes(1)
    expect(promotions).toHaveBeenCalledTimes(1)
  })
})
