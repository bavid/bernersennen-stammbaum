import { describe, expect, test } from 'vitest'
import {
  ADMIN_SECTIONS,
  LEGACY_TABS,
  adminSubCounts,
  adminTabCounts,
  adminTarget,
  resolveAdminTab,
  writeAdminParams
} from './adminTabs.js'
import { t } from './i18n/index.js'
import en from './i18n/en/index.js'

describe('Admin: 5 Hauptreiter mit Unterreitern', () => {
  test('fünf Hauptreiter, jeder Unterreiter-Schlüssel nur einmal', () => {
    expect(ADMIN_SECTIONS.map((section) => section.key)).toEqual(['uebersicht', 'familien-partner', 'inhalte', 'werbung', 'system'])
    const subs = ADMIN_SECTIONS.flatMap((section) => section.subs.map((item) => item.key))
    expect(new Set(subs).size).toBe(subs.length)
  })

  test('alle 13 alten Reiter zeigen auf ein gültiges Paar', () => {
    expect(Object.keys(LEGACY_TABS)).toHaveLength(13)
    for (const [old, [tab, bereich]] of Object.entries(LEGACY_TABS)) {
      const section = ADMIN_SECTIONS.find((item) => item.key === tab)
      expect(section, old).toBeDefined()
      expect(section.subs.map((item) => item.key), old).toContain(bereich)
    }
  })

  test.each([
    ['anfragen', 'familien-partner', 'anfragen'],
    ['freigaben', 'inhalte', 'freigaben'],
    ['gutscheine', 'familien-partner', 'gutscheine'],
    ['partner', 'familien-partner', 'partner'],
    ['empfehlungen', 'werbung', 'empfehlungen'],
    ['familien', 'familien-partner', 'familien'],
    ['nachrichten', 'inhalte', 'nachrichten'],
    ['hinweise', 'inhalte', 'hinweise'],
    ['finanzierung', 'werbung', 'finanzierung'],
    ['einstellungen', 'system', 'benachrichtigungen'],
    ['server', 'system', 'server'],
    ['protokoll', 'system', 'protokoll'],
    ['uebersicht', 'uebersicht', 'ueberblick']
  ])('alter Link ?tab=%s → %s / %s (ein mitgegebener bereich ändert nichts)', (old, tab, bereich) => {
    expect(resolveAdminTab(old, null)).toEqual({ tab, bereich })
    if (old !== 'uebersicht') expect(resolveAdminTab(old, 'band')).toEqual({ tab, bereich })
  })

  test('neue Paare aus der Adresse; fremder Bereich → erster Unterreiter; Unbekanntes → Übersicht', () => {
    expect(resolveAdminTab('werbung', 'band')).toEqual({ tab: 'werbung', bereich: 'band' })
    expect(resolveAdminTab('werbung', 'server')).toEqual({ tab: 'werbung', bereich: 'empfehlungen' })
    expect(resolveAdminTab('system', null)).toEqual({ tab: 'system', bereich: 'server' })
    expect(resolveAdminTab(null, null)).toEqual({ tab: 'uebersicht', bereich: 'ueberblick' })
    expect(resolveAdminTab('__proto__', null)).toEqual({ tab: 'uebersicht', bereich: 'ueberblick' })
    expect(resolveAdminTab('gibtesnicht', 'erfolg')).toEqual({ tab: 'uebersicht', bereich: 'erfolg' })
  })

  test('adminTarget: Hauptreiter, Unterreiter-Schlüssel und alter Reiter', () => {
    expect(adminTarget('system')).toEqual({ tab: 'system', bereich: 'server' })
    expect(adminTarget('system', 'protokoll')).toEqual({ tab: 'system', bereich: 'protokoll' })
    expect(adminTarget('band')).toEqual({ tab: 'werbung', bereich: 'band' })
    expect(adminTarget('einstellungen')).toEqual({ tab: 'system', bereich: 'benachrichtigungen' })
  })

  test('Adresse: Übersicht › Auf einen Blick ohne Parameter, sonst tab und bereich; andere Parameter bleiben', () => {
    const base = new URLSearchParams('tab=system&bereich=server&x=1')
    expect(writeAdminParams(base, { tab: 'uebersicht', bereich: 'ueberblick' }).toString()).toBe('x=1')
    expect(writeAdminParams(base, { tab: 'uebersicht', bereich: 'erfolg' }).toString()).toBe('tab=uebersicht&bereich=erfolg&x=1')
    expect(writeAdminParams(new URLSearchParams(), { tab: 'werbung', bereich: 'band' }).toString()).toBe('tab=werbung&bereich=band')
    expect(base.toString()).toBe('tab=system&bereich=server&x=1')
  })

  test('Zähler: Unterreiter einzeln, Hauptreiter als Summe, 0 ohne Zahl', () => {
    const todo = { openRequests: 2, pendingPosts: 1, openMessages: 3 }
    expect(adminSubCounts(todo)).toEqual({ anfragen: 2, freigaben: 1, nachrichten: 3 })
    expect(adminTabCounts(todo)).toEqual({ 'familien-partner': 2, inhalte: 4 })
    expect(adminTabCounts({ openRequests: 0, pendingPosts: null, openMessages: 0 })).toEqual({})
  })

  test('jede Reiter-Beschriftung hat eine englische Fassung', () => {
    const labels = ADMIN_SECTIONS.flatMap((section) => [section.label, ...section.subs.map((item) => item.label)])
    for (const label of labels) expect(en[label], label).toBeTruthy()
    expect(t('Werbung & Messen')).toBe('Werbung & Messen')
  })
})
