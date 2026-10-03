// Kleine synthetische Bilder für Upload-Tests. Öffentliche Fotos (Einblicke, Bannerfotos) laufen durch
// lib/photoUpload.js assertPublishablePhoto - die braucht lesbare Maße (JPEG: SOF-Segment, PNG: IHDR).

function jpegSegment(marker, payload) {
  const length = Buffer.alloc(2)
  length.writeUInt16BE(payload.length + 2, 0)
  return Buffer.concat([Buffer.from([0xff, marker]), length, payload])
}

// SOF0 (Baseline) mit Breite und Höhe - mehr liest lib/imageInspect.js nicht.
function sof0(width, height) {
  const payload = Buffer.alloc(15)
  payload[0] = 8
  payload.writeUInt16BE(height, 1)
  payload.writeUInt16BE(width, 3)
  payload[5] = 3
  return jpegSegment(0xc0, payload)
}

// Kleinstes lesbares JPEG ohne Metadaten: SOI, SOF0, SOS mit ein paar Bytes, EOI.
function tinyJpeg({ width = 4, height = 3 } = {}) {
  return Buffer.concat([Buffer.from([0xff, 0xd8]), sof0(width, height), jpegSegment(0xda, Buffer.from([0x00, 0x01, 0x02])), Buffer.from([0x12, 0x34, 0xff, 0xd9])])
}

module.exports = { jpegSegment, sof0, tinyJpeg, TINY_JPEG: tinyJpeg() }
