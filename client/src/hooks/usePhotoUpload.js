import { useState } from 'react'
import { api } from '../api'
import { downscaleImage } from '../lib/images.js'

const NOT_AN_IMAGE = 'Das ist kein Foto – bitte wähle ein Bild.'

// Fotos hochladen (verkleinert, eins nach dem anderen) - für PhotoPicker und das Fotofeld einer neuen Erinnerung.
// onUploaded(urls) bekommt die neuen Adressen; scheitert ein Foto mittendrin, kommen die schon hochgeladenen trotzdem an
// und der Fehler geht an onError. onBusyChange meldet, solange hochgeladen wird (z. B. um „Speichern“ zu sperren).
export default function usePhotoUpload({ onUploaded, onError, onBusyChange }) {
  const [busy, setBusy] = useState(false)

  async function upload(fileList) {
    const all = Array.from(fileList || [])
    const files = all.filter((file) => file.type?.startsWith('image/'))
    if (all.length > 0 && files.length === 0) onError?.(NOT_AN_IMAGE)
    if (files.length === 0) return
    setBusy(true)
    onBusyChange?.(true)
    onError?.(null)
    const urls = []
    try {
      for (const file of files) {
        const prepared = await downscaleImage(file)
        const { url } = await api.upload(prepared)
        urls.push(url)
      }
    } catch (err) {
      onError?.(err.message)
    } finally {
      if (urls.length > 0) onUploaded(urls)
      setBusy(false)
      onBusyChange?.(false)
    }
  }

  return { busy, upload }
}
