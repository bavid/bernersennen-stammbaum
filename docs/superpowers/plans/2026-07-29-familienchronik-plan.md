# Bernersennenhund-Familienchronik Implementation Plan

**Goal:** Lokal lauffähige Web-App (Node/Express + SQLite + React) für mehrere Hundefamilien mit Passwort-Login, Stammbaum-Pflege, Timeline und Collage-Download.

**Architecture:** Express-REST-Backend mit SQLite (better-sqlite3) als einzige Datenquelle, JWT-Cookie-Session pro Familie. React/Vite-SPA konsumiert die API. Bilder werden als Dateien in `server/uploads/` abgelegt.

**Tech Stack:** Node.js, Express, better-sqlite3, bcryptjs, jsonwebtoken, multer (Uploads), React 18, Vite, react-router-dom.

**Scoping-Hinweis:** Persönliches Hobby-Projekt für eine Familienchronik, kein produktionskritisches System. Tests werden für die kernrelevante Logik geschrieben (Auth, Pedigree-Verknüpfung), nicht für jede triviale CRUD-Route — passend zu YAGNI und dem Wunsch des Nutzers nach zügiger Umsetzung.

---

## Dateistruktur

```
bernersennen-stammbaum/
  start.bat                      # Startskript (Windows Doppelklick)
  package.json                   # Root: concurrently-Skript für dev
  server/
    package.json
    index.js                     # Express-App, Middleware, Routen-Mount
    db.js                        # better-sqlite3 Setup + Schema-Migration
    middleware/auth.js           # JWT-Cookie-Check, hängt familyId an req
    routes/auth.js                # POST /api/login, POST /api/families
    routes/dogs.js                 # CRUD /api/dogs
    routes/timeline.js             # CRUD /api/timeline
    routes/breeding.js             # CRUD /api/breeding
    uploads/.gitkeep
    test/auth.test.js
    test/dogs.test.js
  client/
    index.html
    vite.config.js
    package.json
    src/
      main.jsx
      App.jsx
      api.js                      # fetch-Wrapper mit credentials
      styles/tokens.css
      styles/global.css
      pages/LoginPage.jsx
      pages/CreateFamilyPage.jsx
      pages/OverviewPage.jsx       # Stammbaum-Übersicht
      pages/DogDetailPage.jsx
      pages/BreedingFormPage.jsx
      pages/CollagePage.jsx
      components/PedigreeTree.jsx
      components/DogCard.jsx
      components/ParentPicker.jsx
      components/TimelineList.jsx
      components/TimelineEntryForm.jsx
  .gitignore
```

## Datenbankschema (server/db.js)

```sql
CREATE TABLE IF NOT EXISTS families (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dogs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL REFERENCES families(id),
  name TEXT NOT NULL,
  geschlecht TEXT CHECK(geschlecht IN ('ruede','huendin')) NOT NULL,
  geburtsdatum TEXT,
  farbe_markings TEXT,
  mother_dog_id INTEGER REFERENCES dogs(id),
  father_dog_id INTEGER REFERENCES dogs(id),
  mother_freitext TEXT,
  father_freitext TEXT,
  foto_url TEXT,
  beschreibung TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS timeline_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dog_id INTEGER NOT NULL REFERENCES dogs(id),
  family_id INTEGER NOT NULL REFERENCES families(id),
  autor_name TEXT NOT NULL,
  datum TEXT NOT NULL,
  titel TEXT NOT NULL,
  text TEXT,
  foto_urls TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS breeding_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL REFERENCES families(id),
  mutter_dog_id INTEGER NOT NULL REFERENCES dogs(id),
  vater_dog_id INTEGER REFERENCES dogs(id),
  vater_freitext TEXT,
  datum TEXT NOT NULL,
  wurf_info TEXT,
  foto_urls TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

Constraint (App-Ebene, nicht SQL): pro Elternteil ist entweder `*_dog_id` ODER `*_freitext`
gesetzt, nie beides.

## API-Endpunkte

- `POST /api/families` `{name, password}` → legt Family an, setzt Session-Cookie
- `POST /api/login` `{password}` → prüft Hash gegen alle Families, setzt Session-Cookie
- `POST /api/logout`
- `GET /api/dogs` (alle Hunde der eingeloggten Family, für Stammbaum + Parent-Picker
  zusätzlich `GET /api/dogs?all=1` für familienübergreifende Auswahl mit reduziertem
  Feldset `{id, name, familyName}`)
- `POST /api/dogs`, `GET /api/dogs/:id`, `PUT /api/dogs/:id`
- `GET /api/timeline?dogId=`, `POST /api/timeline`
- `GET /api/breeding`, `POST /api/breeding`
- `POST /api/uploads` (multer, gibt `{url}` zurück) — genutzt von Dog/Timeline/Breeding-Formularen

Alle Routen außer `/api/login` und `/api/families` (POST) verlangen gültiges Session-Cookie
(Middleware `requireAuth`, hängt `req.familyId` an).

---

## Task 1: Projekt-Grundgerüst

**Files:** `package.json` (root), `server/package.json`, `client/` (Vite-Scaffold), `.gitignore`, `start.bat`

- [ ] Root-`package.json` mit `concurrently`, Skript `"dev": "concurrently \"npm:dev:server\" \"npm:dev:client\""`
- [ ] `server/package.json`: express, better-sqlite3, bcryptjs, jsonwebtoken, cookie-parser, multer, cors; devDependency: nodemon
- [ ] `client/`: `npm create vite@latest client -- --template react`, dazu react-router-dom installieren
- [ ] `.gitignore`: `node_modules/`, `server/data.db`, `server/uploads/*` (außer `.gitkeep`), `client/dist/`
- [ ] `start.bat`:
```bat
@echo off
cd /d %~dp0
call npm install
call npm run dev
```
- [ ] Commit: "chore: scaffold server and client projects"

## Task 2: Datenbank-Setup

**Files:** `server/db.js`

- [ ] `db.js` erstellt SQLite-Verbindung (`better-sqlite3`) zu `server/data.db`, führt obiges
  Schema per `exec()` beim Start aus (idempotent via `IF NOT EXISTS`), exportiert die
  DB-Instanz.
- [ ] Kurztest `server/test/db.test.js` (node:test): DB-Datei wird erstellt, Tabellen existieren
  (`SELECT name FROM sqlite_master WHERE type='table'`).
- [ ] Commit: "feat: add sqlite schema setup"

## Task 3: Auth (Login, Family-Erstellung, Middleware)

**Files:** `server/routes/auth.js`, `server/middleware/auth.js`, `server/index.js`, `server/test/auth.test.js`

- [ ] `POST /api/families`: validiert `name`/`password` nicht leer, hasht Passwort (bcryptjs,
  10 rounds), inserted Family, signiert JWT `{familyId}` (7 Tage), setzt httpOnly-Cookie
  `session`.
- [ ] `POST /api/login`: lädt alle Families, vergleicht Passwort gegen jeden `password_hash`
  via `bcrypt.compare` bis Treffer (bei wenigen Families performant genug), bei Treffer
  gleiches Cookie-Vorgehen wie oben, sonst 401.
- [ ] `middleware/auth.js`: liest `session`-Cookie, verifiziert JWT, setzt `req.familyId`,
  sonst 401.
- [ ] Test: Family anlegen → Cookie gesetzt → Login mit korrektem Passwort erfolgreich →
  Login mit falschem Passwort 401 → geschützte Route ohne Cookie 401.
- [ ] Commit: "feat: add family auth (login, create, session middleware)"

## Task 4: Dogs-API inkl. Pedigree-Verknüpfung

**Files:** `server/routes/dogs.js`, `server/test/dogs.test.js`

- [ ] `GET /api/dogs`: Hunde der eigenen Family.
- [ ] `GET /api/dogs?all=1`: alle Hunde aller Families, reduziert auf
  `{id, name, familyName}` (für Parent-Picker über Familiengrenzen hinweg).
- [ ] `POST /api/dogs`: validiert, dass pro Elternteil höchstens eine der beiden Angaben
  (`motherDogId` / `motherFreitext`) gesetzt ist (400 bei Verstoß), inserted Hund mit
  `family_id = req.familyId`.
- [ ] `GET /api/dogs/:id`: Hund inkl. aufgelöster Elterninfo (Name aus verlinktem Hund oder
  Freitext).
- [ ] `PUT /api/dogs/:id`: nur eigene Family darf ändern (403 sonst).
- [ ] Test: Hund mit verlinkter Mutter anlegen, Hund mit Freitext-Vater anlegen, Validierung
  "beides gesetzt" schlägt fehl, Family-A darf Hund von Family-B nicht bearbeiten.
- [ ] Commit: "feat: add dogs API with pedigree linking"

## Task 5: Timeline- und Breeding-API

**Files:** `server/routes/timeline.js`, `server/routes/breeding.js`

- [ ] `GET /api/timeline?dogId=`, `POST /api/timeline` (validiert `dogId` gehört zur eigenen
  Family).
- [ ] `GET /api/breeding`, `POST /api/breeding` (validiert `mutterDogId` gehört zur eigenen
  Family; `vaterDogId` darf familienübergreifend sein).
- [ ] Manueller Kurztest per curl/Thunder-Client-Notiz im Commit-Body reicht hier (kein
  dediziertes Test-File, um Scope schlank zu halten).
- [ ] Commit: "feat: add timeline and breeding APIs"

## Task 6: Datei-Upload

**Files:** `server/index.js`, `server/routes/uploads.js`

- [ ] `multer`-Setup speichert nach `server/uploads/<uuid>-<originalname>`, `POST
  /api/uploads` (auth-geschützt) gibt `{url: "/uploads/<file>"}` zurück.
- [ ] Express liefert `server/uploads/` statisch unter `/uploads`.
- [ ] Commit: "feat: add image upload endpoint"

## Task 7: Frontend-Grundgerüst, Routing, Design-Tokens

**Files:** `client/src/main.jsx`, `App.jsx`, `styles/tokens.css`, `styles/global.css`, `api.js`

- [ ] `api.js`: fetch-Wrapper mit `credentials: 'include'`, Basis-URL `http://localhost:4000`.
- [ ] `styles/tokens.css`: Farbpalette (Bernersennen-Braun/Rostrot/Creme), Typo-Skala,
  Spacing-Scale als CSS-Variablen.
- [ ] Routing (`react-router-dom`): `/` (Login), `/neue-familie`, `/stammbaum`,
  `/hund/:id`, `/deckakt-erfassen`, `/collage`.
- [ ] Commit: "feat: scaffold frontend routing and design tokens"

## Task 8: Login- und Family-Erstellung-Seiten

**Files:** `client/src/pages/LoginPage.jsx`, `CreateFamilyPage.jsx`

- [ ] `LoginPage`: Passwortfeld, POST an `/api/login`, bei Erfolg Redirect zu `/stammbaum`,
  Fehleranzeige bei 401. Link zu "Neue Familie anlegen".
- [ ] `CreateFamilyPage`: Formular Familienname + Passwort, POST an `/api/families`, Redirect
  zu `/stammbaum`.
- [ ] Commit: "feat: add login and family creation pages"

## Task 9: Stammbaum-Übersicht + Hund-Detail

**Files:** `components/PedigreeTree.jsx`, `components/DogCard.jsx`, `pages/OverviewPage.jsx`,
`pages/DogDetailPage.jsx`, `components/ParentPicker.jsx`, `components/TimelineList.jsx`,
`components/TimelineEntryForm.jsx`

- [ ] `OverviewPage`: lädt `/api/dogs`, rendert `PedigreeTree` (generationenweise Anordnung
  über Eltern-Kind-Kanten, einfache eigene SVG/Flexbox-Lösung — keine externe
  Baum-Bibliothek nötig für diesen Umfang).
- [ ] `DogDetailPage`: Stammdaten, Foto, Eltern (verlinkt→Link zur jeweiligen Detailseite,
  oder Freitext), eingebettete `TimelineList` + `TimelineEntryForm` (Titel, Text, Datum,
  Foto-Upload, Autorenname).
- [ ] `ParentPicker`: Suchfeld über `/api/dogs?all=1`, Umschalter "Hund nicht gelistet" →
  Freitextfeld.
- [ ] Formular "Neuer Hund" auf `OverviewPage` nutzt `ParentPicker` zweimal (Mutter/Vater).
- [ ] Commit: "feat: add pedigree overview and dog detail pages"

## Task 10: Deckakt/Wurf-Formular

**Files:** `pages/BreedingFormPage.jsx`

- [ ] Formular: Mutter (`ParentPicker`, nur eigene Family), Vater (`ParentPicker`,
  familienübergreifend), Datum, Wurfinfo-Textfeld, Foto-Upload, POST an `/api/breeding`.
- [ ] Commit: "feat: add breeding event form"

## Task 11: Collage-Generator

**Files:** `pages/CollagePage.jsx`

- [ ] Hund-Auswahl (Dropdown aus `/api/dogs`), lädt Hundefoto + Timeline-Fotos + Kerninfos
  (Name, Geburtsjahr, Elternnamen).
- [ ] Zeichnet Layout auf `<canvas>` (Titel oben, Grid aus Fotos, Infoblock unten) via
  `drawImage`/`fillText`.
- [ ] "Download"-Button: `canvas.toBlob` → `<a download>` mit PNG.
- [ ] Commit: "feat: add collage generator with PNG download"

## Task 12: Manuelle End-to-End-Prüfung

- [ ] `start.bat` ausführen, im Browser: Familie anlegen → einloggen → Hund anlegen (mit
  Freitext-Elternteil) → zweiten Hund anlegen und ersten als Mutter verlinken →
  Timeline-Eintrag mit Foto hinzufügen → Deckakt erfassen → Collage generieren und
  herunterladen.
- [ ] Ergebnisse und evtl. Bugfixes dokumentieren, Commit je Fix.

---

## Self-Review-Notizen

- **Spec-Abdeckung:** Login (Task 3, 8), neue Familie (Task 3, 8), Stammbaum-Übersicht
  (Task 9), Hund-Detail (Task 9), Timeline (Task 9), Deckakt/Wurf (Task 5, 10),
  Collage-Download (Task 11), Start-Skript (Task 1) — alle Spec-Punkte abgedeckt.
- **Pedigree-Verknüpfung** (Dropdown + Freitext, familienübergreifend) explizit in Task 4/9
  berücksichtigt.
- Keine Platzhalter; offene technische Details aus der Spec (Tree-Darstellung,
  Session-Format) sind hier konkret entschieden (eigene SVG/Flexbox-Lösung, JWT-Cookie).
