# Bernersennenhund-Familienchronik — Design Spec

Datum: 2026-07-29

## Ziel

Eine lokal laufende Webseite, mit der Besitzer mehrerer verwandter Bernersennenhund-Familien
(Rudel) gemeinsam eine Familienchronik/Stammbaum pflegen können: Stammdaten der Hunde,
Verwandtschaftsverhältnisse, eine Timeline mit Beiträgen der Besitzer, Deckakt-/Wurf-Einträge
und ein automatischer Collage-Generator zum Ausdrucken.

Die Anwendung ist generisch für mehrere Familien/Rudel ausgelegt, nicht auf einen einzelnen
Hund beschränkt. Jede Familie hat ein eigenes Passwort; abhängig vom eingegebenen Passwort
sieht man den zugehörigen Stammbaum.

## Architektur

- **Backend:** Node.js + Express, REST-API (`/api/...`)
- **Datenbank:** SQLite, eine Datei (`server/data.db`), keine separate DB-Serverinstallation nötig
- **Frontend:** React + Vite (SPA), eigenständiges, an Bernersennenhunde angelehntes Design
  (warmes Braun/Rostrot/Creme, editorial-artige Gestaltung, kein generisches Template-Layout)
- **Bild-Uploads:** lokal in `server/uploads/`, Pfad wird in der DB referenziert
- **Start:** `start.bat` (Doppelklick unter Windows) sowie `npm run dev` im Root, startet
  Backend (Express, Port z.B. 4000) und Frontend (Vite Dev-Server, Port z.B. 5173) parallel.
  Deploy/Hosting ist explizit **nicht** Teil dieser Phase — erst lokal, Deploy folgt später.

## Datenmodell

### Family (Rudel)
- `id`
- `name`
- `passwordHash`
- `createdAt`

### Dog (Hund)
- `id`
- `familyId` (FK Family)
- `name`
- `geschlecht` (Rüde/Hündin)
- `geburtsdatum`
- `farbeMarkings` (Freitext)
- `motherDogId` (nullable FK Dog, familienübergreifend wählbar)
- `fatherDogId` (nullable FK Dog, familienübergreifend wählbar)
- `motherFreitext` (nullable, falls Mutter nicht im System erfasst ist: Name, optional Zwinger/Züchter)
- `fatherFreitext` (nullable, analog für Vater)
- `fotoUrl`
- `beschreibung` (Freitext)

Ein Hund kann entweder über `motherDogId`/`fatherDogId` mit einem existierenden Datensatz
verlinkt werden (ermöglicht familienübergreifende Stammbaum-Verlinkung, z.B. ein Rüde ist
Vater in einer anderen Familie), oder per Freitextfeld erfasst werden, falls der Elternteil
nicht im System existiert. Beides ist gleichzeitig möglich (motherDogId ODER motherFreitext
pro Elternteil, nicht beides gleichzeitig gesetzt).

### TimelineEntry
- `id`
- `dogId` (FK Dog)
- `familyId` (FK Family, redundant für einfachere Abfragen)
- `autorName` (Freitext, kein Benutzerkonto)
- `datum`
- `titel`
- `text`
- `fotoUrls` (JSON-Array von Pfaden)

### BreedingEvent (Deckakt/Wurf)
- `id`
- `familyId`
- `mutterDogId` (FK Dog)
- `vaterDogId` (nullable FK Dog) / `vaterFreitext` (nullable)
- `datum`
- `wurfInfo` (Freitext: Anzahl Welpen, Notizen)
- `fotoUrls` (JSON-Array)

## Kernfunktionen

1. **Login:** Passworteingabe auf Startseite → Server prüft Hash gegen alle Families →
   bei Treffer Session-Token (z.B. signiertes Cookie), das den Zugriff auf die zugehörige
   `familyId` beschränkt. Kein separates Benutzerkonto-System (MVP-Entscheidung).
2. **Neue Familie anlegen:** einfaches Formular (Familienname + Passwort), erzeugt neuen
   leeren Stammbaum. Kein separater Admin-Bereich nötig.
3. **Stammbaum-Übersicht:** visuelle Baumdarstellung der Hunde einer Familie mit
   Eltern-Kind-Verknüpfungen, klickbare Karten je Hund.
4. **Hund-Detailseite:** Stammdaten, Foto, Eltern (verlinkt oder Freitext), Liste der
   Timeline-Einträge für diesen Hund.
5. **Timeline:** chronologische Liste pro Hund (oder Familien-weit gefiltert), jeder
   Besitzer kann Einträge mit Titel, Text, Datum, Fotos und eigenem Namen hinzufügen.
6. **Deckakt/Wurf erfassen:** Formular mit Mutter/Vater-Auswahl (Dropdown mit Suche über
   vorhandene Hunde, familienübergreifend, plus Freitext-Fallback), Datum, Wurfinfos, Fotos.
7. **Collage-Generator:** wählt Fotos + Kerninfos (Name, Geburtsjahr, Eltern) eines Hundes
   oder einer Familie aus, layoutet sie clientseitig auf HTML Canvas zu einer druckbaren
   Collage, Download als PNG.

## Nicht im Scope (MVP)

- Kein Deploy/Hosting
- Keine granularen Nutzerrechte/Rollen, keine Benutzerkonten
- Keine Bildbearbeitung (nur Upload + Anzeige)
- Keine E-Mail-Benachrichtigungen

## Offene technische Details (werden im Implementierungsplan konkretisiert)

- Genaues React-Component-Layout und Routing
- Bibliothek für die Stammbaum-Baumdarstellung (z.B. eigene SVG/Canvas-Lösung vs.
  vorhandene Tree-Visualisierungs-Bibliothek)
- Session-Handling im Detail (Cookie-Format, Ablaufzeit)
