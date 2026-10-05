import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { build as esbuild } from 'esbuild'

// Service Worker bauen (src/sw/sw.js -> dist/sw.js) und seine Dateiliste schreiben (dist/sw-assets.json): die Hülle der
// App, die er beim Installieren vorab in den Cache legt. Aus dem Bündel nur das, was jede Seite ohnehin lädt - der
// Einstiegs-Chunk samt seinen festen Importen und CSS sowie die vorgeladene Schrift des Fließtexts (vite.config.js
// preloadBodyFont); die erst bei Bedarf geladenen Seiten holt der Worker beim ersten Aufruf (cache-first). esbuild liegt
// als Abhängigkeit von Vite ohnehin bereit; die Version ist ein Hash der Dateiliste und des Quelltexts, damit ein
// unveränderter Build keinen „neuen“ Worker ergibt.
const SW_ENTRY = 'src/sw/sw.js'
const SW_ROUTES = 'src/lib/swRoutes.js'
const PRELOAD_FONT = /figtree-latin-wght-normal-[\w-]+\.woff2$/
export const SHELL_FILES = Object.freeze([
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/darstellung-init.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png'
])

// Einstiegs-Chunks, ihre festen Importe (rekursiv) und deren CSS - die Namen im Ausgabeordner.
export function entryFiles(bundle) {
  const chunks = Object.values(bundle).filter((item) => item.type === 'chunk')
  const byName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]))
  const seen = new Set()
  const queue = chunks.filter((chunk) => chunk.isEntry).map((chunk) => chunk.fileName)
  while (queue.length > 0) {
    const name = queue.shift()
    if (seen.has(name)) continue
    seen.add(name)
    for (const imported of byName.get(name)?.imports || []) queue.push(imported)
  }
  const css = [...seen].flatMap((name) => [...(byName.get(name)?.viteMetadata?.importedCss || [])])
  const fonts = Object.keys(bundle).filter((name) => PRELOAD_FONT.test(name))
  return [...seen, ...css, ...fonts].sort()
}

export function versionOf(files, source) {
  return createHash('sha256').update(JSON.stringify(files)).update(source).digest('hex').slice(0, 12)
}

export default function swPlugin() {
  let root = ''
  let outDir = ''
  let bundleFiles = []
  return {
    name: 'pfoten-service-worker',
    apply: 'build',
    configResolved(config) {
      root = config.root
      outDir = path.resolve(config.root, config.build.outDir)
    },
    generateBundle(options, bundle) {
      bundleFiles = entryFiles(bundle)
    },
    async closeBundle() {
      const files = [...SHELL_FILES, ...bundleFiles.map((name) => `/${name}`)]
      const source = readFileSync(path.join(root, SW_ENTRY), 'utf8') + readFileSync(path.join(root, SW_ROUTES), 'utf8')
      const version = versionOf(files, source)
      writeFileSync(path.join(outDir, 'sw-assets.json'), JSON.stringify({ version, files }, null, 2))
      await esbuild({
        entryPoints: [path.join(root, SW_ENTRY)],
        bundle: true,
        format: 'iife',
        target: 'es2019',
        minify: true,
        legalComments: 'none',
        outfile: path.join(outDir, 'sw.js'),
        define: { __SW_VERSION__: JSON.stringify(version) }
      })
    }
  }
}
