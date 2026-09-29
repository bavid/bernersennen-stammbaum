'use strict'

const express = require('express')
const config = require('../config')
const { robotsTxt, sitemapXml } = require('../lib/sitemap')

// Phase G Task 2: /robots.txt und /sitemap.xml - in app.js VOR serveClient() eingehängt, sonst würde der
// SPA-Fallback beide mit der index.html beantworten. Öffentlich und ohne Rate-Limit wie die Client-Dateien:
// robots.txt ist konstant, die Sitemap kommt höchstens alle zehn Minuten aus der Datenbank (lib/sitemap.js).
const router = express.Router()

const SEO_CACHE = 'public, max-age=600'

router.get('/robots.txt', (req, res) => {
  res.setHeader('Cache-Control', SEO_CACHE)
  res.type('text/plain').send(robotsTxt())
})

router.get('/sitemap.xml', (req, res) => {
  // Eine Sitemap braucht absolute Adressen - ohne PUBLIC_URL gibt es sie nicht (robots.txt nennt sie dann auch nicht)
  if (!config.publicUrl) return res.status(404).json({ error: 'Ohne PUBLIC_URL gibt es keine Sitemap' })
  res.setHeader('Cache-Control', SEO_CACHE)
  res.type('application/xml').send(sitemapXml())
})

module.exports = router
