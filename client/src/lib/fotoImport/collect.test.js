import { describe, expect, test } from 'vitest'
import { zipSync } from 'fflate'
import { ImportError, collectPhotos } from './collect.js'
import { jpegWithExifDate } from './testJpeg.js'

describe('collectPhotos', () => {
  test('einzelne Fotos: EXIF-Datum, sonst Änderungsdatum (geschätzt)', async () => {
    const withExif = new File([jpegWithExifDate('2021:06:01 09:00:00')], 'wilma.jpg', { type: 'image/jpeg' })
    const without = new File([new Uint8Array([1, 2])], 'flocke.png', { type: 'image/png', lastModified: new Date(2020, 3, 5, 12).getTime() })
    const text = new File(['x'], 'liste.txt', { type: 'text/plain' })
    const { photos } = await collectPhotos([withExif, without, text])
    expect(photos.map((p) => [p.name, p.date, p.dateGuessed])).toEqual([
      ['wilma.jpg', '2021-06-01', false],
      ['flocke.png', '2020-04-05', true]
    ])
  })

  test('ZIP: Fotos daraus, ohne Bilder ein klarer Fehler', async () => {
    const zip = new File([zipSync({ 'a/lotte.jpg': jpegWithExifDate('2018:10:10 10:10:10') })], 'takeout.zip', { type: 'application/zip' })
    const { photos } = await collectPhotos([zip])
    expect(photos[0]).toMatchObject({ name: 'lotte.jpg', date: '2018-10-10', dateGuessed: false })
    const empty = new File([zipSync({ 'a.txt': new Uint8Array([1]) })], 'leer.zip')
    await expect(collectPhotos([empty])).rejects.toMatchObject({ code: 'nothingFound' })
    await expect(collectPhotos([new File(['kein zip'], 'kaputt.zip')])).rejects.toBeInstanceOf(ImportError)
  })
})
