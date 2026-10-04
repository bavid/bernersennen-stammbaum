import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Schriften (src/styles/fonts.css): nur die Schrift des Fließtexts (Figtree, latin) wird vorgeladen - sie steht auf jeder
// Seite. Ihr Dateiname trägt nach dem Bauen einen Hash, darum sucht dieses kleine Plugin ihn im fertigen Bündel.
const PRELOAD_FONT = /figtree-latin-wght-normal-[\w-]+\.woff2$/

function preloadBodyFont() {
  return {
    name: 'preload-body-font',
    apply: 'build',
    transformIndexHtml(html, ctx) {
      const file = Object.keys(ctx.bundle || {}).find((name) => PRELOAD_FONT.test(name))
      if (!file) return html
      return [{ tag: 'link', attrs: { rel: 'preload', href: `/${file}`, as: 'font', type: 'font/woff2', crossorigin: '' }, injectTo: 'head' }]
    }
  }
}

export default defineConfig({
  plugins: [react(), preloadBodyFont()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
      '/uploads': 'http://localhost:4000',
      '/partner-media': 'http://localhost:4000',
      '/public-media': 'http://localhost:4000',
      // Digitaler Bilderrahmen: signierte Fotos für ein Rahmen-Gerät (server/routes/rahmen.js)
      '/rahmen-foto': 'http://localhost:4000',
      // nur die Klick-Weiterleitung /r/<typ>/<id> – ein nacktes '/r' träfe jede Client-Route, die mit /r beginnt
      '^/r/': 'http://localhost:4000'
    }
  },
  test: {
    include: ['src/**/*.test.{js,jsx}'],
    setupFiles: ['src/test/setup.js']
  }
})
