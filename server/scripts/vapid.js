#!/usr/bin/env node
'use strict'

// VAPID-Schlüsselpaar für Benachrichtigungen aufs Handy (Web Push, lib/push.js) erzeugen:
//   node scripts/vapid.js
// Die beiden Zeilen in die .env des Servers eintragen (siehe .env.example). Der private Schlüssel bleibt auf dem
// Server - nie ins Git, nie an einen Client. Einmal erzeugt NICHT mehr ändern: alle bestehenden Abos der Geräte
// gehören zum alten Schlüssel und würden mit dem neuen nicht mehr zugestellt.
const { generateVAPIDKeys } = require('web-push')

const keys = generateVAPIDKeys()
process.stdout.write(`VAPID_PUBLIC_KEY=${keys.publicKey}\nVAPID_PRIVATE_KEY=${keys.privateKey}\n`)
