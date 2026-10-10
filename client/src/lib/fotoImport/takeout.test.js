import { describe, expect, test } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import { MAX_ZIP_IMAGES, isZipFile, isoFromTimestamp, readTakeoutZip } from './takeout.js'
import { jpegWithExifDate } from './testJpeg.js'

// 2023-08-15 12:00 UTC - Mittag, damit das lokale Datum in jeder Zeitzone gleich bleibt (±11 h).
const NOON = Date.UTC(2023, 7, 15, 12) / 1000
const DIR = 'Takeout/Google Fotos/Urlaub/'

describe('Takeout-ZIP', () => {
  test('liest Bilder und ordnet Begleitdateien (alt und „supplemental-metadata“) zu', () => {
    const zip = zipSync({
      [`${DIR}IMG_1.jpg`]: jpegWithExifDate('2022:01:02 10:00:00'),
      [`${DIR}IMG_1.jpg.json`]: strToU8(JSON.stringify({ title: 'IMG_1.jpg', photoTakenTime: { timestamp: String(NOON) } })),
      [`${DIR}IMG_2.png`]: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
      [`${DIR}IMG_2.png.supplemental-metadata.json`]: strToU8(JSON.stringify({ photoTakenTime: { timestamp: String(NOON) } })),
      [`${DIR}notiz.txt`]: strToU8('Benno'),
      '__MACOSX/._IMG_1.jpg': new Uint8Array([1]),
      [`${DIR}kaputt.json`]: strToU8('{nicht json')
    })
    const { photos, truncated } = readTakeoutZip(zip)
    expect(truncated).toBe(false)
    expect(photos.map((p) => p.name).sort()).toEqual(['IMG_1.jpg', 'IMG_2.png'])
    const png = photos.find((p) => p.name === 'IMG_2.png')
    expect(png.type).toBe('image/png')
    expect(png.sidecarDate).toBe('2023-08-15')
    expect(photos.find((p) => p.name === 'IMG_1.jpg').sidecarDate).toBe('2023-08-15')
  })

  test('liest höchstens MAX_ZIP_IMAGES Bilder', () => {
    const files = {}
    for (let i = 0; i < MAX_ZIP_IMAGES + 3; i += 1) files[`f/${i}.jpg`] = new Uint8Array([0xff, 0xd8])
    const { photos, truncated } = readTakeoutZip(zipSync(files))
    expect(photos).toHaveLength(MAX_ZIP_IMAGES)
    expect(truncated).toBe(true)
  })

  test('Hilfen', () => {
    expect(isZipFile({ name: 'takeout-001.ZIP' })).toBe(true)
    expect(isZipFile({ name: 'a.jpg', type: 'image/jpeg' })).toBe(false)
    expect(isoFromTimestamp(NOON)).toBe('2023-08-15')
    expect(isoFromTimestamp('x')).toBeNull()
  })
})
