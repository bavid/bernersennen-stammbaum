// Deutsche Texte von „Fotos mitbringen“ an einer Stelle (englisch: lib/i18n/en/import.js) - Komponenten übersetzen mit t().
export const IMPORT_TEXT = Object.freeze({
  action: 'Fotos mitbringen',
  // Leiser Zweitweg im Erzählen-Feld der Chronik (components/dog/DogChronicle.jsx).
  entry: 'Mehrere Fotos auf einmal',
  title: 'Fotos mitbringen',
  intro: 'Wählt Fotos von diesem Gerät oder Fotos aus Google Fotos (als ZIP heruntergeladen). Je Tag entsteht eine Erinnerung – das Datum lesen wir aus dem Foto.',
  privacy: 'Alles bleibt erst auf diesem Gerät. Wir verkleinern jedes Foto vor dem Hochladen und lassen dabei weg, an welchem Ort es gemacht wurde.',
  pickPhotos: 'Fotos auswählen',
  pickFolder: 'Ganzen Ordner',
  pickZip: 'Aus Google Fotos (ZIP)',
  // Ein-Zeilen-Anleitung unter den Knöpfen (Audit: „Takeout“ sagt Susi nichts).
  howTo: 'So geht’s: In Google Fotos die Fotos auswählen, „Herunterladen“ tippen und die ZIP-Datei hier wählen.',
  reading: 'Fotos werden gelesen …',
  nothingFound: 'Darin haben wir keine Fotos gefunden.',
  zipTooBig: 'Die ZIP-Datei ist zu groß. Bitte weniger Fotos auf einmal herunterladen (bis {mb} MB).',
  zipBroken: 'Die ZIP-Datei lässt sich nicht öffnen.',
  moreThanRead: 'Wir haben die ersten {n} Fotos gelesen.',
  reviewHint: 'Alle Tage sind ausgewählt. Tippt ein Foto an, um es wegzulassen.',
  capHint: 'Auf einmal gehen höchstens {photos} Fotos und {days} Erinnerungen ({perDay} Fotos je Tag). {n} Fotos bleiben für den nächsten Durchgang.',
  dayTitle: 'Fotos vom {date}',
  dateGuessed: 'Datum geschätzt',
  namePrompt: 'Euer Name (steht an der Erinnerung)',
  nameMissing: 'Bitte einen Namen eintragen.',
  start: 'Erinnerungen anlegen',
  back: 'Andere Fotos',
  cancel: 'Abbrechen',
  close: 'Schließen',
  uploading: 'Foto {done} von {total} …',
  errorsTitle: 'Diese Tage hat es nicht geschafft:',
  retry: 'Fehlende Tage nochmal',
  unreadable: 'Ein Foto kann dieser Browser nicht lesen.',
  demo: 'In der Demo könnt ihr den Ablauf ansehen – hochgeladen wird nichts.',
  selectPhoto: 'Foto vom {date} mitnehmen'
})

// Anzahlen je [Einzahl, Mehrzahl]: countText wählt bei genau 1 die Einzahl, t() setzt danach { n } ein.
export const IMPORT_COUNT = Object.freeze({
  photos: ['1 Foto', '{n} Fotos'],
  memories: ['1 Erinnerung', '{n} Erinnerungen'],
  dayGroup: ['{date} · 1 Foto', '{date} · {n} Fotos'],
  done: ['1 Erinnerung angelegt.', '{n} Erinnerungen angelegt.'],
  cancelled: ['Abgebrochen. 1 Erinnerung ist schon angelegt und bleibt.', 'Abgebrochen. {n} Erinnerungen sind schon angelegt und bleiben.']
})

export function countText([one, many], n) {
  return n === 1 ? one : many
}
