# Familienchronik – Berner Sennenhund Stammbaum

**Wie geht’s den anderen?** Geschwister, Eltern und Großeltern eines Wurfs leben meist in
verschiedenen Familien. Diese kleine Web-App hält sie verbunden: Klick einen Hund an und schau nach,
was er so treibt – mit Stammbaum über Generationen, einer Chronik pro Hund, einer gemeinsamen
Pinnwand für Treffen und Notizen, Zuchtbuch und druckbaren Collagen.

![Stammbaum über fünf Generationen mit Rassen und Wurfdatum](docs/screenshots/stammbaum.jpg)

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/hund.jpg" alt="Hundeseite mit Rasse, Eltern und Chronik"></td>
    <td width="50%"><img src="docs/screenshots/timeline.jpg" alt="Nachgetragener Eintrag landet automatisch am richtigen Datum"></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/pinnwand.jpg" alt="Pinnwand mit Treffen und Notizen"></td>
    <td><img src="docs/screenshots/neu-im-rudel.jpg" alt="Neu im Rudel: nächstes Treffen und neueste Einträge"></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/login.jpg" alt="Login: Wie geht’s den anderen?"></td>
    <td align="center"><img src="docs/screenshots/mobil.jpg" alt="Stammbaum auf dem Handy" width="260"></td>
  </tr>
</table>

## Funktionen

- **Stammbaum**: Generationen werden automatisch berechnet, Eltern und Würfe mit Linien verbunden,
  jede Generation zeigt ihr Geburtsdatum bzw. ihre Geburtsjahre. Beim Überfahren eines Hundes wird
  seine Familie hervorgehoben, ein Klick öffnet seine Seite.
- **Rasse & unbekannte Vorfahren**: Jeder Hund hat eine Rasse (auch Mischungen wie
  „Berner × Hovawart"). Vorfahren ohne bekannten Namen lassen sich mit „Name unbekannt" anlegen
  und erscheinen trotzdem als eigene Karte im Baum.
- **Chronik pro Hund**: Einträge mit Datum, Text und Fotos. Das Datum bestimmt die Position.
  Ein Eintrag von 2018, der heute nachgetragen wird, landet automatisch zwischen 2017 und 2019.
  Geburt, Deckakte und Nachwuchs erscheinen als automatische Meilensteine.
- **Neu im Rudel**: Über dem Stammbaum stehen das nächste Treffen und die zuletzt geschriebenen
  Einträge aller Hunde – ein Klick springt direkt zum Eintrag.
- **Pinnwand**: Einfache Zettel für alle, optional mit Termin (Datum, Uhrzeit). Kommende Treffen
  stehen oben, vergangene rutschen ans Ende.
- **Zuchtbuch**: Deckakte und Würfe, Rüden aus dem eigenen Rudel oder als Freitext.
- **Collage**: A4-Collage aus Porträt, Chronik-Fotos und Eltern, Download als PNG.
- **Rudel mit Passwort**: Jedes Rudel hat ein gemeinsames Passwort und sieht nur seine eigenen
  Hunde, Einträge und Fotos. Zum Anlegen eines neuen Rudels braucht man optional einen Einladungscode.
- **Handy-tauglich**: kompakte Stammbaum-Karten, Navigation unten, Fotos werden vor dem Upload verkleinert.

Stack: Node.js/Express + SQLite (better-sqlite3), React + Vite, Caddy für HTTPS, keine externen
Dienste. Schriften werden selbst gehostet (keine Google-Fonts-Aufrufe).

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
| `npm --prefix server run family:delete -- "Name" --yes` | Ein Rudel samt Hunden und Fotos löschen |

## Auf einem Server betreiben (Docker + HTTPS)

Zwei Container: die App (nur intern erreichbar) und davor **Caddy**, das automatisch ein
Zertifikat von [Let's Encrypt](https://letsencrypt.org/getting-started/) holt und erneuert.
Ohne eigene Domain bekommt direkt die Server-IP ein Zertifikat (Let's-Encrypt-Profil
`shortlived`, ca. 6 Tage gültig, Caddy erneuert selbstständig). Standard-Adresse:
`https://SERVER-IP:3010`. Datenbank und Fotos liegen in `data/`, Zertifikate in `caddy/`.

Auf dem Server müssen **Port 80** (Zertifikatsprüfung) und **Port 3010** (HTTPS) erreichbar sein.

### Mit `manage.ps1` (Windows)

1. `.deploy.env.example` nach `.deploy.env` kopieren und Server-IP eintragen.
2. `.\manage.ps1` starten, **[9] Erstinstallation** wählen. Das Skript installiert Docker,
   klont dieses Repo nach `/opt/bernersennen-stammbaum`, erzeugt eine `.env` mit zufälligem
   `JWT_SECRET` und Einladungscode und startet alles.
3. Später: **[3] Deploy** holt den neuesten Stand von GitHub und baut neu.

Weitere Menüpunkte: Status, Logs, Backup herunterladen, Einladungscode anzeigen,
Demo-Rudel einspielen, alle Daten löschen (mit automatischem Backup vorher).

Ein einzelnes Rudel löschen (auf dem Server im App-Ordner):
`docker compose exec chronik node scripts/delete-family.js "Name des Rudels" --yes`

### Manuell

```bash
git clone https://github.com/bavid/bernersennen-stammbaum.git && cd bernersennen-stammbaum
cp .env.example .env   # JWT_SECRET und PUBLIC_HOST setzen!
mkdir -p data && sudo chown 1000:1000 data
docker compose up -d --build
```

### Konfiguration (`.env`)

| Variable             | Bedeutung                                                              |
| -------------------- | ---------------------------------------------------------------------- |
| `JWT_SECRET`         | **Pflicht.** Zufälliges Secret für Session-Cookies                     |
| `PUBLIC_HOST`        | **Pflicht.** Server-IP oder Domain, für die das Zertifikat ausgestellt wird |
| `HTTPS_PORT`         | Port für HTTPS nach außen (Standard 3010)                               |
| `FAMILY_INVITE_CODE` | Code zum Anlegen neuer Rudel (leer = jeder darf anlegen)               |
| `COOKIE_SECURE`      | `true` – Cookies nur über HTTPS                                        |
| `TRUST_PROXY`        | `1` – App steht hinter Caddy, Rate-Limit sieht echte IPs               |

Mit Domain: `PUBLIC_HOST=chronik.example.de` setzen – das Zertifikat gilt dann für die Domain.

## Sicherheit

- HTTPS mit Let's-Encrypt-Zertifikat (Caddy), Cookies nur über HTTPS
- Strikte Trennung der Rudel: fremde Hunde sind per geänderter URL nicht abrufbar (404),
  Fotos nur mit Login
- Passwörter mit bcrypt gehasht, Session als httpOnly-Cookie (JWT, 30 Tage)
- Rate-Limit auf Login und Rudel-Anlage
- Uploads nur als JPG/PNG/WebP/GIF, Dateiname und Endung vergibt der Server
- Security-Header (CSP, nosniff, frame-ancestors) per helmet

## Projektstruktur

```
client/          React-Oberfläche (Vite)
  src/lib/       reine Logik: Stammbaum-Layout, Timeline, Datumsformat (mit Tests)
server/          Express-API + SQLite
  routes/        auth, dogs, timeline, breeding, uploads
  seed/          Demo-Daten und Testbilder
  scripts/       seed.js, reset.js
deploy/remote.sh Server-Befehle (setup, deploy, backup, seed, wipe …)
deploy/Caddyfile HTTPS-Proxy mit Let's Encrypt
manage.ps1       Windows-Menü für den Server
```
