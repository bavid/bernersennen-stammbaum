// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Das Modul liest die gespeicherte Sprache beim Laden - darum je Test frisch importieren.
async function load() {
  vi.resetModules()
  return import('./index.js')
}

describe('i18n', () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.lang = ''
  })
  afterEach(() => vi.restoreAllMocks())

  it('startet auf Deutsch, auch wenn der Browser Englisch meldet', async () => {
    vi.spyOn(window.navigator, 'language', 'get').mockReturnValue('en-US')
    const { getLang, t } = await load()
    expect(getLang()).toBe('de')
    expect(t('login.signIn')).toBe('Anmelden')
  })

  it('übersetzt nach setLang und merkt sich die Wahl auf dem Gerät', async () => {
    const { setLang, t, LANG_KEY } = await load()
    setLang('en')
    expect(t('login.signIn')).toBe('Sign in')
    expect(window.localStorage.getItem(LANG_KEY)).toBe('en')
    expect(document.documentElement.lang).toBe('en')
  })

  it('liest eine gespeicherte Sprache beim Start und setzt html lang', async () => {
    window.localStorage.setItem('fap-lang', 'en')
    const { getLang } = await load()
    expect(getLang()).toBe('en')
    expect(document.documentElement.lang).toBe('en')
  })

  it('ignoriert einen unbekannten gespeicherten Wert', async () => {
    window.localStorage.setItem('fap-lang', 'fr')
    const { getLang } = await load()
    expect(getLang()).toBe('de')
  })

  it('bleibt bei defektem Speicher auf Deutsch und wirft beim Wählen nicht', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('gesperrt')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('gesperrt')
    })
    const { getLang, setLang, t } = await load()
    expect(getLang()).toBe('de')
    expect(() => setLang('en')).not.toThrow()
    expect(t('login.signIn')).toBe('Sign in')
  })

  it('fällt auf Deutsch und dann auf den Schlüssel zurück', async () => {
    const { translate, translateOr } = await load()
    expect(translate('en', 'unbekannt.schluessel')).toBe('unbekannt.schluessel')
    expect(translateOr('en', 'unbekannt.schluessel', 'Rückfall')).toBe('Rückfall')
    expect(translate('en', 'demo.hint')).toBe('Not possible in the demo.')
    // nur in en vorhandene Schlüssel: Deutsch nutzt den Rückfall der Aufrufstelle
    expect(translateOr('de', 'design.palette.wald', 'Waldspaziergang')).toBe('Waldspaziergang')
    expect(translateOr('en', 'design.palette.wald', 'Waldspaziergang')).toBe('Forest walk')
  })

  it('ersetzt {Variablen} und lässt unbekannte stehen', async () => {
    const { translate } = await load()
    expect(translate('de', 'settings.home.renamed', { name: 'Deich' })).toBe('Euer Zuhause heißt jetzt „Deich“')
    expect(translate('en', 'settings.home.renamed', { name: 'Dyke' })).toBe('Your home is now called “Dyke”')
    expect(translate('de', 'settings.home.renamed')).toBe('Euer Zuhause heißt jetzt „{name}“')
  })

  it('benachrichtigt Abonnenten beim Wechsel und hört nach dem Abmelden auf', async () => {
    const { setLang, subscribe } = await load()
    const listener = vi.fn()
    const unsubscribe = subscribe(listener)
    setLang('en')
    expect(listener).toHaveBeenCalledTimes(1)
    setLang('en')
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
    setLang('de')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('hat in beiden Sprachen dieselben Schlüssel (außer den Etiketten nur für en)', async () => {
    const de = (await import('./de.js')).default
    const en = (await import('./en.js')).default
    const onlyDe = Object.keys(de).filter((key) => !(key in en))
    expect(onlyDe).toEqual([])
  })
})
