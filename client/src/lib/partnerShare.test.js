import { describe, expect, test } from 'vitest'
import { SNIPPET_LABEL, escapeHtml, portalUrl, qrFileName, qrSvgMarkup, shareSnippet, snippetStyle, socialText } from './partnerShare.js'

describe('portalUrl', () => {
  test('nimmt PUBLIC_URL, ohne Schrägstrich am Ende, und hängt /p/<slug> an', () => {
    expect(portalUrl({ publicUrl: 'https://chronik.example.org/', origin: 'http://localhost:5173', slug: 'hundeschule-kiesel' })).toBe(
      'https://chronik.example.org/p/hundeschule-kiesel'
    )
  })

  test('ohne PUBLIC_URL gilt der Ursprung der Seite', () => {
    expect(portalUrl({ publicUrl: null, origin: 'https://vorschau.example.org', slug: 'salon-fell' })).toBe('https://vorschau.example.org/p/salon-fell')
  })

  test('in der Demo mit ?demo=1 - sonst ließe sich ein Demo-Portal nicht öffnen', () => {
    expect(portalUrl({ publicUrl: null, origin: 'https://vorschau.example.org', slug: 'salon-fell', demo: true })).toBe(
      'https://vorschau.example.org/p/salon-fell?demo=1'
    )
  })

  test('der Slug wird kodiert', () => {
    expect(portalUrl({ publicUrl: 'https://a.example', origin: '', slug: 'a b' })).toBe('https://a.example/p/a%20b')
  })
})

describe('shareSnippet', () => {
  const url = 'https://chronik.example.org/p/hundeschule-kiesel'

  test('ein einzelner Link auf das Portal mit Inline-Style, ohne Skript', () => {
    const html = shareSnippet(url)
    expect(html.startsWith(`<a href="${url}"`)).toBe(true)
    expect(html).toContain(`>${SNIPPET_LABEL}</a>`)
    expect(html).toContain('style="')
    expect(html).toContain('rel="noopener"')
    expect(html).not.toMatch(/<script|on\w+=/i)
  })

  test('nutzt die Partnerfarbe, sonst den Rost-Ton', () => {
    expect(shareSnippet(url, { farbe: '#1f5f8b' })).toContain('background:#1f5f8b')
    expect(shareSnippet(url)).toContain('background:#a4431d')
  })

  test('eine ungültige Farbe landet nie im Schnipsel', () => {
    const html = shareSnippet(url, { farbe: 'red;"><script>alert(1)</script>' })
    expect(html).not.toContain('<script')
    expect(html).toContain('background:#a4431d')
  })

  test('Sonderzeichen in der Adresse werden maskiert', () => {
    expect(shareSnippet('https://a.example/p/x?demo=1&y="z"')).toContain('href="https://a.example/p/x?demo=1&amp;y=&quot;z&quot;"')
  })
})

describe('escapeHtml', () => {
  test('maskiert alle HTML-Sonderzeichen', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;')
  })
})

describe('snippetStyle', () => {
  test('liefert React-Stile mit heller Schrift', () => {
    expect(snippetStyle(null)).toMatchObject({ background: '#a4431d', color: '#fffaf2', borderRadius: '999px' })
  })
})

describe('socialText', () => {
  const url = 'https://chronik.example.org/p/x'

  test('Tierheime nennen ihre Tiere, samt Link', () => {
    const text = socialText({ typ: 'tierheim', url })
    expect(text).toContain('Tiere, die ein Zuhause suchen')
    expect(text.endsWith(url)).toBe(true)
  })

  test('alle anderen nennen ihre Angebote', () => {
    const text = socialText({ typ: 'hundesalon', url })
    expect(text).toContain('unsere Angebote')
    expect(text).toContain('Familie auf Pfoten')
    expect(text.endsWith(url)).toBe(true)
  })
})

describe('qrSvgMarkup', () => {
  test('eine vollständige SVG-Datei mit weißem Grund und schwarzen Modulen', () => {
    const markup = qrSvgMarkup('https://chronik.example.org/p/x')
    expect(markup.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
    expect(markup).toContain('<rect')
    expect(markup).toMatch(/<path transform="translate\(4 4\)" d="M[^"]+" fill="#000"\/>/)
    expect(markup.endsWith('</svg>')).toBe(true)
  })
})

describe('qrFileName', () => {
  test('qr-<slug>.<endung>, nur sichere Zeichen', () => {
    expect(qrFileName('hundeschule-kiesel', 'svg')).toBe('qr-hundeschule-kiesel.svg')
    expect(qrFileName('../x', 'png')).toBe('qr-x.png')
    expect(qrFileName('', 'png')).toBe('qr-portal.png')
  })
})
