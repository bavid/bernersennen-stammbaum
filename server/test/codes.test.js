const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const crypto = require('node:crypto')
const { execFileSync } = require('node:child_process')
const {
  ALPHABET,
  CODE_LENGTH,
  generateCode,
  formatCode,
  normalizeCode,
  hashCode,
  encryptCode,
  decryptCode
} = require('../lib/codes')

const serverDir = path.join(__dirname, '..')

function runChild(script, env) {
  return execFileSync(process.execPath, ['-e', script], { cwd: serverDir, env, stdio: 'pipe' })
}

function expectChildThrow(script, env, pattern) {
  try {
    runChild(script, env)
    assert.fail('sollte werfen')
  } catch (err) {
    assert.match(String(err.stderr), pattern)
  }
}

test('generateCode erzeugt 12 Zeichen aus dem Crockford-Alphabet', () => {
  const code = generateCode()
  assert.equal(code.length, CODE_LENGTH)
  for (const ch of code) assert.ok(ALPHABET.includes(ch), `unerwartetes Zeichen: ${ch}`)
  // keine Verwechsler drin
  for (const forbidden of ['I', 'L', 'O', 'U']) assert.ok(!ALPHABET.includes(forbidden))
})

test('formatCode setzt Bindestriche in 4er-Gruppen', () => {
  assert.equal(formatCode('ABCDEFGH1234'), 'ABCD-EFGH-1234')
})

test('normalizeCode ist nachsichtig beim Eintippen', () => {
  assert.equal(normalizeCode('abcd-efgh-1234'), 'ABCDEFGH1234')
  assert.equal(normalizeCode('  ABCD EFGH 1234 '), 'ABCDEFGH1234')
  assert.equal(normalizeCode('ABCDEFGHO234'), 'ABCDEFGH0234') // O -> 0
  assert.equal(normalizeCode('ABCDEFGHI2L4'), 'ABCDEFGH1214') // I/L -> 1
})

test('normalizeCode lehnt ungültige Eingaben ab', () => {
  assert.equal(normalizeCode('ABCD-EFGH-123'), null) // zu kurz
  assert.equal(normalizeCode('ABCDEFGHU234'), null) // U ist nicht im Alphabet
  assert.equal(normalizeCode(''), null)
  assert.equal(normalizeCode(null), null)
  assert.equal(normalizeCode(undefined), null)
  assert.equal(normalizeCode(123456789012), null)
})

test('hashCode ist deterministisch und hängt vom CODE_PEPPER ab', () => {
  const code = 'ABCDEFGH1234'
  const pepperA = 'a'.repeat(32)
  const pepperB = 'b'.repeat(32)
  const envFor = (pepper) => ({ ...process.env, JWT_SECRET: 'test-secret', CODE_PEPPER: pepper })
  const script = `process.stdout.write(require('./lib/codes').hashCode(${JSON.stringify(code)}))`

  const hashA1 = runChild(script, envFor(pepperA)).toString()
  const hashA2 = runChild(script, envFor(pepperA)).toString()
  const hashB = runChild(script, envFor(pepperB)).toString()

  assert.equal(hashA1, hashA2) // deterministisch
  assert.notEqual(hashA1, hashB) // hängt vom Pepper ab
  assert.equal(hashA1, crypto.createHmac('sha256', pepperA).update(code).digest('hex'))
})

test('encryptCode/decryptCode gehen hin und zurück, manipulierter Text wirft', () => {
  const code = 'ABCDEFGH1234'
  const cipher = encryptCode(code)
  assert.equal(decryptCode(cipher), code)

  const [iv, tag, data] = cipher.split('.')
  const tamperedData = Buffer.from(data, 'base64')
  tamperedData[0] ^= 0xff
  const tampered = [iv, tag, tamperedData.toString('base64')].join('.')
  assert.throws(() => decryptCode(tampered))
})

test('Produktion ohne CODE_PEPPER wirft beim Start', () => {
  const env = { ...process.env, NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(40) }
  delete env.CODE_PEPPER
  expectChildThrow("require('./config')", env, /CODE_PEPPER/)
})

test('Produktion mit zu kurzem CODE_PEPPER wirft beim Start', () => {
  const env = { ...process.env, NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(40), CODE_PEPPER: 'zu-kurz' }
  expectChildThrow("require('./config')", env, /CODE_PEPPER/)
})

test('decryptCode lehnt Geheimtext ab, der nicht aus genau drei Base64-Teilen besteht', () => {
  assert.throws(() => decryptCode('nur-ein-teil'))
  assert.throws(() => decryptCode('a.b'))
  assert.throws(() => decryptCode('a.b.c.d'))
  assert.throws(() => decryptCode(''))
  assert.throws(() => decryptCode(null))
})

test('decryptCode lehnt falsche IV- oder Tag-Längen ab', () => {
  const cipher = encryptCode('ABCDEFGH1234')
  const [iv, tag, data] = cipher.split('.')

  const shortIv = Buffer.from(iv, 'base64').subarray(0, 8).toString('base64')
  assert.throws(() => decryptCode([shortIv, tag, data].join('.')))

  const shortTag = Buffer.from(tag, 'base64').subarray(0, 8).toString('base64')
  assert.throws(() => decryptCode([iv, shortTag, data].join('.')))
})

test('Produktion mit gültigem CODE_PEPPER startet ohne zu werfen', () => {
  const env = { ...process.env, NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(40), CODE_PEPPER: 'y'.repeat(32) }
  assert.doesNotThrow(() => runChild("require('./config')", env))
})
