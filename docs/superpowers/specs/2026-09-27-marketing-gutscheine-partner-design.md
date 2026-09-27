# Marketing: Gutscheine, Partner, Umkreissuche, „Entdecken" — Design-Konzept

Datum: 2026-09-27
Status: **Entwurf zur Diskussion** — noch kein Code. Umgesetzt wird phasenweise, jede Phase erst nach Freigabe.

## Ziel

Die Familienchronik soll über **Mundpropaganda** wachsen. Dafür gibt es **Einmal-Gutscheine**, die man auf der
Seite einlöst. Verteilt werden sie über **Tierheime, Vermittlungsstellen und Hundeschulen**, gedruckt als Karten
mit QR-Code. **Nie über Züchter.**

Partner bekommen eigene Portalseiten. Nutzer finden Partner in ihrer Nähe, über PLZ oder freigegebenen Standort.
Ein neuer Reiter zeigt gekennzeichnete Werbung und Empfehlungen, etwa „Hundeschule gesucht?", „Neuer Begleiter
gesucht?" und Futter, das Hundetrainer empfehlen, außerdem Spendenmöglichkeiten.

Finanziert wird das Ganze **rein über GoFundMe**. Es gibt keine Zahlungen in der App. Die Spenden decken die
Betriebskosten, der Rest geht nachvollziehbar an Tierheime.

Für Präsentationen bei Partnern steht jederzeit eine **Admin-Präsentationsansicht** bereit.

**Tierheime nutzen die App auch selbst:** Sie legen Chroniken für ihre Tiere an, sammeln Neuigkeiten und machen
damit Werbung für die Vermittlung. Wird ein Tier vermittelt, zieht seine Chronik mit ins neue Zuhause, und zwar
über einen Gutschein. Jede Vermittlung bringt so ein neues Rudel (siehe Phase T).

## Ideensammlung (Ausgangspunkt, sinngemäß)

- Marketing über Einmal-Gutscheine, verteilt an Tierheime, Hundeschulen usw.
- Partnerschaften mit Tierheimen und Hundeschulen. Dafür kundenspezifische Werbung und eigene Portale, etwa eins
  für „Tierheim 1" und eins für eine Hundeschule. Dazu eine Partnerübersicht bzw. Tierheime in der Nähe.
  Die PLZ bei der Anmeldung ist optional, ohne PLZ bekommt man alles vorgeschlagen.
- Finanzierung über GoFundMe, sonst nichts. Ein eigener Reiter für „Werbung" bzw. Spendenadressen.
- „Hundeschule gesucht? Hier klicken" führt zu den Partnern. „Neuer Begleiter gesucht?" führt zu Tierheimen.
  **Nie auf Züchter verlinken, nur auf Vermittlungsstellen.**
- Werbung für Hundefutter, möglichst was Hundetrainer wirklich empfehlen.
- Ein Web-Crawler als API. Es gibt 2 konkrete Beispiele.
- Standort freigeben und im Umkreis suchen, über einen Kartendienst. Die Webseiten der Treffer werden geprüft.
- Der Gutschein ist „PIN und PUK" in einem. E-Mail ist optional. Wer ein eigenes Passwort will, braucht einen
  Benutzernamen.
- Alles lokal und getrennt. Die Testumgebung muss leicht durchklickbar sein, aber nur lokal. Deployt wird erst,
  wenn der Deploy-Prozess eindeutig ist, und zuerst unter einer **anderen URL**. Danach erst Prod.
  Eine eigene Domain wird gekauft.
- *(Zusatz)* Tierheime können die App nutzen, um Chroniken für ihre Hunde aufzubauen, Änderungen zu sammeln und
  Werbung zu machen.

## Ausgangslage im Code (Stand `1f7b91c`)

- **Ein Rudel hat ein gemeinsames Passwort.** Beim Login wird es per bcrypt gegen **alle** Rudel geprüft
  (`server/routes/auth.js:32-38`). Das kostet bei vielen Rudeln Zeit. Außerdem müssen Passwörter eindeutig sein,
  deshalb meldet die Registrierung „Passwort belegt" (`auth.js:56-61`). Damit verrät sie, dass ein anderes Rudel
  dieses Passwort benutzt.
- **Registrierung** läuft über `POST /api/families` mit einem globalen `FAMILY_INVITE_CODE` (`server/config.js:38`)
  und dem Freitextfeld `quelle` („Wie hast du von uns erfahren?").
- **Session:** ein JWT `{familyId}` im Cookie, gültig 30 Tage (`server/middleware/auth.js`). Die Demo ist
  schreibgeschützt (`is_demo`), der Admin hat einen eigenen Login (`server/routes/admin.js`).
- **Nicht vorhanden:** Partner, Geodaten, externe Dienste, Staging. Die CSP erlaubt nur `'self'`
  (`server/app.js:25-44`).
- **Deploy:** eine Docker-Compose-Instanz auf einem Ubuntu-Server hinter einem gemeinsamen Caddy
  (`deploy/remote.sh`, `manage.ps1`). Containername und Image-Tag sind fest verdrahtet (`docker-compose.yml`).

## Entscheidungen

| Thema | Entscheidung |
|---|---|
| Login | **Gutschein = Rudel-Schlüssel.** Der eingelöste Code ist ab dann Login (PIN) und Wiederherstellung (PUK). Ein eigenes Passwort gibt es nur zusammen mit einem Benutzernamen. E-Mail ist immer optional. Alte Rudel-Passwörter funktionieren weiter. |
| Registrierung | **Nur noch mit Gutschein.** Das ersetzt `FAMILY_INVITE_CODE`. Jedes Rudel bekommt ein paar Gutscheine zum Weitergeben, Partner bekommen eigene Kontingente. Woher ein Rudel kam, wird automatisch erfasst statt über das Freitextfeld `quelle`. |
| GoFundMe | Die Spenden gehen an den Betreiber: erst die Kosten decken, der Rest geht an Tierheime. Ein Transparenzblock zeigt Eingang, Kosten und Weitergabe. Partner erscheinen im Umkreis, alternativ gibt es immer die Liste „Alle Partner". Bei Bedarf bekommen sie eine eigene Seite mit Werbung. |
| Kartendienst | **Erst nur OpenStreetMap** (Overpass-API, Lizenz ODbL, Speichern mit Quellenangabe erlaubt). Google Places kommt später höchstens als optionaler Zusatz dazu. Die Treffer werden dann bei jeder Suche neu geholt und nie gespeichert (siehe unten). |
| Ergebnisanzeige | **Liste mit Entfernung.** Pro Eintrag gibt es einen Link „In Google Maps öffnen" (einfacher Maps-Link, kein API-Schlüssel, keine Kosten), alternativ einen OpenStreetMap-Link bzw. die Koordinaten. Keine eingebettete Karte, deshalb bleibt die CSP bei `'self'`. |
| „Neuer Begleiter gesucht?" | Zeigt **nur Partner und vom Admin geprüfte Einträge.** Automatisch Gefundenes landet zuerst in der Prüfliste. |
| Crawler | Quellen: Tierheim-Verzeichnis, Vermittlungstiere, Hundeschulen, Futter-Empfehlungen. Die 2 konkreten Beispiel-URLs fehlen noch. |
| Umgebungen | Lokale Testumgebung → Staging unter eigener URL → Prod. Nach Prod geht genau der Stand (SHA), der auf Staging getestet wurde. |

### Warum erst mal kein Google?

Die Google Places API erlaubt eine Live-Suche im Umkreis, aber mit Einschränkungen:

- Dauerhaft speichern darf man nur die `place_id`. Koordinaten dürfen höchstens 30 Tage im Zwischenspeicher liegen.
- Die Anzeige braucht das Google-Logo bzw. die Google-Quellenangabe. Auf einer Nicht-Google-Karte dürfen die
  Daten nicht erscheinen.
- Aus Google-Daten darf deshalb **kein eigenes Verzeichnis** entstehen. Sie dürfen auch nicht durch unsere
  Webseiten-Prüfung laufen.
- Es braucht ein Google-Konto mit Zahlungsdaten. Oberhalb des Freikontingents wird pro Anfrage abgerechnet, und
  Felder wie Webseite oder Telefonnummer kosten mehr.

OpenStreetMap ist kostenlos und braucht keinen Schlüssel. Die Daten dürfen wir mit Quellenangabe speichern und
weiterverarbeiten. Die passenden Einträge gibt es dort schon: `amenity=animal_shelter` für Tierheime,
`amenity=animal_training` + `animal_training=dog` für Hundeschulen. Viele davon haben ein Feld `website`, das
unser Crawler prüfen kann.

Ein **Link** „In Google Maps öffnen" (`https://www.google.com/maps/search/?api=1&query=LAT,LON`) ist dagegen
unproblematisch. Das ist ein normaler Link und keine API-Nutzung.

---

## Phase 0 — Umgebungen (lokal → Staging → Prod)

### Lokale Testumgebung

- Gestartet wird sie mit `npm run dev:test` (zusätzlich `start-test.bat` für Windows). Das startet
  `scripts/testenv.js`, ein Node-Skript, damit es auch unter Windows läuft. Es setzt:
  - `DATA_DIR=server/.testenv`, also eine eigene Datenbank und eigene Fotos (Ordner in `.gitignore`)
  - `DEV_TOOLS=1`, `APP_ENV=dev`, `CODE_PEPPER=dev`
  - einen Test-Admin (`admin` / `test-admin`)
- `npm run testenv:seed` bzw. `testenv:reset` rufen `server/scripts/testenv-seed.js` auf. Das Skript nutzt
  `createDemoPack` und `createImageCopier` aus `server/lib/demoPack.js`. Dazu kommen fiktive Partner: ein Tierheim,
  eine Vermittlungsstelle, 2 Hundeschulen und ein Futteranbieter. Außerdem Portale, Anzeigen und 2 Gutschein-Stapel.
  Das Skript gibt die Codes und Portal-URLs direkt aus.
- **Dev-Panel** zum Durchklicken:
  - Server: `server/dev/routes.js` (`/api/dev/*`: Codes auflisten, als Rudel X einloggen, zurücksetzen).
    `app.js` lädt die Datei nur, wenn `!isProduction && DEV_TOOLS` gilt. `.dockerignore` schließt `server/dev`
    aus dem Image aus.
  - Client: `client/src/dev/DevPanel.jsx`, nur hinter `import.meta.env.DEV`. Vite entfernt es aus dem
    Prod-Build.

### Staging als zweite Compose-Instanz

- `docker-compose.yml` wird parametrisiert:
  - `container_name: ${CONTAINER_NAME:-bernersennen-stammbaum}`
  - `image: bernersennen-stammbaum:${IMAGE_TAG:-latest}`
  - `COMPOSE_PROJECT_NAME` in der `.env` jeder Instanz
- Heute sind Containername und Image-Tag fest verdrahtet. Staging würde sonst das Prod-Image überschreiben.
  `remote.sh admin` startet ohne `--build`, dann liefe in Prod womöglich das Image, das Staging gebaut hat.
- `deploy/remote.sh`:
  - `ensure_env` setzt zusätzlich `APP_ENV`, `COMPOSE_PROJECT_NAME`, `CONTAINER_NAME`, `IMAGE_TAG` und
    `CODE_PEPPER`.
  - Neue Variable `REVISION`: deployt ein exaktes Commit-SHA statt „neuester Stand".
  - Vor jedem `deploy` läuft ein Backup, denn Migrationen lassen sich nicht zurückdrehen.
  - `backup` sichert zusätzlich `.env`. Ohne `CODE_PEPPER` sind alle Codes wertlos.
  - Der Befehl `invite` entfällt.
- `manage.ps1` bekommt einen Schalter `-Target staging|prod`. Er liest `.deploy.staging.env` bzw. `.deploy.env`
  und zeigt das Ziel farbig im Kopf an. Neue Aktion **„Staging → Prod übernehmen"**: Sie deployt Prod mit
  `REVISION=<SHA von Staging>`.
- Staging-Werte:
  - Verzeichnis `/opt/bernersennen-stammbaum-staging`, Branch `staging`, Port 3011
  - Adresse `staging.<domain>` mit Basic-Auth. Der Caddy-Eintrag gehört ins Proxy-Repo „server".
  - `X-Robots-Tag: noindex`
  - **nur Seed-Daten, nie eine Kopie der Prod-Daten**
- `APP_ENV` wird über `/api/config` ausgeliefert. Der Client zeigt auf Staging und lokal ein Band „Testsystem".

**Ablauf:** Feature-Branch → lokale Testumgebung → Branch `staging` → durchklicken → dasselbe SHA nach `main`/Prod.

**Fertig, wenn:**
- beide Instanzen parallel laufen, mit getrennten Daten;
- der Prod-Build nachweislich keinen Dev-Code enthält (Build-Check);
- „übernehmen" genau das getestete SHA deployt.

---

## Phase 1 — Gutscheine und neuer Login

### Schema (`server/db.js`, per `CREATE TABLE IF NOT EXISTS` bzw. `addColumnIfMissing`)

```
partners(...)          -- schon hier anlegen, weil Gutscheine darauf verweisen (Spalten siehe Phase 2)
voucher_batches(id, label, kind CHECK IN ('partner','rudel','admin','demo'), partner_id, size, created_at)
vouchers(id, batch_id, code_hash TEXT UNIQUE NOT NULL, code_cipher, code_hint, partner_id,
         issued_by_family_id, redeemed_by_family_id, redeemed_at, expires_at, revoked_at, created_at)
users(id, family_id, username TEXT COLLATE NOCASE UNIQUE NOT NULL, password_hash, email,
      session_epoch, last_login_at, created_at)
families += access_key_hash, legacy_password INT DEFAULT 1, auth_epoch INT DEFAULT 0, plz, voucher_id
CREATE UNIQUE INDEX idx_families_access_key ON families(access_key_hash) WHERE access_key_hash IS NOT NULL
```

- SQLite kann per `ALTER TABLE` keine UNIQUE-Spalte ergänzen. Deshalb gibt es einen partiellen Unique-Index.
- `families.password_hash` ist `NOT NULL`. Neue Rudel bekommen `password_hash='!'` und `legacy_password=0`. Dieser
  Wert kann nie passen, weil bcrypt nur 60 Zeichen lange Hashes akzeptiert. Bestehende Rudel behalten
  `legacy_password=1`.

### Code-Format (`server/lib/codes.js`)

- 12 Zeichen in Crockford-Base32 (ohne I, L, O, U) aus `crypto.randomInt`, also etwa 60 Bit.
  Angezeigt als `XXXX-XXXX-XXXX`.
- `normalizeCode` ist beim Eintippen nachsichtig: Großschreibung, Leerzeichen und Bindestriche werden entfernt,
  O wird zu 0, I und L werden zu 1.
- Abgleich über **HMAC-SHA256 mit `CODE_PEPPER`** in einer indizierten Spalte, statt einer bcrypt-Schleife.
  Das geht, weil die Codes zufällig und lang sind.
- Noch nicht eingelöste Codes liegen zusätzlich verschlüsselt vor (AES-GCM, Schlüssel aus dem Pepper abgeleitet).
  So kann ein Rudel seine Weitergabe-Codes erneut anzeigen und der Admin Karten nachdrucken. Nach dem Einlösen
  wird diese Kopie gelöscht.
- `CODE_PEPPER` ist in Produktion Pflicht, genau wie `JWT_SECRET`.

### API

| Endpunkt | Zweck |
|---|---|
| `POST /api/vouchers/check {code}` | Status des Codes plus Partner-Branding. Bewusst POST, damit der Code nicht im Log landet. |
| `POST /api/vouchers/redeem {code, name, plz?, username?, password?, email?, website}` | Einlösen in einer Transaktion (Details unten) |
| `GET /api/vouchers/mine` | Eigene Weitergabe-Gutscheine. Ersetzt `GET /api/invite`. Die Demo bekommt feste Schein-Codes. |
| `POST /api/login {secret}` | Sieht die Eingabe wie ein Code aus, wird direkt über den Hash gesucht. Sonst läuft die bcrypt-Schleife, aber nur über Rudel mit `legacy_password=1`; diese Menge wächst nicht mehr. Ist der Code ein noch nicht eingelöster Gutschein, antwortet der Server `409 {redeem:true}` und der Client wechselt zum Einlöse-Formular. |
| `POST /api/login {username, password}` | Login mit Benutzername und eigenem Passwort |
| `POST /api/recover {code, username, newPassword}` | Code als PUK: Passwort zurücksetzen, alte Sessions des Users enden |
| `POST /api/family/key` | Rudel-Schlüssel erzeugen oder erneuern. Er wird einmal angezeigt, alle Sessions enden. Das ist auch der Umstiegsweg für alte Rudel: Nach einem Login mit altem Passwort erscheint ein Hinweis, danach lässt sich das alte Passwort abschalten. |
| `POST /api/users` | Ein Rudel legt Benutzername, Passwort und E-Mail (optional) an |

Einlösen (`POST /api/vouchers/redeem`) in einer Transaktion:

1. `UPDATE vouchers … WHERE redeemed_at IS NULL`. Nur wenn dabei genau eine Zeile geändert wird, geht es weiter.
   Das schützt davor, einen Code doppelt einzulösen.
2. Das Rudel wird angelegt, mit dem Code als Schlüssel.
3. Ein User wird angelegt, falls Benutzername und Passwort mitkommen.
4. Das Rudel bekommt eigene Weitergabe-Gutscheine (`RUDEL_VOUCHER_QUOTA`, Standard 3).
5. Die Session startet über `setSessionCookie`.

- **Session:** Das JWT wird zu `{familyId, userId?, e}`. `requireAuth` lädt das Rudel ohnehin bei jeder Anfrage,
  die Prüfung der Epoche kostet also nichts extra.
- **Entfällt:**
  - `POST /api/families`
  - `FAMILY_INVITE_CODE` in `config.js`, `.env.example`, `remote.sh`, `manage.ps1`, `AdminPage` und `admin.js`
  - das doppelte `safeEqual` in `routes/auth.js`
  - die Meldung „Passwort belegt"
  - das Freitextfeld `quelle`. Die Spalte bleibt für Altdaten.
- **Missbrauchsschutz:**
  - `authLimiter` wandert nach `server/middleware/abuse.js`.
  - Neuer `codeLimiter` pro IP für check, redeem, recover und login.
  - Ein globaler Zähler für Fehlversuche mit Codes.
  - `rejectHoneypot` beim Einlösen.

### Client

- `LoginPage.jsx`:
  - ein Feld „Rudel-Schlüssel oder Passwort"
  - ein Link „Mit Benutzername anmelden"
  - „Schlüssel vergessen?" öffnet die Wiederherstellung per PUK
  - der Modus „Neues Rudel" wird zu **„Gutschein einlösen"**, mit Rudelname, optional PLZ, Benutzer und E-Mail
- Öffentliche Route **`/v#CODE`** als Ziel der QR-Codes:
  - Der Code steht hinter `#`. So landet er nie in Server-Logs oder im Referer.
  - Die Seite entfernt ihn per `history.replaceState` aus der Adresszeile.
  - Wer schon eingeloggt ist, bekommt „Abmelden und einlösen" angeboten.
- `InviteDialog.jsx` zeigt die eigenen Gutscheine: kopieren, teilen, Status eingelöst oder offen.
- In den Rudel-Einstellungen: Schlüssel erneuern, Benutzer verwalten, PLZ.
- `App.jsx` bekommt einen frühen Zweig für öffentliche Routen (`/v`, `/p/:slug`, `/partner`, `/impressum`,
  `/datenschutz`), analog zu `/admin` (`App.jsx:113`).

### Tests

- `createFamily()` in `server/test/helpers.js` wird von 15 Testdateien genutzt. Der Helper erzeugt künftig einen
  Gutschein über `lib/vouchers` und löst ihn ein. So bleiben alle bestehenden Tests lauffähig.
- Die Einladungscode-Tests in `security.test.js` werden umgeschrieben.
- Neu ist `vouchers.test.js` mit diesen Fällen:
  - Format und Normalisierung
  - nur einmal einlösbar, auch bei gleichzeitigen Anfragen
  - abgelaufen oder widerrufen
  - PUK-Wiederherstellung
  - Sessions enden nach Schlüsselwechsel
  - alte Passwörter funktionieren weiter
  - die Demo kann weder einlösen noch Gutscheine ausgeben
- `deleteFamily` in `server/lib/families.js` wird erweitert. Wegen `foreign_keys=ON` muss es zusätzlich `users`
  löschen und nicht eingelöste Gutscheine des Rudels entfernen. Bei den übrigen Gutscheinen wird der Rudel-Bezug
  auf NULL gesetzt, damit die Statistik erhalten bleibt.

### Risiken

- **Geht `CODE_PEPPER` verloren, sind alle Codes wertlos.** Deshalb kommt `.env` ins Backup.
- Wer eine Karte ausgibt, zum Beispiel ein Tierheim, kennt deren Code. Nach dem Einlösen empfiehlt die App daher,
  den Schlüssel zu erneuern (siehe offene Fragen).
- Bei der Registrierung lässt sich ausprobieren, ob ein Benutzername schon vergeben ist. Dagegen hilft das
  Rate-Limit.

**Fertig, wenn:**
- man sich nur noch mit Gutschein registrieren kann;
- der Code als Login und als PUK funktioniert;
- alte Passwörter weiter funktionieren;
- die Meldung „Passwort belegt" verschwunden ist.

---

## Phase 2 — Partner, Portale, Umkreissuche

### Tabelle `partners`

```
partners(id, slug UNIQUE, name,
  typ CHECK IN ('tierheim','vermittlung','hundeschule','futter','sonstige'),
  ist_partner INT,          -- 1 = Partnerschaft mit Portal, 0 = reiner Verzeichniseintrag
  status CHECK IN ('entwurf','aktiv','pausiert'),
  plz, ort, lat, lon, website, spenden_url, vermittlung_url, kontakt_json,
  logo_file, portal_titel, portal_text, farbe,
  quelle CHECK IN ('manuell','osm','sitecheck'), osm_ref, is_demo, created_at)
```

- Die Tabelle kennt **keinen Typ „Züchter"**. Das ist technisch ausgeschlossen.
- `server/lib/breederGuard.js` prüft jeden Schreibvorgang und jeden Import auf Züchter-Begriffe, etwa Zucht,
  Züchter, Zwinger, Deckrüde, „Welpen abzugeben" und Kennel.

### Standort

- **PLZ-Daten:** `server/geo/plz-de.json`, einmalig erzeugt von `server/scripts/build-plz.js` aus GeoNames
  (CC BY 4.0). Das Verzeichnis `server/data/` steht in `.gitignore`, deshalb liegt die Datei unter `server/geo/`.
- **Berechnung:** `server/lib/geo.js` wandelt PLZ in Koordinaten um, berechnet Entfernungen (Haversine) und rundet.
- **Auswahl im Client:** `client/src/components/LocationPicker.jsx` bietet ein **PLZ-Feld** oder den Knopf
  **„Standort verwenden"**.
  - Der Standort kommt über `navigator.geolocation`, erst nach Klick. Das funktioniert nur über HTTPS oder
    localhost, also nicht über `http://IP:PORT`.
  - Die Koordinaten werden im Browser und nochmals auf dem Server auf 0,01° gerundet, das sind etwa 1 km.
  - Sie gehen im POST-Body an den Server, nicht in der URL, und werden **nie gespeichert oder geloggt**.
  - Der Radius ist wählbar: 5, 10, 25, 50 oder 100 km.
  - Am Rudel gespeichert wird höchstens die PLZ, und nur wenn der Nutzer das will.

### Suche (`server/lib/places/`)

- **`index.js`:**
  - führt die eigene `partners`-Tabelle und die Anbieter zusammen;
  - entfernt Dubletten (gleiche OSM-ID, oder gleicher Name im Umkreis von 150 m);
  - wendet `breederGuard` an;
  - sortiert nach Entfernung, echte Partner zuerst mit Badge „Partner".
- **`providers/overpass.js`** ist die Hauptquelle, OpenStreetMap unter ODbL:

  ```
  nwr["amenity"="animal_shelter"](around:R,LAT,LON);
  nwr["amenity"="animal_training"]["animal_training"~"dog"](around:R,LAT,LON);
  out center tags;
  ```

  Ausgelesen werden Name, Webseite, Telefon, E-Mail, Adresse und die Vermittlungs-Tags. Einträge mit
  Zucht-Tags (`animal_breeding`) werden verworfen.
- **`providers/google.js`** ist nur vorbereitet und aus. Aktiv würde er erst mit `GOOGLE_PLACES_API_KEY`: nur
  Live-Abfragen, nur Minimalfelder, nie im Cache.
- **`cache.js`** speichert OSM-Ergebnisse in der SQLite-Tabelle `places_cache`, 7 Tage lang. Schlüssel sind die
  Art, das auf 0,05° gerundete Zentrum und der Radius.
- **`server/lib/http.js`** ist der einzige Weg nach außen:
  - eigener User-Agent `FamilienchronikBot/1.0 (+https://<domain>/bot)`
  - Timeout und 1 MB Größenlimit
  - nur http(s)
  - keine privaten oder Loopback-Adressen, auch nicht nach Weiterleitungen (SSRF-Schutz)
  - Host-Allowlist für die Anbieter
- **Limits:** `placesLimiter` pro IP, eine Tagesobergrenze für Anfragen an die Anbieter, und für Google später ein
  Monatszähler als Kostenbremse.

### Endpunkte

| Endpunkt | Zweck |
|---|---|
| `GET /api/public/partners?plz=&radius=` | Aktive Partner. Ohne PLZ kommen **alle** Partner. |
| `GET /api/public/partners/:slug` | Portal eines Partners. Mit Admin-Cookie auch als Vorschau für Entwürfe. |
| `POST /api/places/search` | Umkreissuche. Braucht eine Rudel- oder Admin-Session. Die neue Middleware `requireSession` lässt auch die Demo lesen, denn `requireAuth` blockt dort jedes Nicht-GET. |
| `/partner-media/` | Öffentliche Partner-Logos (`DATA_DIR/partner-media`). `/uploads` verlangt einen Login. |

### Client

- `PartnerPortalPage.jsx` unter `/p/:slug` zeigt:
  - Branding (Logo, Akzentfarbe) und Begrüßung („Willkommen von Tierheim X")
  - Gutschein einlösen direkt auf der Seite
  - Knopf „Demo ansehen"
  - eigene Anzeigen des Partners
  - Spendenlink
- `PartnersPage.jsx` (`/partner`) ist die Übersicht aller Partner, wahlweise nach Entfernung gefiltert.
- Ergebnisliste: Name, Typ, Entfernung, Badge „Partner" bzw. „geprüft". Links:
  - **„In Google Maps öffnen"** (`https://www.google.com/maps/search/?api=1&query=LAT,LON`)
  - **„OpenStreetMap"** (`https://www.openstreetmap.org/?mlat=LAT&mlon=LON#map=16/LAT/LON`)
  - wahlweise die Koordinaten zum Kopieren
- Keine eingebettete Karte, die CSP bleibt `'self'`. Eine Karte lässt sich später nachrüsten: Leaflet über npm,
  `img-src` um die Kachel-Server ergänzen, `referrerPolicy` für die Kacheln setzen.

### Demo

- Fiktive Demo-Partner mit `is_demo=1`, zum Beispiel „Tierheim Sonnenhang" und „Hundeschule Pfotenglück".
- Suchen aus der Demo liefern feste Ergebnisse und fragen nie einen echten Anbieter.

**Fertig, wenn:**
- ein Portal ohne Login funktioniert;
- eine Einlösung über ein Portal dem Partner zugeordnet wird;
- PLZ oder Standort Ergebnisse nach Entfernung sortiert liefern;
- ohne Standort „Alle Partner" erscheint;
- der Browser nur mit dem eigenen Server spricht.

---

## Phase T — Tierheim-Chroniken (Zusatz)

**Idee:** Tierheime nutzen die App selbst. Sie bauen für jedes Tier eine Chronik auf, sammeln Neuigkeiten und
machen damit Werbung für die Vermittlung. Die Chronik zieht mit dem Tier ins neue Zuhause um. Für uns ist das der
stärkste Grund, warum ein Tierheim Partner wird, und gleichzeitig der natürlichste Weg, Gutscheine zu verteilen:
**jede Vermittlung bringt ein neues Rudel.**

### Ablauf

1. **Tierheim-Konto:** Der Admin legt beim Partner-Onboarding ein Rudel der Art `tierheim` an, verknüpft mit dem
   Partner. Mitarbeitende und Ehrenamtliche bekommen je einen Benutzer (Tabelle `users` aus Phase 1). So sieht man,
   wer welchen Eintrag geschrieben hat.
2. **Chronik im Tierheim:** Für jedes Tier gibt es eine Chronik mit Ankunft, Tierarzt, Verhalten, Training,
   Gassi-Berichten und Fotos. Das nutzt die bestehende Timeline (`timeline_entries`) und die Tierart (`dogs.tierart`),
   also auch für Katzen und andere Tiere. Neu ist eine optionale Kategorie pro Eintrag, damit sich Änderungen
   filtern lassen, zum Beispiel „alle Tierarzt-Einträge".
3. **Werbung für das Tier:**
   - Ein Tier in Vermittlung bekommt einen öffentlichen **Steckbrief** unter `/t/:slug`. Er zeigt ausgewählte
     Fotos und Einträge, die als öffentlich markiert sind, und einen Kontakt-Knopf, der zum Tierheim führt. Die
     Vermittlung selbst läuft nie über die App.
   - Diese Steckbriefe erscheinen im Partnerportal (`/p/:slug`) und unter **„Neuer Begleiter gesucht?"**. Weil die
     Daten direkt vom Tierheim kommen, entfällt dafür weitgehend der Crawler für Vermittlungstiere.
   - Teilen: ein Link für Social Media und die eigene Webseite des Tierheims, dazu ein druckbarer Steckbrief als
     Aushang. Der nutzt den bestehenden Collage-Generator (`client/src/pages/CollagePage.jsx`, `PrintSheet`).
4. **Übergabe bei Vermittlung:**
   - Das Tierheim klickt „Vermittelt" und bekommt einen **Übergabe-Gutschein** für genau dieses Tier.
   - Die neuen Halter lösen ihn ein. Sie legen damit ein neues Rudel an oder hängen das Tier an ihr bestehendes
     Rudel. Das Tier zieht samt Chronik um.
   - Die Einträge des Tierheims behalten ihre Herkunft („Tierheim X, 12.03.2026").
5. **Neuigkeiten nach der Vermittlung:**
   - Die neuen Halter können freiwillig einstellen, dass **„das Tierheim mitlesen darf"**. Das lässt sich jederzeit
     widerrufen.
   - Das Tierheim sieht dann neue Einträge seiner vermittelten Tiere in einer Übersicht („Wie geht's unseren
     Ehemaligen?"). Das ersetzt nebenbei manche Nachkontrolle.
   - Mit einer zusätzlichen, eigenen Einwilligung darf das Tierheim einzelne Einträge als **Happy-End-Geschichte**
     öffentlich zeigen, als Werbung für das Tierheim.

### Datenmodell (Skizze)

```
families        += art CHECK IN ('rudel','tierheim') DEFAULT 'rudel', partner_id
dogs            += vermittlung_status CHECK IN ('in_vermittlung','reserviert','vermittelt') NULL,
                   public_slug UNIQUE (partieller Index), herkunft_family_id
timeline_entries += kategorie NULL, is_public INT DEFAULT 0, herkunft_family_id
dog_transfers(id, dog_id, from_family_id, to_family_id, voucher_id, transferred_at)
dog_shares(dog_id, family_id, since, story_consent INT DEFAULT 0, revoked_at)   -- „Tierheim darf mitlesen"
voucher_batches.kind += 'uebergabe'; vouchers += dog_id NULL
```

- **Umzug:** `dogs.family_id` und die `family_id` der Timeline-Einträge des Tiers wechseln zum neuen Rudel.
  `herkunft_family_id` hält fest, wer den Eintrag geschrieben hat. Das geschieht in einer Transaktion zusammen mit
  dem Einlösen.
- **Andere Tiere:** Verbindungen zu anderen Tieren (`dog_links`, Eltern-Verweise) bleiben beim Tierheim und werden
  beim Umzug gelöst. Heute ist alles strikt pro Rudel getrennt (`loadOwnDog` in `server/routes/dogs.js`).
- **Mitlesen:** Das ist der **erste lesende Zugriff über Rudel-Grenzen hinweg**. Er wird bewusst eng gehalten:
  - eigene Endpunkte, zum Beispiel `GET /api/shelter/ehemalige`
  - nur lesend
  - nur für Tiere mit aktivem `dog_shares`
  - Die bestehenden Routen bleiben unverändert streng.
- **Öffentliche Steckbriefe:** Sie brauchen öffentliche Fotos. Heute verlangt `/uploads` einen Login. Die App
  liefert deshalb nur Fotos aus, die an einem öffentlichen Eintrag hängen, über eine eigene Route (zum Beispiel
  `/public-media/:id`) und nie das ganze Verzeichnis.

### Recht und Datenschutz

- Für die Inhalte der Steckbriefe ist das Tierheim verantwortlich: Bildrechte und korrekte Angaben. Das regelt eine
  kurze Nutzungsvereinbarung für Partner.
- Mitlesen und Happy-End-Geschichten brauchen je eine eigene, widerrufbare Einwilligung der neuen Halter
  (DSGVO Art. 6 Abs. 1 lit. a).
- Personenbezogene Daten der Halter erscheinen nie öffentlich, nur Tiername und Einträge, die sie freigegeben haben.
- Steckbriefe sind in der Standardeinstellung `noindex`. Das Tierheim entscheidet, ob Suchmaschinen sie finden
  dürfen.

### Demo und Präsentation

- Ein Demo-Tierheim „Tierheim Sonnenhang" mit 3–4 Tieren in Vermittlung, einem vermittelten Tier samt
  Happy-End-Geschichte und einem Übergabe-Gutschein in der Testumgebung.
- Der Präsentationsmodus (Phase 5) kann „als Tierheim X" vorführen. Das ist das Kernstück der Partner-Präsentation.

**Fertig, wenn:**
- ein Tierheim Tiere mit Chronik pflegen und einen öffentlichen Steckbrief freischalten kann;
- ein Übergabe-Gutschein das Tier samt Chronik in ein neues oder bestehendes Rudel umziehen lässt;
- das Tierheim Neuigkeiten nur mit Einwilligung sieht und diese Einwilligung widerrufbar ist.

---

## Phase 3 — Reiter „Entdecken"

- **Navigation:** neuer Eintrag `/entdecken` in `NAV_ITEMS` (`client/src/App.jsx:19`) mit Kompass-Icon in
  `client/src/components/Icon.jsx`. Das ergibt 5 Einträge, die mobile Leiste unten muss geprüft werden
  (`client/src/styles/layout.css` ~153).
- **`DiscoverPage.jsx` hat vier Abschnitte:**
  1. **„Hundeschule gesucht? Hier klicken"**: Partner-Hundeschulen im Umkreis, sonst alle.
  2. **„Neuer Begleiter gesucht?"**: nur `tierheim` und `vermittlung`, nur Partner und vom Admin geprüfte
     Einträge. **Nie Züchter.** Dazu die Steckbriefe von Tieren in Vermittlung aus Partner-Tierheimen im Umkreis
     (Phase T).
  3. **„Futter-Empfehlungen"**: was Hundetrainer empfehlen, mit „empfohlen von …" und je nach Geschäftsmodell
     als „Anzeige" gekennzeichnet.
  4. **„Unterstützen"**:
     - Link zur GoFundMe-Kampagne
     - Transparenzblock „Kosten gedeckt: X € · an Tierheime weitergegeben: Y €"
     - Spendenlinks der Partner-Tierheime
- **Schema:**

  ```
  promotions(id, partner_id, bereich, kennzeichnung CHECK IN ('Anzeige','Empfehlung','Partner'),
             empfohlen_von, titel, text, url, bild_file, aktiv, start, ende, sort, is_demo)
  link_clicks(target_type, target_id, tag, anzahl)
  donation_reports(id, zeitraum, eingang_cents, kosten_cents, weitergeleitet_cents, empfaenger, nachweis_url)
  settings(key, value)      -- z. B. gofundme_url
  ```

- **API:** `GET /api/discover` braucht einen Login, die Demo darf es auch.
- **Klickzählung über `GET /r/:id`:**
  - Die Route steht in `app.js` **vor** `serveClient`, weil dort ein Catch-all hängt. Dazu kommt ein Proxy-Eintrag
    in `vite.config.js`.
  - Sie erhöht einen Zähler pro Tag und leitet weiter.
  - Weitergeleitet wird **nur auf gespeicherte URLs**, es gibt also keine offene Weiterleitung.
  - Bots werden ignoriert.
  - Keine Cookies, keine IP-Adressen. Damit ist kein Consent-Banner nötig (TDDDG §25).
- **Kennzeichnung und Recht:**
  - Alles Bezahlte oder mit Provision wird als **„Anzeige"** gekennzeichnet (UWG §5a Abs. 4, DDG §6).
  - „Empfehlung von …" nur, wenn keine Gegenleistung fließt.
  - Anzeigen-Links bekommen `rel="sponsored noopener noreferrer"`.
  - Futtertexte ohne Gesundheitsversprechen (VO (EG) 767/2009).
  - GoFundMe ist ein reiner externer Link. Spendenquittungen gibt es nicht, weil es eine private Kampagne ist.
- **Demo-Daten:** `server/seed/demo-data.js` bekommt `PARTNERS`, `PROMOTIONS` und `DONATION_REPORT`. Laut
  Konvention muss jedes neue Feature in den Demo-Daten auftauchen. `replaceDemoPack` ersetzt diese Daten mit.

---

## Phase 4 — Import, Crawler und Website-Prüfung

### Quellen (`server/crawler/sources/*.js`)

- Jede Quelle ist ein Adapter, der eine Liste von Orten liefert.
- `osm.js` importiert regionenweise über Overpass, zum Beispiel ein ganzes Bundesland.
- Für die **2 konkreten Beispiel-URLs** des Nutzers gibt es Platzhalter-Adapter. Vor dem Bau werden jeweils
  robots.txt und AGB geprüft sowie das Datenbankherstellerrecht (§87b UrhG). Wenn möglich fragen wir zuerst beim
  Betreiber nach einem Export oder einer Erlaubnis.
- Abgedeckte Arten: Tierheim-Verzeichnis, Vermittlungstiere (**nur verlinken**, keine Fotos oder Texte
  übernehmen), Hundeschulen, Futter-Empfehlungen.
- Vermittlungstiere von **Partner**-Tierheimen kommen direkt aus deren Chroniken (Phase T). Der Crawler ergänzt nur
  Tierheime, die noch keine Partner sind, und verlinkt dort bloß.

### Tabellen

```
import_candidates(id, source, external_id, typ, name, plz, lat, lon, website, raw_json,
                  status CHECK IN ('neu','geprüft','übernommen','verworfen'), created_at,
                  UNIQUE (source, external_id))
site_checks(id, candidate_id, checked_at,
            verdict CHECK IN ('tierheim','hundeschule','zuechter_verdacht','unklar','nicht_erreichbar'),
            evidence_json, spenden_url, vermittlung_url, kontakt_json)
```

### Website-Prüfung (`server/crawler/siteCheck.js`)

Das ist das „Checken ihrer Seiten".

- **Warteschlange:** OSM-Orte mit Webseite, aus Importen und aus Live-Suchen.
- **Läuft nie in einer Nutzeranfrage.** Gestartet wird sie per `npm run sitecheck` oder als Worker im Prozess,
  und nur wenn `SITECHECK_ENABLED` gesetzt ist.
- **Höflich:**
  - robots.txt wird beachtet (Cache pro Host), eigener User-Agent
  - höchstens 2 Anfragen gleichzeitig, mindestens 3 s Abstand pro Host
  - höchstens 5 Seiten pro Website: Startseite sowie Seiten zu Spenden, Vermittlung, Tieren, Kontakt und Impressum
- **Einstufung:** Stichwort-Punkte plus schema.org-Daten. **Jedes Züchter-Signal sticht alles andere.**
- **Extrahiert** werden Spendenlink, Vermittlungsseite und Kontakt.
- **Gespeichert** werden nur Fakten, Links und kurze Belegstellen (höchstens 200 Zeichen). Keine Fotos, keine
  übernommenen Texte.

### Sichtbarkeit

- `zuechter_verdacht` blendet den Eintrag sofort überall aus.
- „Neuer Begleiter gesucht?" zeigt nur Partner und Einträge, die der Admin übernommen hat.
- Die allgemeine Umkreisliste darf OSM-Treffer mit dem Hinweis „ungeprüft" zeigen.

### Admin-Prüfliste

- Pro Eintrag: **Übernehmen** (wird als Verzeichniseintrag zu `partners`), **Verwerfen** oder **Erneut prüfen**.
- Google-Treffer kommen nie in diese Kette.

### Tests

Anbieter und Website-Prüfung bekommen ein injiziertes `fetch`. Tests gehen also nie ins Netz.

---

## Phase 5 — Admin und Präsentation

- **Reiter im `AdminPage`:** Übersicht, Gutscheine, Partner, Anzeigen, Prüfliste, Spenden, Präsentation. Die
  Routen liegen in der neuen Datei `server/routes/adminMarketing.js`.
- **Partner verwalten** (anlegen, bearbeiten, löschen), inklusive Logo-Upload. Die Multer-Konfiguration und die
  MIME-Whitelist kommen aus `server/routes/uploads.js`.
- **Gutschein-Stapel:**
  - anlegen, pro Partner oder frei
  - als CSV exportieren
  - widerrufen
- **Druckseite** `/admin/gutscheine/:id/druck`:
  - Karten im Visitenkartenformat 85×55 mm, mit Druck-CSS
  - QR-Code als Inline-SVG über eine kleine Bibliothek ohne weitere Abhängigkeiten (z. B. `qrcode-generator`)
  - Ziel des QR-Codes ist `https://<domain>/v#CODE`, deshalb **muss die Domain vor dem Druck feststehen**
- **Statistik:**
  - Einlösungen pro Partner und Stapel, samt Mundpropaganda-Ketten (Rudel → Gutschein → neues Rudel)
  - Klicks pro Anzeige und Tag
  - gefundene gegenüber übernommenen Einträgen
- **Präsentationsmodus:**
  - Vorschau jedes Partnerportals, auch von Entwürfen
  - „Demo als Partner X", auch „als Tierheim X" mit Chroniken, Steckbriefen und Übergabe (Phase T)
  - Vollbild ohne Admin-Bedienelemente, zum Vorführen bei Tierheimen und Hundeschulen
- **Rudel-Liste:** zeigt die Herkunft (Partner bzw. Gutschein-Kette) statt des alten Freitexts `quelle`.

---

## Querschnitt

### Recht

- **Neue öffentliche Seiten:** `/impressum` (DDG §5) und `/datenschutz`.
- **Datenschutzerklärung** deckt ab:
  - E-Mail und PLZ
  - Standortabfrage: vom Browser erfragt, gerundet, nicht gespeichert
  - Serverabfragen bei OSM: Dort sehen sie unsere Server-IP und die gerundeten Koordinaten, nicht die IP des Nutzers
  - Klickzählung
  - GoFundMe als externe Seite
- **Quellenangaben** im Footer und an den Ergebnislisten: „© OpenStreetMap-Mitwirkende (ODbL)", GeoNames (CC BY).
  Falls Google später dazukommt, auch das Google-Logo.

### Sicherheit

- Codes werden nur gehasht gespeichert, bis zum Einlösen zusätzlich verschlüsselt.
- In URLs stehen Codes nur hinter `#`.
- Weitere Maßnahmen:
  - Rate-Limits
  - SSRF-Schutz bei ausgehenden Anfragen
  - keine offenen Weiterleitungen
  - Sessions lassen sich zentral beenden
  - `.env` gehört ins Backup

### Doku

- README: Gutscheine statt Einladungscode, Testumgebung, Staging und Übernahme nach Prod. Aus „keine externen
  Dienste" wird eine Liste der optionalen externen Dienste.
- `.env.example` bekommt `CODE_PEPPER`, `APP_ENV`, `RUDEL_VOUCHER_QUOTA`, `PLACES_PROVIDERS`,
  `GOOGLE_PLACES_API_KEY`, `SITECHECK_ENABLED` und die Budget-Grenzen.

### Reihenfolge

Die Phasen bauen aufeinander auf: 0 → 1 → 2 → **T** → 3, danach 4 und 5 parallel. Phase 0 kommt zuerst, damit ab
Phase 1 alles lokal durchklickbar ist und nichts ungetestet nach Prod geht. Phase T braucht Gutscheine und Benutzer
(Phase 1) sowie Partner (Phase 2). Sie kommt vor „Entdecken", weil sie das stärkste Argument im Gespräch mit
Tierheimen ist und „Neuer Begleiter gesucht?" mit echten Tieren füllt.

---

## Offene Fragen

1. **Crawler-Beispiele:** Welche 2 konkreten URLs? Was sagen deren Nutzungsbedingungen bzw. robots.txt?
2. **Domain:** Welche wird es? Sie muss vor dem Kartendruck feststehen, weil die QR-Codes sie enthalten. Ist
   `staging.<domain>` mit Basic-Auth recht?
3. **Länder:** Nur Deutschland, oder auch Schweiz und Österreich? Deren 4-stellige PLZ überschneiden sich, dann
   braucht es ein Länderfeld.
4. **Kontingente:** Wie viele Gutscheine pro Rudel? Wann wird aufgefüllt? Laufen Partner-Stapel ab?
5. **Ausgeber kennt den Code:** Das Tierheim, das eine Karte übergibt, kennt deren Code. Reicht der Hinweis
   „Schlüssel erneuern" nach dem Einlösen, oder braucht die Karte eine getrennte PUK, etwa zum Freirubbeln?
6. **Wiederherstellung per E-Mail** braucht einen Mail-Dienst (SMTP), also einen externen Dienst. Erst mal nur
   die PUK?
7. **Anzeigen-Pflege:** Dürfen Partner ihre Anzeigen selbst bearbeiten, oder nur der Admin?
8. **Preismodell für Anzeigen:** Kostenlos für Partner, gegen Spende, oder bezahlt? Davon hängt ab, ob etwas als
   „Anzeige" oder „Empfehlung" gekennzeichnet wird.
9. **GoFundMe:** Ist die Weitergabe an Tierheime steuerlich und nach den AGB geprüft? Wie oft werden die
   Transparenzzahlen veröffentlicht?
10. **Altbestand:** Sollen alte Rudel bis zu einem Stichtag auf einen Rudel-Schlüssel umstellen?
11. **Karte:** Bleibt es bei der Liste mit Maps-Links, oder soll später eine eingebettete Karte (Leaflet mit
    OSM-Kacheln) dazukommen?
12. **Tierheim – „Änderungen sammeln":** Gemeint sind (a) Einträge von Mitarbeitenden und Ehrenamtlichen, solange
    das Tier im Tierheim ist, (b) Neuigkeiten der neuen Halter nach der Vermittlung, oder beides? Das Konzept sieht
    beides vor.
13. **Tierheim – Chronik beim Umzug:** Zieht die ganze Chronik mit ins neue Zuhause (Vorschlag), oder behält das
    Tierheim eine eigene Kopie?
14. **Tierheim – Steckbriefe:** Sollen Steckbriefe von Suchmaschinen gefunden werden dürfen (mehr Reichweite),
    oder nur per Link erreichbar sein (Vorschlag als Standard)?
15. **Tierheim – andere Tiere:** Tierheime vermitteln auch Katzen, Kleintiere usw. Die App kann schon mehrere
    Tierarten. Sollen die in Steckbriefen und unter „Neuer Begleiter gesucht?" auftauchen, oder nur Hunde?
