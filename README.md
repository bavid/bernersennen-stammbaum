# Familienchronik – Berner Sennenhund Stammbaum

Eine kleine Web-App, mit der Familien ihr Berner-Sennenhund-Rudel gemeinsam dokumentieren:
Stammbaum über Generationen, eine Chronik pro Hund, Zuchtbuch und druckbare Collagen.

- **Stammbaum**: Generationen werden automatisch berechnet, Eltern und Würfe mit Linien verbunden.
  Beim Überfahren eines Hundes wird seine Familie hervorgehoben, ein Klick öffnet seine Seite.
- **Chronik pro Hund**: Einträge mit Datum, Text und Fotos. Das Datum bestimmt die Position.
  Ein Eintrag von 2018, der heute nachgetragen wird, landet automatisch zwischen 2017 und 2019.
  Geburt, Deckakte und Nachwuchs erscheinen als automatische Meilensteine.
- **Zuchtbuch**: Deckakte und Würfe, auch mit Rüden aus anderen Rudeln oder als Freitext.
- **Collage**: A4-Collage aus Porträt, Chronik-Fotos und Eltern, Download als PNG.
- **Rudel mit Passwort**: Jedes Rudel hat ein gemeinsames Passwort. Optional braucht man zum
  Anlegen eines neuen Rudels einen Einladungscode.

Stack: Node.js/Express + SQLite (better-sqlite3), React + Vite, keine externen Dienste.
Schriften werden selbst gehostet (keine Google-Fonts-Aufrufe).

## Lokal starten

Voraussetzung: Node.js 20 oder neuer.

```bash
npm run install:all
npm run seed      # optional: Demo-Rudel "Rudel vom Sonnenhang", Passwort: sonnenhang
npm run dev       # API auf :4000, Oberfläche auf http://localhost:5173
```

Unter Windows startet `start.bat` dasselbe per Doppelklick.

| Befehl                          | Zweck                                          |
| ------------------------------- | ---------------------------------------------- |
| `npm test`                      | Server-Tests (node:test) und Client-Tests (Vitest) |
| `npm run build`                 | Produktions-Build der Oberfläche               |
| `npm run seed`                  | Demo-Rudel mit Testbildern anlegen             |
| `npm run db:reset -- -- --yes`  | Lokale Datenbank und Fotos löschen             |

## Auf einem Server betreiben (Docker)

Ein Container liefert API und Oberfläche auf einem Port aus (Standard 3000). Datenbank und Fotos
liegen im Ordner `data/` neben der `docker-compose.yml`.

### Mit `manage.ps1` (Windows)

1. `.deploy.env.example` nach `.deploy.env` kopieren und Server-IP eintragen.
2. `.\manage.ps1` starten, **[9] Erstinstallation** wählen. Das Skript installiert Docker,
   klont dieses Repo nach `/opt/bernersennen-stammbaum`, erzeugt eine `.env` mit zufälligem
   `JWT_SECRET` und Einladungscode und startet den Container.
3. Später: **[3] Deploy** holt den neuesten Stand von GitHub und baut neu.

Weitere Menüpunkte: Status, Logs, Backup herunterladen, Einladungscode anzeigen,
Demo-Rudel einspielen, alle Daten löschen (mit automatischem Backup vorher).

### Manuell

```bash
git clone https://github.com/bavid/bernersennen-stammbaum.git && cd bernersennen-stammbaum
cp .env.example .env   # JWT_SECRET setzen!
mkdir -p data && sudo chown 1000:1000 data
docker compose up -d --build
```

### Konfiguration (`.env`)

| Variable             | Bedeutung                                                              |
| -------------------- | ---------------------------------------------------------------------- |
| `JWT_SECRET`         | **Pflicht.** Zufälliges Secret für Session-Cookies                     |
| `FAMILY_INVITE_CODE` | Code zum Anlegen neuer Rudel (leer = jeder darf anlegen)               |
| `COOKIE_SECURE`      | `true`, sobald die Seite nur über HTTPS läuft                          |
| `TRUST_PROXY`        | `1` hinter Caddy/nginx, damit das Login-Rate-Limit echte IPs sieht      |
| `HOST_PORT`          | Port auf dem Server (Standard 3000)                                    |

Ohne Domain läuft die App per `http://SERVER-IP:3000`. Für HTTPS eine Domain auf den Server
zeigen lassen und einen Reverse-Proxy wie Caddy davorsetzen (`reverse_proxy localhost:3000`),
danach `COOKIE_SECURE=true` und `TRUST_PROXY=1` setzen.

## Sicherheit

- Passwörter mit bcrypt gehasht, Session als httpOnly-Cookie (JWT, 30 Tage)
- Rate-Limit auf Login und Rudel-Anlage
- Uploads nur als JPG/PNG/WebP/GIF, Dateiname und Endung vergibt der Server
- Security-Header (CSP, nosniff, frame-ancestors) per helmet
- Jedes Rudel sieht und ändert nur seine eigenen Hunde und Einträge

## Projektstruktur

```
client/          React-Oberfläche (Vite)
  src/lib/       reine Logik: Stammbaum-Layout, Timeline, Datumsformat (mit Tests)
server/          Express-API + SQLite
  routes/        auth, dogs, timeline, breeding, uploads
  seed/          Demo-Daten und Testbilder
  scripts/       seed.js, reset.js
deploy/remote.sh Server-Befehle (setup, deploy, backup, seed, wipe …)
manage.ps1       Windows-Menü für den Server
```
