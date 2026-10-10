import { describe, expect, test, vi } from 'vitest'
import { drawPoster } from './vermisstCanvas.js'

function fakeCtx() {
  const texts = []
  return {
    texts,
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    measureText: (value) => ({ width: value.length * 10 }),
    fillText: (value) => texts.push(value)
  }
}

const poster = { name: 'Pepper', photo: null, facts: [['Tierart', 'Hund']], seenDate: '9. Oktober', seenPlace: 'Stadtpark', contact: '0170 1', chip: '' }

describe('vermisstCanvas', () => {
  test('zeichnet Überschrift, Name, Kontakt und die beiden Register', () => {
    const ctx = fakeCtx()
    drawPoster(ctx, poster, null)
    const all = ctx.texts.join('\n')
    expect(all).toContain('VERMISST')
    expect(all).toContain('Pepper')
    expect(all).toContain('9. Oktober · Stadtpark')
    expect(all).toContain('0170 1')
    expect(all).toContain('TASSO: tasso.net')
    expect(all).toContain('FINDEFIX: findefix.com')
    expect(ctx.drawImage).not.toHaveBeenCalled()
  })

  test('mit Foto wird es wie object-fit: cover gezeichnet', () => {
    const ctx = fakeCtx()
    drawPoster(ctx, poster, { width: 800, height: 600 })
    expect(ctx.drawImage).toHaveBeenCalledTimes(1)
  })
})
