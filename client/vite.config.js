import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
      '/uploads': 'http://localhost:4000',
      '/partner-media': 'http://localhost:4000',
      '/public-media': 'http://localhost:4000',
      // nur die Klick-Weiterleitung /r/<typ>/<id> – ein nacktes '/r' träfe jede Client-Route, die mit /r beginnt
      '^/r/': 'http://localhost:4000'
    }
  },
  test: {
    include: ['src/**/*.test.{js,jsx}'],
    setupFiles: ['src/test/setup.js']
  }
})
