// Erzeugt den Wert für ADMIN_PASSWORD_HASH in der .env.
//   npm run admin:hash -- "mein-admin-passwort"
const { hashPassword } = require('../lib/adminAuth')

const password = process.argv[2]
if (!password || password.length < 10) {
  console.error('Bitte ein Passwort mit mindestens 10 Zeichen angeben: npm run admin:hash -- "passwort"')
  process.exit(1)
}
hashPassword(password).then((hash) => console.log(hash))
