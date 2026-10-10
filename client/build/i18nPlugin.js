import path from 'node:path'
import { buildI18n } from '../scripts/build-i18n.mjs'

// Nach dem Bauen die Wörterbücher für /api/i18n schreiben (dist/i18n/*.json) - siehe scripts/build-i18n.mjs.
export default function i18nPlugin() {
  let outDir = ''
  return {
    name: 'pfoten-i18n',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir)
    },
    async closeBundle() {
      await buildI18n(outDir)
    }
  }
}
