import { describe, expect, test } from 'vitest'
import { readExifDate } from './exif.js'
import { jpegWithExifDate } from './testJpeg.js'

describe('readExifDate', () => {
  test('liest DateTimeOriginal in Intel- und Motorola-Reihenfolge', () => {
    expect(readExifDate(jpegWithExifDate('2023:07:14 10:22:33'))).toBe('2023-07-14')
    expect(readExifDate(jpegWithExifDate('2019:12:31 23:59:00', { little: false }))).toBe('2019-12-31')
    expect(readExifDate(jpegWithExifDate('2021:02:03 08:00:00').buffer)).toBe('2021-02-03')
  })

  test('nimmt DateTimeDigitized, wenn Original fehlt', () => {
    expect(readExifDate(jpegWithExifDate('2020:05:06 12:00:00', { tag: 0x9004 }))).toBe('2020-05-06')
  })

  test('gibt null bei fehlendem, ungültigem oder kaputtem EXIF', () => {
    expect(readExifDate(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull()
    expect(readExifDate(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))).toBeNull()
    expect(readExifDate(jpegWithExifDate('0000:00:00 00:00:00'))).toBeNull()
    expect(readExifDate(jpegWithExifDate('2023:02:30 10:00:00'))).toBeNull()
    expect(readExifDate(jpegWithExifDate('2023:07:14 10:22:33').subarray(0, 30))).toBeNull()
    expect(readExifDate(new Uint8Array(0))).toBeNull()
  })
})
