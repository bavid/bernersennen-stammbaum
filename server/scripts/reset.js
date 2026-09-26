// Löscht Datenbank und alle hochgeladenen Fotos. Server vorher stoppen!
//   npm run db:reset -- --yes
const fs = require('node:fs')
const path = require('node:path')
const { dbPath, uploadDir } = require('../config')

if (!process.argv.includes('--yes')) {
  console.error('Löscht ALLE Rudel, Hunde, Einträge und Fotos. Bestätigen mit: npm run db:reset -- --yes')
  process.exit(1)
}

for (const suffix of ['', '-wal', '-shm']) {
  fs.rmSync(dbPath + suffix, { force: true })
}

let removedPhotos = 0
if (fs.existsSync(uploadDir)) {
  for (const file of fs.readdirSync(uploadDir)) {
    if (file === '.gitkeep') continue
    fs.rmSync(path.join(uploadDir, file), { force: true })
    removedPhotos += 1
  }
}

console.log(`Datenbank gelöscht (${dbPath}), ${removedPhotos} Fotos entfernt.`)
