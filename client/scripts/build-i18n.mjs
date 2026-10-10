import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { LANGUAGES, LOADERS } from '../src/lib/i18n/languages.js'

// Wörterbücher für die API (server/routes/i18n.js): je Sprache außer Deutsch dist/i18n/<sprache>.json und dazu
// dist/i18n/manifest.json = { languages, versions: { <sprache>: <sha256, 12 Zeichen> } }. Läuft beim Bauen (vite.config.js,
// build/i18nPlugin.js) oder von Hand: node scripts/build-i18n.mjs [Ausgabeordner].
export function versionOf(content) {
  return createHash('sha256').update(content).digest('hex').slice(0, 12)
}

export async function buildI18n(outDir) {
  const dir = path.join(outDir, 'i18n')
  mkdirSync(dir, { recursive: true })
  const versions = {}
  for (const [lang, load] of Object.entries(LOADERS)) {
    const content = JSON.stringify((await load()).default)
    writeFileSync(path.join(dir, `${lang}.json`), content)
    versions[lang] = versionOf(content)
  }
  const manifest = { languages: LANGUAGES.map((language) => language.code), versions }
  writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest))
  return manifest
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const outDir = path.resolve(process.argv[2] || 'dist')
  const manifest = await buildI18n(outDir)
  console.log(`i18n: ${JSON.stringify(manifest.versions)} -> ${path.join(outDir, 'i18n')}`)
}
