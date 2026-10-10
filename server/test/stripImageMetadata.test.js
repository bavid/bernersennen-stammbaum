const test = require('node:test')
const assert = require('node:assert/strict')
const { stripJpegMetadata } = require('../lib/stripJpegMetadata')
const { stripPngMetadata } = require('../lib/stripPngMetadata')

// security-review Phase T Finding 12: Unit-Tests für die JPEG-/PNG-Metadaten-Walker mit synthetischen,
// selbst gebauten Dateien (kein echtes Foto nötig) - jeweils mit einem eingebetteten EXIF-/XMP-/
// Kommentar-Segment, das entfernt werden muss, während alles andere (inkl. der "Bilddaten") unverändert
// bleibt. Siehe routes/uploads.js für die Einbindung beim Hochladen und test/uploadAccess.test.js für
// den Integrationstest über die echte POST /api/uploads-Route.

// --- JPEG-Hilfsfunktionen zum Zusammenbauen synthetischer Segmente --------------------------------
function jpegSegment(marker, payload) {
  const length = Buffer.alloc(2)
  length.writeUInt16BE(payload.length + 2, 0)
  return Buffer.concat([Buffer.from([0xff, marker]), length, payload])
}

const SOI = Buffer.from([0xff, 0xd8])
const EOI = Buffer.from([0xff, 0xd9])
const APP0_JFIF = jpegSegment(0xe0, Buffer.from('JFIF\0\x01\x01\x00\x00\x01\x00\x01\x00\x00', 'latin1'))
const APP1_EXIF = jpegSegment(0xe1, Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), Buffer.from([0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 8, 0xca, 0xfe])]))
const APP1_XMP = jpegSegment(0xe1, Buffer.concat([Buffer.from('http://ns.adobe.com/xap/1.0/\0', 'latin1'), Buffer.from('<x:xmpmeta/>', 'latin1')]))
const APP13_PHOTOSHOP = jpegSegment(0xed, Buffer.from('Photoshop 3.0\08BIM geheime Metadaten', 'latin1'))
const COM_SEGMENT = jpegSegment(0xfe, Buffer.from('ein Kommentar mit Geo-Hinweis', 'latin1'))
const SOS_AND_SCAN = Buffer.concat([jpegSegment(0xda, Buffer.from([0x00, 0x01, 0x02])), Buffer.from([0x12, 0x34, 0x56, 0xff, 0x00, 0x78])])

function buildJpeg(...middleSegments) {
  return Buffer.concat([SOI, APP0_JFIF, ...middleSegments, SOS_AND_SCAN, EOI])
}

test('stripJpegMetadata: entfernt APP1 Exif, behält alles andere byteidentisch', () => {
  const original = buildJpeg(APP1_EXIF)
  const stripped = stripJpegMetadata(original)

  assert.notDeepEqual(stripped, original)
  assert.equal(stripped.includes('Exif'), false)
  assert.deepEqual(stripped, buildJpeg())
  // SOI/EOI und die Bild-/Scan-Daten bleiben komplett erhalten
  assert.equal(stripped.subarray(0, 2).toString('hex'), 'ffd8')
  assert.equal(stripped.subarray(-2).toString('hex'), 'ffd9')
})

test('stripJpegMetadata: entfernt APP1 XMP', () => {
  const stripped = stripJpegMetadata(buildJpeg(APP1_XMP))
  assert.equal(stripped.includes('ns.adobe.com'), false)
  assert.deepEqual(stripped, buildJpeg())
})

test('stripJpegMetadata: entfernt APP13 (Photoshop/IPTC)', () => {
  const stripped = stripJpegMetadata(buildJpeg(APP13_PHOTOSHOP))
  assert.equal(stripped.includes('Photoshop'), false)
  assert.deepEqual(stripped, buildJpeg())
})

test('stripJpegMetadata: entfernt COM-Kommentarsegmente', () => {
  const stripped = stripJpegMetadata(buildJpeg(COM_SEGMENT))
  assert.equal(stripped.includes('Geo-Hinweis'), false)
  assert.deepEqual(stripped, buildJpeg())
})

test('stripJpegMetadata: entfernt mehrere Metadaten-Segmente auf einmal, behält APP0', () => {
  const original = buildJpeg(APP1_EXIF, APP1_XMP, APP13_PHOTOSHOP, COM_SEGMENT)
  const stripped = stripJpegMetadata(original)
  assert.deepEqual(stripped, buildJpeg())
  assert.ok(stripped.includes('JFIF'))
})

test('stripJpegMetadata: kein JPEG -> unveränderter Originalbuffer', () => {
  const notAJpeg = Buffer.from('das ist kein Bild')
  assert.equal(stripJpegMetadata(notAJpeg), notAJpeg)
})

test('stripJpegMetadata: kaputte Struktur -> null (fail closed), keine Ausnahme', () => {
  const cases = {
    laengeUeberEnde: Buffer.concat([SOI, Buffer.from([0xff, 0xe1, 0xff, 0xff]), EOI]),
    laengeKleinerZwei: Buffer.concat([SOI, Buffer.from([0xff, 0xe1, 0x00, 0x01]), APP1_EXIF, EOI]),
    keinMarker: Buffer.concat([SOI, Buffer.from([0x00, 0x00]), APP1_EXIF, EOI]),
    nurFuellbytes: Buffer.concat([SOI, Buffer.from([0xff, 0xff])]),
    sosKopfAbgeschnitten: Buffer.concat([SOI, Buffer.from([0xff, 0xda, 0x00, 0x20, 0x01])])
  }
  for (const [name, input] of Object.entries(cases)) assert.equal(stripJpegMetadata(input), null, name)
})

test('stripJpegMetadata: Bytes nach EOI fallen weg (Handy-Anhang mit zweitem EXIF)', () => {
  const trailer = Buffer.concat([SOI, APP1_EXIF, EOI, Buffer.from('Anhang', 'latin1')])
  const stripped = stripJpegMetadata(Buffer.concat([buildJpeg(APP1_EXIF), trailer]))
  assert.deepEqual(stripped, buildJpeg())
})

test('stripJpegMetadata: progressiv - mehrere Scans bleiben, COM zwischen den Scans fällt weg', () => {
  const DHT = jpegSegment(0xc4, Buffer.from([0x10, 0xff, 0xd9])) // 0xFF 0xD9 in Nutzdaten ist kein EOI
  const scan2 = Buffer.concat([jpegSegment(0xda, Buffer.from([0x00, 0x01, 0x02])), Buffer.from([0xab, 0xff, 0xd3, 0xcd])])
  const original = Buffer.concat([SOI, APP0_JFIF, SOS_AND_SCAN, COM_SEGMENT, DHT, scan2, EOI])
  assert.deepEqual(stripJpegMetadata(original), Buffer.concat([SOI, APP0_JFIF, SOS_AND_SCAN, DHT, scan2, EOI]))
})

test('stripJpegMetadata: abgeschnitten im Scan (ohne EOI) -> Bilddaten bleiben, EXIF ist raus', () => {
  const truncated = Buffer.concat([SOI, APP1_EXIF, APP0_JFIF, SOS_AND_SCAN])
  assert.deepEqual(stripJpegMetadata(truncated), Buffer.concat([SOI, APP0_JFIF, SOS_AND_SCAN]))
})

test('stripJpegMetadata: leerer/zu kurzer Buffer -> unverändert, keine Ausnahme', () => {
  const tiny = Buffer.from([0xff])
  assert.deepEqual(stripJpegMetadata(tiny), tiny)
  assert.deepEqual(stripJpegMetadata(Buffer.alloc(0)), Buffer.alloc(0))
})

// --- PNG --------------------------------------------------------------------------------------------
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function crc32(buffer) {
  let crc = ~0
  for (const byte of buffer) {
    crc ^= byte
    for (let i = 0; i < 8; i += 1) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
  }
  return ~crc >>> 0
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typeAndData), 0)
  return Buffer.concat([length, typeAndData, crc])
}

const IHDR = pngChunk('IHDR', Buffer.alloc(13)) // Inhalt hier irrelevant für den Walker
const IDAT = pngChunk('IDAT', Buffer.from([1, 2, 3, 4]))
const IEND = pngChunk('IEND', Buffer.alloc(0))
const TEXT_CHUNK = pngChunk('tEXt', Buffer.from('Comment\0mit Geo-Hinweis', 'latin1'))
const EXIF_CHUNK = pngChunk('eXIf', Buffer.from([0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 8]))

function buildPng(...middleChunks) {
  return Buffer.concat([PNG_SIGNATURE, IHDR, ...middleChunks, IDAT, IEND])
}

test('stripPngMetadata: entfernt tEXt-Chunks, behält IHDR/IDAT/IEND', () => {
  const original = buildPng(TEXT_CHUNK)
  const stripped = stripPngMetadata(original)
  assert.deepEqual(stripped, buildPng())
  assert.equal(stripped.includes('Geo-Hinweis'), false)
})

test('stripPngMetadata: entfernt eXIf-Chunks', () => {
  const stripped = stripPngMetadata(buildPng(EXIF_CHUNK))
  assert.deepEqual(stripped, buildPng())
})

test('stripPngMetadata: kein PNG -> unveränderter Originalbuffer', () => {
  const notAPng = Buffer.from('kein Bild')
  assert.equal(stripPngMetadata(notAPng), notAPng)
})

test('stripPngMetadata: kaputte Chunk-Länge oder halber Chunk -> null (fail closed), keine Ausnahme', () => {
  const broken = Buffer.concat([PNG_SIGNATURE, Buffer.from([0x7f, 0xff, 0xff, 0xff]), Buffer.from('tEXt', 'ascii')])
  assert.equal(stripPngMetadata(broken), null)
  assert.equal(stripPngMetadata(Buffer.concat([PNG_SIGNATURE, IHDR, TEXT_CHUNK.subarray(0, 20)])), null)
  assert.equal(stripPngMetadata(Buffer.concat([PNG_SIGNATURE, IHDR, Buffer.from([0, 0])])), null)
})

test('stripPngMetadata: Bytes nach IEND fallen weg', () => {
  const original = Buffer.concat([buildPng(TEXT_CHUNK), EXIF_CHUNK, Buffer.from('Anhang', 'latin1')])
  assert.deepEqual(stripPngMetadata(original), buildPng())
})
