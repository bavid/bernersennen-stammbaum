# Fotos mitbringen (Plan 2027, Lane „Danach“, M)

Fotos aus einem Ordner oder einem Google-Takeout-ZIP mitbringen: je Tag eine Erinnerung, Datum aus EXIF.
Alles passiert im Browser (Datenschutz, Serverlast); der Server bekommt nur fertige, verkleinerte Fotos.

## Bestand (geprüft)
- Upload: `api.upload(file)` → `POST /uploads` (`server/lib/photoUpload.js`: 15 MB je Datei, JPG/PNG/WebP/GIF,
  Rate-Limit je Bereich/Stunde). Der Server entfernt EXIF/XMP/IPTC aus JPEG und Metadaten aus PNG
  (`lib/stripJpegMetadata.js`, `lib/stripPngMetadata.js`), WebP bleibt unangetastet.
- Client verkleinert vor dem Upload (`lib/images.js downscaleImage`, max. 2000 px, JPEG 0.86) – aber nur,
  wenn das Bild groß ist; kleine Dateien gehen unverändert (mit EXIF) raus.
- Erinnerung: `api.createTimelineEntry({ dogId, autorName, datum, titel, text, fotoUrls, privat })`;
  `server/lib/validate.js` erlaubt höchstens 20 Fotos je Eintrag, Titel ≤ 120.
- Standard-Sichtbarkeit einer neuen Erinnerung: geteilt (`privat: false`), „privat“ nur im Zuhause.

## Entwurf
- `client/src/lib/fotoImport/` (rein, testbar):
  - `exif.js` – Mini-Parser: JPEG APP1 → TIFF → IFD0 → ExifIFD → DateTimeOriginal (0x9003), sonst DateTime.
  - `takeout.js` – ZIP entpacken (`fflate`, MIT), Bilder + JSON-Begleitdateien (`photoTakenTime.timestamp`).
  - `group.js` – Tagesgruppen, Grenzen: 60 Fotos / 20 Erinnerungen je Import, max. 20 Fotos je Erinnerung.
  - `reencode.js` – jedes Foto per Canvas neu kodieren (immer, auch klein) → kein GPS verlässt das Gerät.
  - `runImport.js` – nacheinander hochladen + je Tag eine Erinnerung anlegen; Abbrechen; Fehler je Tag;
    bereits angelegte Erinnerungen bleiben (Wiederholen überspringt erledigte Tage).
- UI `components/fotoImport/FotoImportDialog.jsx` (eigener Chunk via `React.lazy`), drei Schritte:
  Auswählen → Tage prüfen (Raster, vorausgewählt, abwählbar, eine Sichtbarkeit) → Hochladen (Fortschritt).
- Einstieg: ruhiger Ghost-Knopf „Fotos mitbringen“ im Chronik-Reiter (`DogChronicle.jsx`), nur mit Schreibrecht.
- Demo/Admin-Ansicht: Ablauf ansehen ja, Hochladen nein (Hinweis statt Knopf).
- Englisch: `lib/i18n/en/import.js`.

## Tests
EXIF-Datum, Gruppierung + Grenzen, ZIP mit im Test erzeugtem Mini-ZIP + Sidecar, Upload-Reihenfolge mit
gemocktem api, Abbruch/Fehler je Tag, Demo schreibt nicht, Englisch vollständig.
