const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir } = require('./helpers')

useTempDataDir('config', { TRUST_PROXY: '1', COOKIE_SECURE: 'true' })

test('TRUST_PROXY from .env becomes a hop count Express understands', () => {
  const config = require('../config')
  assert.equal(config.trustProxy, 1)
  assert.equal(config.cookieSecure, true)

  const express = require('express')
  const app = express()
  assert.doesNotThrow(() => app.set('trust proxy', config.trustProxy))
  assert.equal(app.get('trust proxy fn')('10.0.0.1', 0), true)
  assert.equal(app.get('trust proxy fn')('10.0.0.1', 1), false)
})
