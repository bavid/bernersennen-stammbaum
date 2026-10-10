// Nur für Tests: ein winziges „JPEG“ (SOI, APP1/Exif, EOI) mit DateTimeOriginal - in Intel- oder Motorola-Byte-Reihenfolge.
export function jpegWithExifDate(dateText, { little = true, tag = 0x9003 } = {}) {
  const tiff = new Uint8Array(64)
  const view = new DataView(tiff.buffer)
  tiff.set(little ? [0x49, 0x49] : [0x4d, 0x4d], 0)
  view.setUint16(2, 42, little)
  view.setUint32(4, 8, little)
  // IFD0: ein Eintrag - Zeiger auf das Exif-IFD bei 26
  view.setUint16(8, 1, little)
  view.setUint16(10, 0x8769, little)
  view.setUint16(12, 4, little)
  view.setUint32(14, 1, little)
  view.setUint32(18, 26, little)
  // Exif-IFD: ein ASCII-Eintrag (20 Bytes) bei 44
  view.setUint16(26, 1, little)
  view.setUint16(28, tag, little)
  view.setUint16(30, 2, little)
  view.setUint32(32, 20, little)
  view.setUint32(36, 44, little)
  for (let i = 0; i < dateText.length; i += 1) tiff[44 + i] = dateText.charCodeAt(i)
  const exifHeader = [0x45, 0x78, 0x69, 0x66, 0, 0]
  const segLength = 2 + exifHeader.length + tiff.length
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, segLength >> 8, segLength & 0xff, ...exifHeader, ...tiff, 0xff, 0xd9])
}
