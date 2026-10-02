// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  promotions: vi.fn(),
  approvePromotion: vi.fn(),
  rejectPromotion: vi.fn(),
  approvePromotions: vi.fn(),
  decidedPromotions: vi.fn(),
  promotionVerlauf: vi.fn(),
  createPromotion: vi.fn(),
  updatePromotion: vi.fn(),
  deletePromotion: vi.fn(),
  uploadPromotionImage: vi.fn()
}))
const { promotions, approvePromotion, rejectPromotion, approvePromotions, decidedPromotions, promotionVerlauf, deletePromotion } = mocks
vi.mock('../api', () => ({ api: { admin: mocks } }))

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
const nativeSelectValueSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set

function typeInto(textarea, value) {
  nativeTextareaValueSetter.call(textarea, value)
  textarea.dispatchEvent(new Event('input', { bubbles: true }))
}

async function choose(select, value) {
  await act(async () => {
    nativeSelectValueSetter.call(select, value)
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
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
  for (const mock of Object.values(mocks)) mock.mockReset()
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

  test('Fokus: "Ablehnen …" öffnet die Auswahl, "Abbrechen" führt zurück, nach der Entscheidung Überschrift und Status', async () => {
    promotions.mockResolvedValue([row(), row({ id: 12, titel: 'Herbst-Pflegetag' })])
    approvePromotion.mockResolvedValue(row({ freigabe: 'freigegeben' }))
    rejectPromotion.mockResolvedValue(row({ id: 12, freigabe: 'abgelehnt' }))
    await render(<AdminPostApproval />)
    const status = container.querySelector('.admin-approval-status')
    expect(status.getAttribute('role')).toBe('status')
    expect(status.textContent).toBe('')

    const [first] = container.querySelectorAll('.admin-approval-item')
    await click(button('Ablehnen …', first))
    expect(document.activeElement).toBe(container.querySelector('#admin-reject-vorlage-11'))
    await click(button('Abbrechen', first))
    expect(document.activeElement).toBe(button('Ablehnen …', first))

    await click(button('Freigeben', first))
    expect(document.activeElement).toBe(container.querySelector('#admin-approval-title'))
    expect(container.querySelector('.admin-approval-status')).toBe(status)
    expect(status.textContent).toBe('„Tag der offenen Tür“ freigegeben.')

    await click(button('Ablehnen …'))
    await choose(container.querySelector('#admin-reject-vorlage-12'), 'Kennzeichnung unklar')
    await act(async () => container.querySelector('.admin-approval-reject').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(status.textContent).toBe('„Herbst-Pflegetag“ abgelehnt.')
    expect(document.activeElement).toBe(container.querySelector('#admin-approval-title'))
  })

  test('mehr als 50 eingereicht: "Alle auswählen" nimmt die ersten 50, ein Hinweis sagt es', async () => {
    promotions.mockResolvedValue(Array.from({ length: 51 }, (_, index) => row({ id: 100 + index, titel: `Kurs ${index + 1}` })))
    await render(<AdminPostApproval />)

    expect(container.querySelector('.admin-approval-limit').textContent).toBe('Höchstens 50 auf einmal.')
    await click(container.querySelector('.admin-approval-select-all input'))
    const bulk = [...container.querySelectorAll('button')].find((btn) => btn.textContent.trim().startsWith('Ausgewählte freigeben'))
    expect(bulk.textContent.trim()).toBe('Ausgewählte freigeben (50)')
    expect(container.querySelector('input[aria-label="„Kurs 51“ auswählen"]')).toBeNull()
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

  test('Ablehnen: Vorlage wählen, optionaler Zusatz, "Sonstiges" braucht Text - geschickt wird { vorlage, text }', async () => {
    promotions.mockResolvedValue([row()])
    rejectPromotion.mockResolvedValue(row({ freigabe: 'abgelehnt', ablehnungsgrund: 'Link führt ins Leere – Die Kursseite fehlt.' }))
    await render(<AdminPostApproval />)
    const submitReject = () =>
      act(async () => container.querySelector('.admin-approval-reject').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))

    await click(button('Ablehnen …'))
    const select = container.querySelector('#admin-reject-vorlage-11')
    const textarea = container.querySelector('#admin-reject-text-11')
    expect([...select.options].map((option) => option.value)).toEqual([
      '',
      'Gesundheitsversprechen',
      'Kennzeichnung unklar',
      'Bild passt nicht / Rechte unklar',
      'Link führt ins Leere',
      'Kein Bezug zu Tieren',
      'Sonstiges'
    ])
    expect(container.querySelector('label[for="admin-reject-text-11"]').textContent).toBe('Zusatz (optional)')

    // Ohne Vorlage: Fehler an der Auswahl, keine Anfrage.
    await submitReject()
    expect(rejectPromotion).not.toHaveBeenCalled()
    expect(container.querySelector('#admin-reject-vorlage-11-error').textContent).toBe('Bitte einen Grund wählen')
    expect(select.getAttribute('aria-invalid')).toBe('true')
    expect(document.activeElement).toBe(select)

    // "Sonstiges" ohne Text: Fehler am Textfeld, das jetzt Pflicht ist.
    await choose(select, 'Sonstiges')
    expect(container.querySelector('label[for="admin-reject-text-11"]').textContent).toBe('Grund')
    await submitReject()
    expect(rejectPromotion).not.toHaveBeenCalled()
    expect(container.querySelector('#admin-reject-text-11-error').textContent).toBe('Bei „Sonstiges“ bitte den Grund kurz beschreiben')
    expect(document.activeElement).toBe(textarea)

    await choose(select, 'Link führt ins Leere')
    expect(textarea.getAttribute('maxlength')).toBe(String(300 - 'Link führt ins Leere'.length - 3))
    await act(async () => typeInto(textarea, '  Die Kursseite fehlt. '))
    expect(container.querySelector('.admin-approval-grund-preview').textContent).toBe('Der Partner liest: „Link führt ins Leere – Die Kursseite fehlt.“')
    await submitReject()
    expect(rejectPromotion).toHaveBeenCalledWith(11, { vorlage: 'Link führt ins Leere', text: 'Die Kursseite fehlt.' })
    expect(container.querySelector('.admin-approval-item')).toBeNull()
  })

  test('mehrere freigeben: auswählen (auch alle), "Ausgewählte freigeben", Ergebnis als Status', async () => {
    promotions.mockResolvedValue([row(), row({ id: 12, titel: 'Herbst-Pflegetag' }), row({ id: 13, titel: 'Agility für Einsteiger' })])
    approvePromotions.mockResolvedValue({ freigegeben: 1, uebersprungen: 1, ids: [11] })
    const onChanged = vi.fn()
    const onCountChange = vi.fn()
    await render(<AdminPostApproval onChanged={onChanged} onCountChange={onCountChange} />)

    const bulk = () => [...container.querySelectorAll('button')].find((btn) => btn.textContent.trim().startsWith('Ausgewählte freigeben'))
    const selectBox = (titel) => container.querySelector(`input[aria-label="„${titel}“ auswählen"]`)
    expect(bulk().disabled).toBe(true)

    const selectAll = container.querySelector('.admin-approval-select-all input')
    await click(selectAll)
    expect(bulk().textContent.trim()).toBe('Ausgewählte freigeben (3)')
    await click(selectAll)
    expect(bulk().disabled).toBe(true)

    await click(selectBox('Tag der offenen Tür'))
    await click(selectBox('Agility für Einsteiger'))
    expect(selectAll.checked).toBe(false)
    expect(bulk().textContent.trim()).toBe('Ausgewählte freigeben (2)')
    await click(bulk())

    expect(approvePromotions).toHaveBeenCalledWith([11, 13])
    // Freigegebene und übersprungene (nicht mehr eingereicht) verlassen die Liste.
    expect([...container.querySelectorAll('.admin-approval-item h3')].map((h) => h.textContent)).toEqual(['Herbst-Pflegetag'])
    expect(container.querySelector('.admin-approval-status').textContent).toBe('1 Beitrag freigegeben, 1 übersprungen (nicht mehr eingereicht).')
    expect(container.querySelector('.admin-approval-status').getAttribute('role')).toBe('status')
    expect(onChanged).toHaveBeenCalledTimes(1)
    expect(onCountChange).toHaveBeenLastCalledWith(1)
    expect(bulk().disabled).toBe(true)
  })

  test('Filter "zuletzt entschieden": Ergebnis, Zeitpunkt und Grund - ohne Auswahl, mit Umentscheiden', async () => {
    promotions.mockResolvedValue([row()])
    decidedPromotions.mockResolvedValue([
      row({ id: 21, titel: 'Agility-Schnupperstunde', freigabe: 'abgelehnt', entscheidung: 'abgelehnt', entschiedenAt: '2026-10-01 09:00:00', ablehnungsgrund: 'Kennzeichnung unklar' }),
      row({ id: 22, titel: 'Welpenkurs ab Oktober', freigabe: 'freigegeben', entscheidung: 'freigegeben', entschiedenAt: '2026-09-30 09:00:00' })
    ])
    approvePromotion.mockResolvedValue(row({ id: 21, freigabe: 'freigegeben' }))
    const onCountChange = vi.fn()
    await render(<AdminPostApproval onCountChange={onCountChange} />)
    expect(decidedPromotions).not.toHaveBeenCalled()

    const filter = button('Zuletzt entschieden')
    expect(button('Eingereicht').getAttribute('aria-pressed')).toBe('true')
    await click(filter)
    expect(filter.getAttribute('aria-pressed')).toBe('true')
    expect(decidedPromotions).toHaveBeenCalledTimes(1)

    const [rejected, approved] = container.querySelectorAll('.admin-approval-item')
    expect(rejected.querySelector('.freigabe-chip').textContent).toBe('Abgelehnt')
    expect(rejected.querySelector('.admin-approval-decision time').getAttribute('datetime')).toBe('2026-10-01T09:00:00Z')
    expect(rejected.querySelector('.admin-promo-reason').textContent).toBe('Grund: Kennzeichnung unklar')
    expect(approved.querySelector('.freigabe-chip').textContent).toBe('Freigegeben')
    expect(container.querySelector('.admin-approval-select-all')).toBeNull()
    expect(rejected.querySelector('input[type="checkbox"]')).toBeNull()
    expect(button('Ablehnen …', approved)).toBeDefined()
    expect(button('Freigeben', approved)).toBeUndefined()
    // Der Zähler am Reiter bleibt der der eingereichten.
    expect(onCountChange).toHaveBeenLastCalledWith(1)

    await click(button('Doch freigeben', rejected))
    expect(approvePromotion).toHaveBeenCalledWith(21)
    expect(decidedPromotions).toHaveBeenCalledTimes(2)

    await click(button('Eingereicht'))
    expect(container.querySelector('.admin-approval-item h3').textContent).toBe('Tag der offenen Tür')
  })

  test('Verlauf je Beitrag: Aufklappen lädt ihn einmal und zeigt die Einträge samt Grund', async () => {
    promotions.mockResolvedValue([row()])
    promotionVerlauf.mockResolvedValue([
      { id: 1, aktion: 'eingereicht', grund: null, createdAt: '2026-09-28 10:00:00' },
      { id: 2, aktion: 'abgelehnt', grund: 'Kennzeichnung unklar', createdAt: '2026-09-29 10:00:00' },
      { id: 3, aktion: 'eingereicht', grund: null, createdAt: '2026-09-30 10:00:00' }
    ])
    await render(<AdminPostApproval />)

    const toggle = button('Verlauf')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    await click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(promotionVerlauf).toHaveBeenCalledWith(11)
    const panel = container.querySelector(`#${toggle.getAttribute('aria-controls')}`)
    const items = [...panel.querySelectorAll('.freigabe-verlauf-item')]
    expect(items.map((item) => item.querySelector('.freigabe-verlauf-label').textContent)).toEqual(['Eingereicht', 'Abgelehnt', 'Erneut eingereicht'])
    expect(items[1].querySelector('.freigabe-verlauf-grund').textContent).toBe('Kennzeichnung unklar')
    expect(items[0].querySelector('time').getAttribute('datetime')).toBe('2026-09-28T10:00:00Z')

    await click(toggle)
    expect(container.querySelector('.freigabe-verlauf')).toBeNull()
    await click(toggle)
    expect(promotionVerlauf).toHaveBeenCalledTimes(1)
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
