#!/usr/bin/env node
'use strict'

// Umzug des Bestandsrudels auf das neue System - im Container der Instanz ausführen (dieselbe DB_PATH/DATA_DIR wie die App):
//   node scripts/migriere-rudel-instanz.js --familie <id> [--hinweis-url https://…] [--dry-run]
// Erst eine Sicherung nach DATA_DIR/backups/pre-migration-<Zeit>.db (außer --dry-run), dann Stammbaum als Start für
// das Rudel und optional EIN Hinweis mit Link. Idempotent. Ausgabe nur Zahlen, nie Namen. Logik: lib/rudelMigration.js.

function parseArgs(argv) {
  const args = { dryRun: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--dry-run') args.dryRun = true
    else if (arg === '--familie') args.familieId = Number(argv[(i += 1)])
    else if (arg === '--hinweis-url') args.hinweisUrl = argv[(i += 1)] ?? ''
    else throw new Error(`Unbekanntes Argument: ${String(arg).slice(0, 40)}`)
  }
  if (args.familieId === undefined) throw new Error('--familie <id> fehlt')
  return args
}

function printCounts(label, counts) {
  console.log(`${label}: ${Object.entries(counts).map(([key, n]) => `${key}=${n}`).join(' ')}`)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const config = require('../config')
  const { migriereRudelInstanz } = require('../lib/rudelMigration')
  const result = await migriereRudelInstanz({ ...args, backupDir: config.backupDir })
  if (result.dryRun) console.log('Probelauf (--dry-run): nichts geschrieben, keine Sicherung.')
  else console.log(`Sicherung: ${result.backupPfad}`)
  printCounts('Vorher ', result.vorher)
  printCounts('Nachher', result.nachher)
  console.log(`Stammbaum als Start: ${result.stammbaumNeu ? 'eingeschaltet' : 'war schon an'}`)
  console.log(`Hinweis: ${result.hinweis ? `${result.hinweis.aktion}${result.hinweis.id ? ` (id ${result.hinweis.id})` : ''}` : 'keiner (ohne --hinweis-url)'}`)
}

main()
  .then(() => require('../db').close())
  .catch((err) => {
    console.error(`Abgebrochen: ${err.message}`)
    process.exitCode = 1
  })
