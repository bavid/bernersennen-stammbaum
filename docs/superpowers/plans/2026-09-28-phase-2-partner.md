# Phase 2 – Partner, Portale, Umkreissuche Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tierheime, Vermittlungsstellen und Hundeschulen werden **Partner** mit eigener Portalseite `/p/:slug`. Das Portal zeigt Logo und Akzentfarbe, begrüßt die Besucher und erlaubt, einen Gutschein direkt einzulösen. Eine öffentliche Partnerliste `/partner` lässt sich nach PLZ und Umkreis filtern. Angemeldete finden Tierheime und Hundeschulen in der Nähe über OpenStreetMap, per PLZ oder freigegebenem Standort. **Nie Züchter.** Der Browser spricht nur mit dem eigenen Server.

**Architecture:**
- **Partner-Daten:** Tabelle `partners` ohne Typ „Züchter“. `breederGuard` prüft alle Partner-Texte und Suchtreffer auf Zucht-Begriffe.
- **Standort:** PLZ-Koordinaten kommen aus einer mitgelieferten JSON-Datei (GeoNames, CC BY 4.0). Standort-Koordinaten werden auf 0,01° gerundet und nie gespeichert oder geloggt.
- **Umkreissuche:** Der Server fragt die Overpass-API (OSM, ODbL) über einen SSRF-sicheren HTTP-Helfer mit Host-Allowlist. Ergebnisse liegen 7 Tage im Cache in SQLite.
- **Kontrolle:** Partner und Partner-Gutscheinstapel pflegt der Admin.

**Tech Stack:** Node 24, Express 4, better-sqlite3, node:test; React 18, Vite 6, Vitest 4 (jsdom).

**Grundlage:**
- [Konzept, Phase 2](../specs/2026-09-27-marketing-gutscheine-partner-design.md)
- [Roadmap](2026-09-28-familie-auf-pfoten-roadmap.md) mit diesen vorläufigen Entscheidungen:
  - nur Deutschland, 5-stellige PLZ;
  - Liste mit Entfernung und Maps-/OSM-Links, keine eingebettete Karte;
  - Anzeigen pflegt nur der Admin;
  - Kennzeichnung „Partner“ bzw. „geprüft“.

**Regeln für alle Tasks:**
- Branch `staging`, nie pushen.
- **Kein Co-Authored-By-Trailer** (globale Nutzerregel).
- Höchstens **eine** Ebene `t.test`.
- Nur neutrale bzw. fiktive Namen: „Tierheim Sonnenhang“, „Hundeschule Pfotenglück“, „Tierschutzverein Deichland“.
- **Tests fragen nie echte externe Dienste ab.** Anbieter werden gemockt bzw. über eine Fixture-Datei eingespielt.
- Die Umgebungsvariable `PLACES_PROVIDERS` steuert die Anbieter: `overpass` (Standard in Produktion) oder `fixture` (Tests, Demo, Testumgebung).
- Koordinaten und PLZ von Nutzern landen nie in Logs.

**Bewusst nicht in dieser Phase:**
- Der Reiter „Entdecken“ mit Anzeigen und Empfehlungen (Phase 3). Die Suche wird hier gebaut, dort eingebaut.
- Crawler und Website-Prüfung (Phase 4).
- Google Places (nur vorbereitet, aus).
- Statistik (Phase 5).
- PLZ am Rudel speichern (später).

---

## Dateien

| Datei | Aufgabe |
|---|---|
| `server/scripts/build-plz.js` (neu) | erzeugt `server/geo/plz-de.json` aus GeoNames `DE.txt` |
| `server/geo/plz-de.json` (neu, generiert) | `{ "10115": [lat, lon, "Berlin"], … }` |
| `server/lib/geo.js` (neu) | PLZ → Koordinaten, Haversine, Rundung |
| `server/lib/breederGuard.js` (neu) | Zucht-Begriffe erkennen |
| `server/db.js` | `partners`, `places_cache`, `places_budget`; `vouchers.partner_id` gibt es schon |
| `server/lib/partners.js` (neu) | Validierung, Slug, Farbe mit Kontrastprüfung |
| `server/routes/partners.js` (neu) | öffentlich: Liste, Portal |
| `server/routes/admin.js` | Partner pflegen, Logo hochladen, Partner-Gutscheinstapel |
| `server/lib/http.js` (neu) | einziger Weg nach außen (SSRF-Schutz) |
| `server/lib/places/` (neu) | `index.js`, `providers/overpass.js`, `providers/fixture.js`, `cache.js` |
| `server/routes/places.js` (neu) | `POST /api/places/search` |
| `server/lib/demoPack.js`, `scripts/testenv-seed.js` | Demo-Partner |
| `client/src/pages/PartnerPortalPage.jsx`, `PartnersPage.jsx`, `NearbyPage.jsx`, `LegalPage.jsx` (neu) | Portal, Liste, Umgebung, Impressum/Datenschutz |
| `client/src/components/LocationPicker.jsx`, `PlaceList.jsx` (neu) | PLZ/Standort, Ergebnisliste |
| `client/src/components/AdminPartners.jsx` (neu) | Partner pflegen |

---

### Task 1: PLZ-Daten, Geo-Helfer, Züchter-Schutz (Server)

**Files:**
- Create: `server/scripts/build-plz.js`, `server/geo/plz-de.json`, `server/lib/geo.js`, `server/lib/breederGuard.js`
- Test: `server/test/geo.test.js`, `server/test/breederGuard.test.js`

**`build-plz.js`:** Aufruf `node scripts/build-plz.js <Pfad zu DE.txt>`.
- Liest das tab-getrennte GeoNames-Format mit diesen Spalten: Land, PLZ, Ort, Land(1), Code, Kreis(2), Code, (3), Code, lat, lon, Genauigkeit.
- **Gruppierung:**
  - Pro PLZ wird der Mittelwert von lat/lon gebildet, gerundet auf 3 Nachkommastellen.
  - Ort ist der häufigste Ortsname der PLZ. Namen, die nach Firma aussehen, werden ignoriert, solange es andere gibt: Regex `\b(GmbH|AG|KG|mbH|e\.V\.|SE|Co\.|Verwaltung|Vertrieb|Bank|Versicherung)\b`.
- **Ausgabe:** `server/geo/plz-de.json`, kompakt `{ "PLZ": [lat, lon, "Ort"] }`, nach PLZ sortiert, ohne Leerzeichen.
- Eine Kopf-Info steht **nicht** in der JSON-Datei, sondern in der README bzw. einem Kommentar im Skript: „Postleitzahlen: GeoNames (geonames.org), CC BY 4.0“.
- `server/geo/` wird **nicht** in `.gitignore` aufgenommen, die generierte Datei wird committet (etwa 400–500 KB).
- Die Quelle `DE.txt` liegt beim Koordinator in dessen Scratchpad. Der Pfad kommt im Auftrag mit, und die Quelldatei selbst wird nicht committet.

**`server/lib/geo.js`:**

```js
const plz = require('../geo/plz-de.json')

const EARTH_KM = 6371

// PLZ (5 Ziffern) → { lat, lon, ort } oder null
function lookupPlz(code) {
  if (typeof code !== 'string' || !/^\d{5}$/.test(code)) return null
  const hit = plz[code]
  return hit ? { lat: hit[0], lon: hit[1], ort: hit[2] } : null
}

// Standort-Koordinaten nie genauer als ~1 km verarbeiten
function roundCoord(value, step = 0.01) {
  return Math.round(value / step) * step
}

function validCoords(lat, lon) {
  return Number.isFinite(lat) && Number.isFinite(lon) && lat >= 47 && lat <= 55.2 && lon >= 5.5 && lon <= 15.5
}

function distanceKm(a, b) {
  const rad = (d) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLon = rad(b.lon - a.lon)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_KM * Math.asin(Math.sqrt(h))
}

module.exports = { lookupPlz, roundCoord, validCoords, distanceKm }
```

(`validCoords` begrenzt auf Deutschland plus Rand. Nur Deutschland laut Entscheidung 3.)

**`server/lib/breederGuard.js`:**
- `looksLikeBreeder(text)` → boolean.
- Groß-/Kleinschreibung ist egal, Wortgrenzen gelten, Umlaute sind berücksichtigt.
- Trifft: „Zucht“, „Züchter“, „Züchterin“, „Zwinger“, „Deckrüde“, „Deckkater“, „Welpen abzugeben“, „Welpenverkauf“, „Kennel“, „Cattery“, „breeder“, „breeding“.
- Trifft **nicht**: „Tierschutz“, „Welpenschule“, „Welpenkurs“, „Hundeschule“, „Tierheim“.
- `assertNoBreeder(fields)` wirft 400 „Züchter und Zucht-Angebote werden hier nicht aufgenommen.“

**Tests:**
- `geo.test.js`:
  - `lookupPlz` für eine bekannte PLZ (z. B. „10115“, Berlin) mit plausiblen Koordinaten;
  - ungültige und unbekannte PLZ ergeben `null`;
  - `distanceKm` Berlin–Hamburg liegt bei etwa 255 km (±5);
  - Werte von `roundCoord`;
  - Grenzen von `validCoords`;
  - die JSON-Datei hat über 8000 Einträge im richtigen Format.
- `breederGuard.test.js`: die Positiv- und Negativlisten von oben.
- `build-plz.js`: ein kleiner Test mit einer Mini-Fixture im Temp-Ordner (drei Zeilen, davon eine mit Firmennamen) prüft Gruppierung, Mittelwert und Ortswahl.

- [ ] Tests → scheitern → implementieren (Skript mit der echten Datei laufen lassen) → grün
- [ ] Commit: `feat: PLZ-Daten (GeoNames), Geo-Helfer und Züchter-Schutz`

---

### Task 2: Partner – Tabelle, Admin-Pflege, öffentliche Endpunkte (Server)

**Files:**
- Modify: `server/db.js`, `server/routes/admin.js`, `server/app.js`
- Create: `server/lib/partners.js`, `server/routes/partners.js`
- Test: `server/test/partners.test.js`

**Schema:**

```sql
CREATE TABLE IF NOT EXISTS partners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  typ TEXT NOT NULL CHECK (typ IN ('tierheim','vermittlung','hundeschule','futter','sonstige')),
  ist_partner INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'entwurf' CHECK (status IN ('entwurf','aktiv','pausiert')),
  plz TEXT, ort TEXT, lat REAL, lon REAL,
  website TEXT, spenden_url TEXT, vermittlung_url TEXT,
  kontakt_email TEXT, kontakt_telefon TEXT,
  logo_file TEXT, portal_titel TEXT, portal_text TEXT, farbe TEXT,
  quelle TEXT NOT NULL DEFAULT 'manuell' CHECK (quelle IN ('manuell','osm','sitecheck')),
  osm_ref TEXT, is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_partners_status ON partners(status);
```

**`lib/partners.js`:**
- **`validatePartner(input, { existingSlug })`:**
  - `name` ist Pflicht, höchstens 120 Zeichen.
  - `slug`: klein, `[a-z0-9-]`, 3–60 Zeichen, sonst aus dem Namen erzeugt (Umlaute → ae/oe/ue/ss).
  - `typ` aus der Liste.
  - `plz` hat 5 Ziffern und wird per `lookupPlz` zu lat/lon/ort (unbekannt → 400).
  - URLs nur `https://` oder `http://`, höchstens 300 Zeichen, geprüft mit `new URL`.
  - E-Mail und Telefon mit einfachem Format.
  - `portal_text` höchstens 2000 Zeichen, nur Text, kein HTML.
  - `farbe`: `#rrggbb`, Kontrast gegen Weiß (`--on-rust` ist hell) nach WCAG mindestens 4,5:1, sonst 400 „Farbe zu hell – Schrift wäre schlecht lesbar“.
  - `assertNoBreeder` über name, portal_titel und portal_text.
- `publicPartner(row, { origin })`:
  - gibt nur die öffentlichen Felder zurück;
  - `logoUrl` = `/partner-media/<logo_file>` oder null;
  - `badge` = `ist_partner ? 'partner' : 'geprueft'`.

**Admin (`requireAdmin`):**
- `GET /api/admin/partners`
- `POST /api/admin/partners`
- `PUT /api/admin/partners/:id`
- `POST /api/admin/partners/:id/logo`: multipart, PNG/JPG/WebP/SVG? Nur **PNG/JPG/WebP**, SVG nicht wegen XSS. Höchstens 512 KB; Dateiname vergibt der Server, abgelegt in `DATA_DIR/partner-media`.
- `DELETE /api/admin/partners/:id`: nur bei Status `entwurf`, sonst 409, stattdessen pausieren.
- **Partner-Gutscheine:** `POST /api/admin/voucher-batches` nimmt zusätzlich `partnerId` (aktiver oder Entwurfs-Partner). Dann gilt `kind: 'partner'` und `partner_id` wird auf Stapel und Gutschein gesetzt. `GET /api/admin/voucher-batches` zeigt den Partnernamen.

**Öffentlich (`routes/partners.js`, ohne Login, `apiLimiter`):**
- **`GET /api/public/partners?plz=&radius=`:**
  - Ohne `plz` liefert es **alle** aktiven Partner, nach Name sortiert.
  - Mit gültiger `plz` und `radius` (5, 10, 25, 50 oder 100, sonst 400) liefert es aktive Partner im Umkreis, nach Entfernung sortiert, mit `distanceKm` auf 1 Nachkommastelle.
  - Demo-Partner (`is_demo = 1`) erscheinen **nur** mit `?demo=1` oder bei `APP_ENV` gleich `dev`/`staging`. In Produktion kommen sie nicht in die echte Liste.
- **`GET /api/public/partners/:slug`:** Portal-Daten: publicPartner plus `portal_titel`, `portal_text`, `spenden_url`, `vermittlung_url`, `farbe`. Nur `status = aktiv`, sonst 404. Mit Admin-Cookie auch Entwürfe als Vorschau, dann mit `preview: true`.
- **`/partner-media/<datei>`:** öffentlich, statisch aus `DATA_DIR/partner-media`. Dateiname per Regex prüfen, `nosniff`, Cache wie bei `/uploads`.

**Einlösen über ein Portal:** Der Partner steckt im Gutschein (`partner_id`). `redeemVoucher` setzt dazu `families.partner_id`: neue Spalte per `addColumnIfMissing`, also „kam über Partner X“.

**Tests:**
- Admin: Anlegen und Ändern samt Validierung (Slug, PLZ → Koordinaten, URL, zu helle Farbe → 400, Zuchttext → 400).
- Logo: PNG hochladen und öffentlich abrufen; SVG → 400.
- Status: Liste und Portal zeigen nur aktive Partner; der Entwurf ist nur mit Admin-Cookie sichtbar.
- Umkreis: PLZ und Radius liefern die richtige Reihenfolge und Entfernung; ein ungültiger Radius → 400.
- Demo-Partner erscheinen in Produktion nicht.
- Partner-Stapel: Wer einen Gutschein daraus einlöst, bekommt `families.partner_id`.
- Keine Familien-Sitzung kann Admin-Endpunkte nutzen.

- [ ] Tests → scheitern → implementieren → grün
- [ ] Commit: `feat: Partner mit Portal-Daten, Admin-Pflege, Partner-Gutscheine`

---

### Task 3: Umkreissuche über OpenStreetMap (Server)

**Files:**
- Create: `server/lib/http.js`, `server/lib/places/index.js`, `server/lib/places/cache.js`, `server/lib/places/providers/overpass.js`, `server/lib/places/providers/fixture.js`, `server/routes/places.js`, `server/geo/places-fixture.json`
- Modify: `server/db.js`, `server/config.js`, `server/app.js`
- Test: `server/test/http.test.js`, `server/test/places.test.js`

**`lib/http.js`:** `safeFetchJson(url, { method, body, headers, timeoutMs = 8000, maxBytes = 1_000_000, allowHosts })`.
- Nur `https:` (in Tests `http:` zu 127.0.0.1 über ein Flag erlaubt).
- Der Host muss in `allowHosts` stehen.
- **Vor dem Verbinden:** DNS-Lookup und Abbruch, wenn eine der Adressen privat oder Loopback ist. Geprüft werden 10/8, 172.16/12, 192.168/16, 127/8, 169.254/16, ::1, fc00::/7 und fe80::/10.
- Keine Weiterleitungen (`redirect: 'manual'`, 3xx → Fehler).
- Timeout per `AbortController`; die Antwortgröße wird beim Lesen begrenzt.
- User-Agent `FamilieAufPfotenBot/1.0 (+${PUBLIC_URL || 'https://<host>'}/bot)`.
- Ergebnis nur als JSON.

**`providers/overpass.js`:**
- **Abfrage:** POST an `https://overpass-api.de/api/interpreter` (Allowlist `overpass-api.de`), `data=` mit dieser Abfrage:
  ```
  [out:json][timeout:20];
  ( nwr["amenity"="animal_shelter"](around:R,LAT,LON);
    nwr["amenity"="animal_training"]["animal_training"~"dog"](around:R,LAT,LON); );
  out center tags 200;
  ```
- **Ergebnisse:**
  - Treffer mit `animal_breeding` oder Zucht-Begriffen (`breederGuard`) werden verworfen.
  - Jeder Treffer wird abgebildet auf `{ id: 'osm:<type>/<id>', name, typ: 'tierheim'|'hundeschule', lat, lon, website, telefon, email, adresse, quelle: 'osm' }`.
  - Treffer ohne Namen werden verworfen.

**`providers/fixture.js`:** liest `server/geo/places-fixture.json`. Das sind fiktive Einträge rund um drei Beispiel-PLZ (z. B. 10115, 20095, 80331), alle mit `quelle: 'fixture'`. Der Provider liefert die Einträge im Radius. So bleiben Tests, Demo und Testumgebung ohne Internet.

**`cache.js`:**
- Tabelle `places_cache(key TEXT PRIMARY KEY, payload TEXT, created_at)`.
- Schlüssel: `${kind}:${lat auf 0,05°}:${lon auf 0,05°}:${radius}`.
- Gültig 7 Tage; beim Schreiben werden alte Einträge gelöscht.

**Budget:**
- Tabelle `places_budget(day TEXT PRIMARY KEY, count INTEGER)`.
- Höchstens `PLACES_DAILY_LIMIT` Anfragen pro Tag an Overpass (Standard 500). Darüber gibt es nur Cache und Partner, dazu der Hinweis `limited: true`.

**`places/index.js`:** `searchPlaces({ lat, lon, radiusKm, isDemo })`.
- **Quellen:**
  - Partner (aktiv, im Radius, Demo-Partner nur für die Demo bzw. in dev/staging);
  - Anbieter-Treffer: Demo → immer `fixture`; sonst die Provider aus `config.placesProviders` (Standard in Produktion `overpass`, in dev/test `fixture`).
- **Dubletten entfernen:** gleiche `osm_ref`/`id`, oder gleicher Name (normalisiert) innerhalb von 150 m. Partner gewinnen.
- **Züchter-Schutz** über alle Namen.
- **Ergebnis:** `distanceKm`; sortiert zuerst Partner, dann nach Entfernung; höchstens 60 Einträge.
- **Rückgabe:** `{ results, limited, attribution: ['© OpenStreetMap-Mitwirkende (ODbL)'] }`.

**`POST /api/places/search`** (`requireSession`, also auch die Demo; `placesLimiter` per IP, 30 pro 10 Minuten):
- Body `{ plz }` oder `{ lat, lon }` plus `radius` (5, 10, 25, 50, 100).
- `lat/lon` werden auf 0,01 gerundet und per `validCoords` geprüft (sonst 400).
- PLZ unbekannt → 400 „Diese Postleitzahl kennen wir nicht“.
- **Nie** Koordinaten oder PLZ loggen: kein Request-Logging des Bodys; prüfen, dass der Fehler-Handler den Body nicht ausgibt.
- Antwort: `{ center: { lat, lon, ort? }, radius, results, limited, attribution }`.

**Tests:**
- `http.test.js`:
  - privater Host, `localhost` und `127.0.0.1` (ohne Test-Flag) → Fehler;
  - Host nicht in der Allowlist → Fehler;
  - Weiterleitung → Fehler;
  - zu große Antwort → Fehler;
  - Timeout (lokaler Testserver, der hängt; mit Test-Flag für 127.0.0.1).
- `places.test.js` (mit Fixture-Provider und einem gemockten Overpass-Provider über eine injizierbare Funktion):
  - Sortierung Partner zuerst, dann Entfernung;
  - Dubletten;
  - Züchter-Treffer verworfen;
  - Cache-Treffer ohne zweiten Provider-Aufruf;
  - Budget erschöpft → `limited`;
  - Demo nutzt die Fixture;
  - Validierung;
  - die Route antwortet ohne Session mit 401.

- [ ] Tests → scheitern → implementieren → grün
- [ ] Commit: `feat: Umkreissuche über OpenStreetMap – sicher, gecacht, ohne Züchter`

---

### Task 4: Demo-Partner und Seed (Server)

**Files:** `server/lib/demoPack.js`, `server/scripts/testenv-seed.js`, Tests

- Demo-Partner (`is_demo = 1`, `status = 'aktiv'`):

| Partner | Typ | PLZ | Farbe | Portal-Text | Links |
|---|---|---|---|---|---|
| **Tierheim Sonnenhang** | tierheim | 10115 | `#2f6b3f` | kurz, herzlich | `spenden_url` und `vermittlung_url` auf `https://example.org/…` |
| **Hundeschule Pfotenglück** | hundeschule | 20095 | `#1f5f8b` | – | – |
| **Tierschutzverein Deichland** | vermittlung | 26122 | – | – | – |

  Logos: einfache vorhandene Bilder, wenn passend, sonst keine.
- **Demo-Pack-Wechsel:** `replaceDemoPack` legt die Demo-Partner neu an und löscht alte `is_demo = 1`-Partner.
- **Nele (Tierheimhund der Demo):** Herkunftstext bleibt „Tierheim Sonnenhang“.
- **`testenv-seed`:**
  - legt dieselben Partner an;
  - erzeugt einen Partner-Gutscheinstapel „Tierheim Sonnenhang“ mit 3 Codes und gibt sie in der Konsole aus, wie die übrigen Test-Codes;
  - `--reset` räumt auf.
- **Tests:** Demo-Partner sind vorhanden und öffentlich abrufbar (dev/staging); ein zweiter Durchlauf ersetzt sie; echte Partner bleiben unberührt.

- [ ] Commit: `feat: Demo-Partner und Partner-Gutscheine in der Testumgebung`

---

### Task 5: Portal und Partnerliste (Client, öffentlich)

**Files:**
- Create: `client/src/pages/PartnerPortalPage.jsx`, `client/src/pages/PartnersPage.jsx`, `client/src/components/LocationPicker.jsx`, `client/src/components/PartnerCard.jsx`
- Modify: `client/src/App.jsx` (öffentliche Routen `/p/:slug`, `/partner`), `client/src/api.js`
- Tests dazu

**`/p/:slug` – Portal:**
- **Kopf:** Partner-Logo (falls vorhanden) neben dem Pfoten-Logo, Titel `portal_titel` bzw. „Willkommen von {Name}“ und `portal_text` als Absätze.
- **Akzentfarbe:** setzt `--rust`, `--rust-deep` (etwas dunkler, berechnet) und `--rust-wash` (transparent) als Inline-Style auf dem Seiten-Container. Die Grundfarben bleiben.
- **Zwei Hauptaktionen:**
  - „Gutschein einlösen“: der vorhandene `RedeemForm` → `KeyReveal` → App (wie `/v`, `startRoute`);
  - „Demo ansehen“.
- **Links:** „Spenden an {Name}“ (`spenden_url`, externer Link `rel="noopener noreferrer"`) und „Tiere in Vermittlung“ (`vermittlung_url`).
- **Kontakt:** Website, E-Mail, Telefon.
- **Unbekannt oder inaktiv:** freundliche 404-Seite mit Link zur Partnerliste.
- Bei `preview: true` erscheint das Band „Vorschau – nur für Admins sichtbar“.

**`/partner` – Partnerliste:**
- Überschrift „Unsere Partner“.
- **`LocationPicker`:**
  - PLZ-Feld (5 Ziffern) plus Radius-Auswahl (5, 10, 25, 50, 100 km);
  - Knopf „Standort verwenden“ nur, wenn `window.isSecureContext && 'geolocation' in navigator`: Koordinaten auf 0,01 gerundet → Serveraufruf per `POST /api/places/search`, nur eingeloggt, und `POST /api/public/partners/near` für Gäste. Für Gäste gilt in dieser Phase nur die PLZ; den Standort-Knopf gibt es nur in der App (Task 6).
- **Karten** (`PartnerCard`):
  - Logo, Name, Typ-Label, Entfernung, Badge „Partner“ bzw. „geprüft“;
  - Links: „Zum Portal“, „Website“, „In Google Maps öffnen“ (`https://www.google.com/maps/search/?api=1&query=LAT,LON`), „OpenStreetMap“ (`https://www.openstreetmap.org/?mlat=LAT&mlon=LON#map=16/LAT/LON`).
- Ohne PLZ: alle Partner.
- **Nie Züchter:** Den Typ gibt es nicht, der Server filtert.
- **Footer der öffentlichen Seiten:** „Postleitzahlen: GeoNames (CC BY 4.0)“ und Links auf Impressum und Datenschutz (Task 7).
- **Tests:**
  - Portal rendert Name, Text und Akzent-Inline-Style; Einlösen ruft `redeemVoucher` auf;
  - 404-Zustand;
  - Liste mit und ohne PLZ;
  - der Standort-Knopf erscheint in unsicherem Kontext nicht;
  - Maps-Links sind korrekt kodiert.

- [ ] Commit: `feat: Partner-Portal /p/:slug und Partnerliste /partner`

---

### Task 6: „In der Nähe“ in der App (Client)

**Files:**
- Create: `client/src/pages/NearbyPage.jsx`, `client/src/components/PlaceList.jsx`
- Modify: `client/src/App.jsx` (Route `/umgebung`, Link im Footer und auf der Wegbegleiter- bzw. Stammbaumseite, noch **kein** Reiter; der Reiter kommt mit „Entdecken“ in Phase 3), `client/src/api.js`

- **`NearbyPage` („Tierheime & Hundeschulen in der Nähe“):**
  - `LocationPicker` mit PLZ oder Standort (Standort nur über HTTPS, sonst Hinweis „Standort geht nur über eine sichere Verbindung – nutzt die PLZ.“).
  - Radius auswählbar, Aufruf `api.searchPlaces(...)`.
  - **`PlaceList`:**
    - Filter-Chips „Alle / Tierheime / Hundeschulen“;
    - Einträge mit Badge „Partner“, Entfernung, Adresse und Links (Website, Maps, OSM);
    - bei `limited` ein Hinweis;
    - Quellenangabe „© OpenStreetMap-Mitwirkende (ODbL)“ unter der Liste.
- **Datenschutz-Hinweis direkt am Knopf:** „Dein Standort wird auf etwa 1 km gerundet, nur für diese Suche verwendet und nicht gespeichert.“
- **Demo:** funktioniert mit festen Ergebnissen (Server-Fixture).
- **Tests:**
  - Aufruf mit PLZ;
  - Standort gerundet auf 0,01 (Geolocation gemockt);
  - Filter;
  - Quellenangabe;
  - Hinweis bei `limited`;
  - Fehler bei unbekannter PLZ.

- [ ] Commit: `feat: Tierheime und Hundeschulen in der Nähe (PLZ oder Standort)`

---

### Task 7: Admin-Pflege der Partner, Impressum und Datenschutz (Client + Server)

**Files:**
- Create: `client/src/components/AdminPartners.jsx`, `client/src/pages/LegalPage.jsx`
- Modify: `client/src/pages/AdminPage.jsx`, `client/src/components/AdminVouchers.jsx` (Partner-Auswahl für Stapel), `server/config.js` + `server/routes/auth.js` (`GET /api/config` liefert `legal`), `.env.example`, `README.md`

- **`AdminPartners`:**
  - Liste mit Status-Chips und Aktionen „Bearbeiten“, „Portal ansehen“ (öffnet `/p/:slug`, Entwürfe als Vorschau), „Pausieren“/„Aktivieren“, „Löschen“ (nur Entwurf).
  - **Formular** mit allen Feldern aus Task 2:
    - Farbwähler mit Live-Kontrastanzeige, dieselbe WCAG-Formel wie der Server, in `client/src/lib/contrast.js` gespiegelt;
    - Logo-Upload;
    - bei Serverfehlern werden die Meldungen gezeigt.
- **`AdminVouchers`:** Auswahl „für Partner“ (optional) beim Anlegen eines Stapels.
- **Impressum und Datenschutz:**
  - `GET /api/config` liefert zusätzlich `legal: { name, address, email, phone }` aus `IMPRESSUM_NAME`, `IMPRESSUM_ADRESSE` (mehrzeilig mit `\n`), `IMPRESSUM_EMAIL` und `IMPRESSUM_TELEFON`, Felder leer, wenn nicht gesetzt.
  - **`/impressum`:** zeigt diese Angaben; fehlen sie, steht dort „Die Betreiberangaben werden vor dem Start ergänzt.“ Das ist ein ehrlicher Hinweis, keine erfundenen Daten.
  - **`/datenschutz`:** fester, sachlicher Text darüber, was die App tatsächlich tut:
    - Session-Cookie, gespeicherte Inhalte, Fotos;
    - optionale E-Mail;
    - Standort nur gerundet und nie gespeichert;
    - Umkreissuche über den Server bei OpenStreetMap: OSM sieht die Server-IP und gerundete Koordinaten, nie die Nutzer-IP;
    - Postleitzahlen lokal (GeoNames);
    - keine Tracker, keine externen Schriften;
    - Kontakt: die Impressums-E-Mail.
  - Beide Seiten sind öffentlich, im Standard-Theme, und verlinkt im Footer von Login-Seite, Portal, Partnerliste und App.
- **`.env.example` und README:** `IMPRESSUM_*`, `PLACES_PROVIDERS`, `PLACES_DAILY_LIMIT`, `PUBLIC_URL`; Quellenangaben (GeoNames, OSM).
- **Tests:** Admin-Partnerformular (Anlegen, Kontrast-Warnung, Logo), Legal-Seiten (mit und ohne Angaben), Config-Endpunkt.

- [ ] Commit: `feat: Partner im Admin pflegen, Impressum und Datenschutz`

---

### Task 8: Doku, Prüfung, Vorschau (Koordinator)

- [ ] README (Partner, Portale, Umkreissuche, Quellen), Roadmap (Phase 2 ✅/🚀, Log).
- [ ] Abschluss-Review (SSRF, Datenschutz, XSS in Partner-Texten und Farben, Admin-Rechte).
- [ ] Browser-Prüfung:
  - `/p/tierheim-sonnenhang`: Portal mit Farbe, Einlösen eines Partner-Codes → Chronik, Partner zugeordnet;
  - `/partner` mit und ohne PLZ;
  - `/umgebung` in der Demo;
  - Netzwerk-Tab: nur eigene Domain;
  - Handy.
- [ ] Vorschau deployen, Beispieldaten neu. Auf der Vorschau steht `PLACES_PROVIDERS` auf `fixture`, bis der Nutzer echte OSM-Abfragen freigibt: In `ensure_env` für staging den Standard `fixture` setzen, in Produktion `overpass`.
