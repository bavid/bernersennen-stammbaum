# Gesundheit leicht (Plan 2027, Spur „Danach“)

Ziel: Impfung, Wurmkur & Floh und Tierarzt als *Art* einer Erinnerung, mit optionalem „Nächstes Mal am“ – sichtbar als
ruhige Erinnerung auf Start („Bald“) und als kleiner Block im Reiter „Infos“. Keine Krankenakte: kein Diagramm, keine
Medikamente, keine Werte; der Text bleibt frei.

## Bestand (erkundet)
- Erinnerungen = `timeline_entries`; `kategorie` gibt es nur kosmetisch fürs Tierheim (`ankunft, tierarzt, …`).
- Sichtbarkeit: Flag `privat` (nur das eigene Zuhause); im Tierheim nie privat. Form: `SichtbarkeitWahl`.
- „Bald“ (`StartSoon`) zeigt Pinnwand-Termine (aus `/api/start`) und den Einzugs-Jahrestag – rein clientseitig gemischt.
- Glocke zählt drei Quellen aus `/me`; Push nur ereignisgetrieben (kein Zeitplaner) → beides nicht billig, **ausgelassen**.

## Server
- `server/lib/gesundheit.js`: Tabelle `gesundheit_eintraege (entry_id PK REFERENCES timeline_entries ON DELETE CASCADE,
  art CHECK IN (impfung, wurmkur_floh, tierarzt, sonstiges), naechstes_am)`; `readGesundheitInput`, `applyGesundheit`,
  `withGesundheit`, `gesundheitUebersicht`, `gesundheitBald`, Demo-Helfer.
- `routes/timeline.js` (nicht `dogs.js`): POST/PUT nehmen optional `gesundheit: { art, naechstesAm } | null`; eine neue
  Gesundheits-Erinnerung ohne `privat` im Body wird im Zuhause privat. Antworten tragen `gesundheit`.
- `routes/gesundheit.js` (`/api/gesundheit`): `GET ?dogId=` (letzte je Art + nächster Termin, nur eigenes Tier, sonst
  404) und `GET /bald?heute=` (nur im eigenen Zuhause: nächste Termine in 0–14 Tagen, je Tier und Art nur der jüngste
  Eintrag, ohne verabschiedete Tiere). Schreiben nur über die Timeline (Demo dort schon gesperrt).

## Client
- `lib/gesundheit.js` (Arten, Labels, Texte, Payload), `entryForm/GesundheitWahl.jsx` (Schalter „Gesundheit“ → Art als
  Chips + „Nächstes Mal am“; Einschalten setzt „Nur wir (privat)“), `dog/GesundheitInfos.jsx` im Reiter Infos,
  „Bald“-Zeilen in `StartSoon` (Daten über `hooks/useGesundheitBald.js` in `StartPage`).
- Englisch in `lib/i18n/en/gesundheit.js`.

## Demo
Nele (Zuhause am Deich): Impfung mit nächstem Termin in 10 Tagen, Wurmkur mit nächstem Termin in 6 Wochen; der
bestehende Tierarzt-Termin wird Art „Tierarzt“.

## Tests zuerst
Server: Speichern/Validieren, privat als Vorgabe, 404 für fremde Tiere/Einträge, Fenster 14 Tage, CASCADE, Demo.
Client: Formular (Schalter, privat, Payload), Infos-Block, „Bald“-Zeile, englische Texte.
