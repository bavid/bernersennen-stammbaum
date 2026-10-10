const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { stripWebpMetadata } = require('../lib/stripWebpMetadata')
const { useTempDataDir, startApp, cleanup, createFamily } = require('./helpers')

const dataDir = useTempDataDir('strip-webp')

// security-review Phase T Finding 12 für WebP: synthetische RIFF-Dateien (kein echtes Foto nötig) - ein
// einfaches verlustfreies VP8L 1x1 und eine VP8X-Variante mit EXIF-, XMP- und ICCP-Chunk.

function chunk(type, payload) {
  const size = Buffer.alloc(4)
  size.writeUInt32LE(payload.length, 0)
  const pad = payload.length % 2 ? Buffer.from([0]) : Buffer.alloc(0)
  return Buffer.concat([Buffer.from(type, 'ascii'), size, payload, pad])
}

function riff(...chunks) {
  const body = Buffer.concat(chunks)
  const size = Buffer.alloc(4)
  size.writeUInt32LE(4 + body.length, 0)
  return Buffer.concat([Buffer.from('RIFF', 'ascii'), size, Buffer.from('WEBP', 'ascii'), body])
}

// VP8L 1x1: Signatur 0x2f, dann 14 Bit Breite-1, 14 Bit Höhe-1, Alpha-Bit, Version - plus ein paar Bilddaten.
const VP8L = chunk('VP8L', Buffer.from([0x2f, 0x00, 0x00, 0x00, 0x00, 0x88, 0x88, 0x08]))
const ICCP = chunk('ICCP', Buffer.from('fake-icc-profile', 'latin1'))
const EXIF = chunk('EXIF', Buffer.from('MM\0*\0\0\0\x08GPS-geheim', 'latin1')) // ungerade Länge -> Padding
const XMP = chunk('XMP ', Buffer.from('<x:xmpmeta>Aufnahmeort</x:xmpmeta>', 'latin1'))

const ICC_FLAG = 0x20
const ALPHA_FLAG = 0x10
const EXIF_FLAG = 0x08
const XMP_FLAG = 0x04

function vp8x(flags) {
  const payload = Buffer.alloc(10)
  payload[0] = flags // Breite-1/Höhe-1 (je 24 Bit) bleiben 0 -> 1x1
  return chunk('VP8X', payload)
}

const SIMPLE = riff(VP8L)
const EXTENDED = riff(vp8x(ICC_FLAG | ALPHA_FLAG | EXIF_FLAG | XMP_FLAG), ICCP, VP8L, EXIF, XMP)

test('stripWebpMetadata: einfaches VP8L ohne Metadaten bleibt byteidentisch', () => {
  assert.deepEqual(stripWebpMetadata(SIMPLE), SIMPLE)
})

test('stripWebpMetadata: VP8X - EXIF/XMP raus, Flags gelöscht, RIFF-Größe stimmt, Bild und ICC unverändert', () => {
  const stripped = stripWebpMetadata(EXTENDED)

  assert.equal(stripped.includes('GPS-geheim'), false)
  assert.equal(stripped.includes('Aufnahmeort'), false)
  assert.equal(stripped.includes('EXIF'), false)
  assert.equal(stripped.includes('XMP '), false)
  assert.deepEqual(stripped, riff(vp8x(ICC_FLAG | ALPHA_FLAG), ICCP, VP8L))
  assert.equal(stripped.readUInt32LE(4), stripped.length - 8)
  assert.equal(stripped[20], ICC_FLAG | ALPHA_FLAG, 'nur EXIF-/XMP-Flag gelöscht')
  assert.ok(stripped.includes(VP8L), 'Bild-Chunk byteidentisch')
  // Original bleibt unangetastet (keine Mutation des Eingabe-Buffers)
  assert.equal(EXTENDED[20], ICC_FLAG | ALPHA_FLAG | EXIF_FLAG | XMP_FLAG)
})

test('stripWebpMetadata: ANIM/ANMF/ALPH bleiben erhalten', () => {
  const ANIM = chunk('ANIM', Buffer.alloc(6, 1))
  const ANMF = chunk('ANMF', Buffer.concat([Buffer.alloc(16, 2), VP8L]))
  const ALPH = chunk('ALPH', Buffer.from([0, 9, 9]))
  const stripped = stripWebpMetadata(riff(vp8x(0x02 | EXIF_FLAG), ANIM, ANMF, ALPH, EXIF))
  assert.deepEqual(stripped, riff(vp8x(0x02), ANIM, ANMF, ALPH))
})

test('stripWebpMetadata: kaputte oder fremde Eingaben kommen unverändert zurück', () => {
  const cases = {
    keinBuffer: 'RIFF',
    zuKurz: Buffer.from('RIFF\0\0', 'latin1'),
    keinWebp: Buffer.from('RIFF\x04\0\0\0WAVE', 'latin1'),
    riffGroesseZuGross: (() => {
      const b = Buffer.from(EXTENDED)
      b.writeUInt32LE(EXTENDED.length, 4)
      return b
    })(),
    chunkUeberEnde: riff(Buffer.concat([chunk('EXIF', Buffer.alloc(4)).subarray(0, 4), Buffer.from([0xff, 0, 0, 0])])),
    vp8xZuKurz: riff(chunk('VP8X', Buffer.alloc(4)), EXIF),
    halberChunkKopf: riff(VP8L, Buffer.from('EXI', 'ascii'))
  }
  for (const [name, input] of Object.entries(cases)) {
    assert.equal(stripWebpMetadata(input), input, name)
  }
})

test('POST /api/uploads speichert ein WebP ohne EXIF', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const config = require('../config')
  const family = await createFamily(base, 'Rudel WebP', 'passwort-webp1')

  const form = new FormData()
  form.append('file', new Blob([EXTENDED], { type: 'image/webp' }), 'photo.webp')
  const res = await fetch(`${base}/api/uploads`, { method: 'POST', headers: { Cookie: family.cookie }, body: form })
  assert.equal(res.status, 201)
  const { url } = await res.json()
  assert.match(url, /\.webp$/)

  const stored = fs.readFileSync(path.join(config.uploadDir, url.split('/').pop()))
  assert.equal(stored.includes('GPS-geheim'), false)
  assert.deepEqual(stored, riff(vp8x(ICC_FLAG | ALPHA_FLAG), ICCP, VP8L))
})
