import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildI18n, versionOf } from '../../../scripts/build-i18n.mjs'
import en from './en.js'

describe('scripts/build-i18n.mjs', () => {
  let dir
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('schreibt je Sprache außer Deutsch ein JSON und das Manifest mit Versionen', async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'fap-i18n-'))
    const manifest = await buildI18n(dir)
    const content = readFileSync(path.join(dir, 'i18n', 'en.json'), 'utf8')
    expect(JSON.parse(content)).toEqual(en)
    expect(manifest).toEqual({ languages: ['de', 'en'], versions: { en: versionOf(content) } })
    expect(manifest.versions.en).toMatch(/^[0-9a-f]{12}$/)
    expect(JSON.parse(readFileSync(path.join(dir, 'i18n', 'manifest.json'), 'utf8'))).toEqual(manifest)
  })
})
