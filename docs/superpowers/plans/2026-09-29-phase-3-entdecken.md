# Phase 3 – Reiter „Entdecken“ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein neuer Reiter **„Entdecken“** bündelt vier Bereiche:
- **„Hundeschule gesucht?“:** Partner-Hundeschulen im Umkreis, sonst alle.
- **„Neuer Begleiter gesucht?“:** nur Tierheime und Vermittlungsstellen (Partner und geprüfte Einträge), dazu Steckbriefe von Tieren in Vermittlung. **Nie Züchter.**
- **„Futter-Empfehlungen“:** klar gekennzeichnet als „Empfehlung von …“ oder „Anzeige“.
- **„Unterstützen“:** GoFundMe-Link, Transparenzblock und Spendenlinks der Partner-Tierheime.

Klicks auf externe Links werden anonym gezählt: kein Cookie, keine IP.

**Architecture:**
- **Tabellen:** `promotions`, `link_clicks`, `donation_reports` und `settings`. Der Admin pflegt sie.
- **Übersicht:** `POST /api/discover` (Session, auch Demo) liefert alle vier Abschnitte in einer Antwort. Die PLZ steht im Body, nicht in der URL.
- **Klickzählung:** `GET /r/:type/:id` zählt pro Tag und leitet **nur auf gespeicherte URLs** weiter.
- **Demo:** Die Demo sieht Demo-Partner, Demo-Tiere und Demo-Anzeigen. Echte Sitzungen sehen nur echte Daten.

**Tech Stack:** Node 24, Express 4, better-sqlite3, node:test; React 18, Vite 6, Vitest 4.

**Grundlage:**
- [Konzept, Phase 3](../specs/2026-09-27-marketing-gutscheine-partner-design.md)
- Roadmap, Entscheidungen 7–9:
  - Anzeigen pflegt nur der Admin.
  - Die Kennzeichnung ist pro Eintrag wählbar: „Partner“, „Empfehlung“, „Anzeige“.
  - GoFundMe: Link plus vom Admin gepflegte Transparenzzahlen.

**Regeln für alle Tasks:**
- Branch `staging`, nie pushen, **kein Co-Authored-By-Trailer**, höchstens eine Ebene `t.test`.
- Nur fiktive Namen und Marken, zum Beispiel „Knusperkorn Sensitive“ von „Futterhof Deichland“. Keine echten Firmen- oder Produktnamen.
- Keine externen Dienste.
- **Rechtliches:**
  - Bezahltes oder Provisioniertes heißt „Anzeige“; Links darauf bekommen `rel="sponsored noopener noreferrer"`.
  - „Empfehlung von …“ gilt nur ohne Gegenleistung.
  - Futtertexte enthalten keine Gesundheitsversprechen. Im Admin-Formular steht dazu ein Hinweis; eine automatische Prüfung gibt es nicht.

---

### Task 1: Schema, Admin-Pflege von Empfehlungen, Einstellungen, Spendenberichten (Server)

**Files:**
- Modify: `server/db.js`
- Create: `server/lib/promotions.js`
- Modify: `server/routes/admin.js` (oder neu `server/routes/adminMarketing.js`, eingehängt unter `/api/admin`)
- Test: `server/test/promotions.test.js`

- **Schema:**

  ```sql
  CREATE TABLE IF NOT EXISTS promotions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    partner_id INTEGER,
    bereich TEXT NOT NULL CHECK (bereich IN ('futter','hundeschule','begleiter','unterstuetzen')),
    kennzeichnung TEXT NOT NULL CHECK (kennzeichnung IN ('Anzeige','Empfehlung','Partner')),
    empfohlen_von TEXT, titel TEXT NOT NULL, text TEXT, url TEXT,
    bild_file TEXT, tierart TEXT, aktiv INTEGER NOT NULL DEFAULT 1,
    start TEXT, ende TEXT, sort INTEGER NOT NULL DEFAULT 0, is_demo INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS link_clicks (
    target_type TEXT NOT NULL, target_id INTEGER NOT NULL, tag TEXT NOT NULL, anzahl INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (target_type, target_id, tag)
  );
  CREATE TABLE IF NOT EXISTS donation_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT, zeitraum TEXT NOT NULL,
    eingang_cents INTEGER NOT NULL, kosten_cents INTEGER NOT NULL, weitergeleitet_cents INTEGER NOT NULL,
    empfaenger TEXT, nachweis_url TEXT, is_demo INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
  ```

- **`lib/promotions.js` `validatePromotion`:**
  - Pflicht: `titel` (höchstens 120 Zeichen), `bereich`, `kennzeichnung`.
  - `empfohlen_von` ist Pflicht bei „Empfehlung“.
  - `text`: Klartext, höchstens 600 Zeichen, ohne Steuer- und Bidi-Zeichen. Die Helfer aus `lib/partners.js` wiederverwenden.
  - `url`: http(s), normalisiert.
  - `start`/`ende`: ISO-Datum; `ende` liegt nicht vor `start`.
  - `tierart`: optional, `hund`/`katze`/`anderes`.
  - `partner_id` muss existieren.
  - `breederGuard` über Titel, Text und `empfohlen_von`.
- **Admin-Endpunkte:**
  - `GET/POST/PUT/DELETE /api/admin/promotions`
  - `POST /api/admin/promotions/:id/image` (wie das Partner-Logo; Ablage in `partner-media`, das öffentlich ist)
  - `GET/PUT /api/admin/settings` (erlaubte Schlüssel: `gofundme_url`, `unterstuetzen_text`; URL wird geprüft)
  - `GET/POST/PUT/DELETE /api/admin/donation-reports` (Beträge als ganze Cent-Zahlen, nicht negativ, `nachweis_url` http(s))
- **Tests:** Validierung (Kennzeichnung, „Empfehlung“ ohne „von“ → 400, Zuchttext → 400, URL, Zeitraum), CRUD, Bild, Einstellungen, Spendenberichte, nur Admin.

- [ ] Commit: `feat: Empfehlungen, Anzeigen und Spendenberichte im Admin pflegen`

---

### Task 2: Entdecken-API und Klickzählung (Server)

**Files:**
- Create: `server/routes/discover.js`, `server/routes/redirect.js`
- Modify: `server/app.js` (`/r/...` **vor** der Client-Auslieferung einhängen), `client/vite.config.js` (Proxy `/r`)
- Test: `server/test/discover.test.js`

- **`POST /api/discover { plz?, radius? }`** (`requireSession`, Demo erlaubt; `placesLimiter` bzw. `apiLimiter`) gibt dieses Objekt zurück:

  ```
  {
    center?,
    hundeschulen: [...],
    begleiter: { partner: [...], tiere: [...] },
    futter: [...],
    unterstuetzen: { gofundmeUrl, text, bericht?, partnerSpenden: [...] }
  }
  ```

  - **Mit gültiger PLZ und Radius:** Partner und Tiere im Umkreis, nach Entfernung sortiert. Ohne PLZ gilt „alle“, nach Name sortiert. Nutzt `lib/geo.js`.
  - **`hundeschulen`:** aktive Partner mit `typ = 'hundeschule'` plus aktive Empfehlungen mit `bereich = 'hundeschule'`.
  - **`begleiter.partner`:** aktive Partner mit `typ` `tierheim` oder `vermittlung`.
  - **`begleiter.tiere`:** veröffentlichte Steckbrief-Tiere dieser Partner (Kartenform wie `/api/public/partners/:slug/animals`), höchstens 12.
  - **`futter`:** aktive Empfehlungen mit `bereich = 'futter'` im Zeitfenster, nach `sort` sortiert.
  - **`unterstuetzen`:**
    - GoFundMe-URL und Text aus `settings`;
    - neuester Spendenbericht;
    - Spendenlinks aktiver Partner-Tierheime (`spenden_url`).
  - **Demo-Regel:** In einer Demo-Sitzung nur `is_demo = 1`-Daten, in echten Sitzungen nur echte. In dev/staging sehen echte Test-Sitzungen beides, wie bei den Partnern.
  - **Link-Felder:** Jeder externe Link wird als `clickUrl` ausgeliefert: `/r/promotion/:id`, `/r/partner-website/:id`, `/r/partner-spende/:id` bzw. `/r/gofundme/0`. Die Roh-URL steht zur Anzeige zusätzlich in `url`.
- **`GET /r/:type/:id`:**
  - `type` ist einer von `promotion`, `partner-website`, `partner-spende`, `gofundme`.
  - Die Ziel-URL kommt **nur aus der Datenbank**.
  - Pro Tag erhöht sich `link_clicks` (`target_type`, `target_id`, `tag` = heutiges Datum).
  - Bots zählen nicht: User-Agent-Regex `bot|crawl|spider|preview|slurp|facebookexternalhit`.
  - Antwort `302` auf das Ziel, unbekanntes Ziel → 404; keine Cookies, keine IP-Speicherung.
  - Header `Referrer-Policy: no-referrer`, `Cache-Control: no-store`.
  - Promotions nur, wenn sie aktiv sind.
- **Tests:**
  - Abschnitte mit und ohne PLZ;
  - Demo- und Echt-Trennung;
  - Züchter tauchen nie auf (Partner-Typ und Zuchttext in einer Empfehlung werden beim Anlegen abgewiesen);
  - Klick zählt und leitet weiter; unbekannt → 404; Bot zählt nicht;
  - keine offene Weiterleitung (der Parameter `url` wird ignoriert).

- [ ] Commit: `feat: Entdecken-Übersicht und anonyme Klickzählung`

---

### Task 3: Demo-Inhalte (Server)

**Files:** `server/seed/demo-discover.js` (neu), `server/lib/demoPack.js`, `server/scripts/testenv-seed.js`, Tests

**Demo-Empfehlungen** (`is_demo = 1`):

| Titel | Bereich | Kennzeichnung | Hinweis |
|---|---|---|---|
| „Knusperkorn Sensitive“ | `futter` | Empfehlung | `empfohlen_von` „Hundeschule Pfotenglück“, sachlicher Text ohne Gesundheitsversprechen, URL `https://example.org/knusperkorn` |
| „Futterhof Deichland – Probierpaket“ | `futter` | Anzeige | – |
| „Welpenkurs im Frühjahr“ | `hundeschule` | Partner | – |

**Einstellungen und Spenden:**
- `settings`: `gofundme_url` = `https://example.org/familie-auf-pfoten-spenden`, dazu ein kurzer Unterstützen-Text.
- Demo-Spendenbericht: Zeitraum „2026 Q3“, Eingang 1.250 €, Kosten 180 €, weitergeleitet 1.000 €, Empfänger „Tierheim Sonnenhang“.

**Demo-Pack-Wechsel:**
- `replaceDemoPack` ersetzt diese Daten mit.
- Die Demo-Einstellungen dürfen echte Einstellungen nicht überschreiben. Deshalb liegen Demo-Settings unter eigenen Schlüsseln (`demo_gofundme_url` usw.), und `/api/discover` nimmt für Demo-Sitzungen die Demo-Schlüssel.

**Tests:**
- vorhanden und ersetzbar;
- echte Daten bleiben unberührt;
- die Demo-Sitzung sieht die Demo-Inhalte.

- [ ] Commit: `feat: Demo-Inhalte für Entdecken`

---

### Task 4: Reiter „Entdecken“ (Client)

**Files:**
- Create: `client/src/pages/DiscoverPage.jsx`, `client/src/components/PromotionCard.jsx`, `client/src/components/SupportBlock.jsx`
- Modify:
  - `client/src/App.jsx`
  - `client/src/components/Icon.jsx` (Icon `compass`)
  - `client/src/styles/layout.css` (untere Leiste mit 5 Einträgen)
  - `client/src/api.js`

- **Navigation:**
  - Zuhause: Wegbegleiter, Stammbaum, Pinnwand, **Entdecken**, Collage.
  - Rudel: Stammbaum, Pinnwand, Würfe, **Entdecken**, Collage.
  - Tierheim: unverändert.
  - Die mobile Leiste passt mit 5 Einträgen bei 375 px: prüfen, bei Bedarf Label-Schrift und Abstände anpassen, keine Überlappung.
- **`DiscoverPage`:**
  - **Kopf:** „Entdecken“ und `LocationPicker` (PLZ, Standort wie bei `/umgebung`). Nur PLZ und Radius werden gemerkt.
  - **Die vier Abschnitte als Kapitel** mit großen Überschriften:
    - „Hundeschule gesucht?“: Karten wie `PartnerCard`, Link zum Portal.
    - „Neuer Begleiter gesucht?“:
      - Tierheim-Karten und Tier-Karten (`AnimalAdoptionCard` → `/t/:slug`);
      - Hinweis „Hier findest du nur Tierheime und Vermittlungsstellen – keine Züchter.“;
      - Link „Mehr in der Nähe“ → `/umgebung`.
    - „Futter-Empfehlungen“ (`PromotionCard`):
      - Kennzeichnungs-Badge („Anzeige“ auffällig, „Empfehlung von …“, „Partner“);
      - Bild, Text, Link über `clickUrl`;
      - `rel="sponsored noopener noreferrer"` bei „Anzeige“, sonst `noopener noreferrer`.
    - „Unterstützen“ (`SupportBlock`):
      - GoFundMe-Knopf (`clickUrl`);
      - Transparenzblock „Eingang X € · Kosten gedeckt Y € · an Tierheime weitergegeben Z € (Zeitraum)“ mit Nachweis-Link;
      - Spendenlinks der Partner-Tierheime.
  - **Leerzustände je Abschnitt** („Noch keine Hundeschulen in der Nähe – schau in die Partnerliste.“).
  - **Beträge:** deutsch formatiert (`Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })`).
- **Tests:**
  - die Navigation hat 5 Einträge je Bereich;
  - die Abschnitte rendern;
  - Anzeigen-Links tragen `sponsored`;
  - Klick-Links zeigen auf `/r/...`;
  - Beträge sind formatiert;
  - der Aufruf mit PLZ sendet sie im Body.

- [ ] Commit: `feat: Reiter Entdecken – Hundeschulen, neue Begleiter, Futter-Empfehlungen, Unterstützen`

---

### Task 5: Admin-Oberfläche für Empfehlungen, Unterstützen und Klicks (Client)

**Files:** `client/src/components/AdminPromotions.jsx`, `client/src/components/AdminSupport.jsx` (neu), `client/src/pages/AdminPage.jsx`, `client/src/api.js`

- **`AdminPromotions`:**
  - **Liste:** Bereich, Kennzeichnung, aktiv, Zeitraum, Klicks (7 Tage und gesamt; Server: `GET /api/admin/promotions` liefert `clicks7`/`clicksTotal`, als Server-Ergänzung in dieser Task).
  - **Formular:**
    - alle Felder;
    - Hinweis bei „Futter“: „Keine Gesundheitsversprechen (z. B. ‚heilt‘, ‚verhindert Krankheiten‘).“;
    - Hinweis bei „Empfehlung“: „Nur ohne Gegenleistung – sonst ‚Anzeige‘ wählen.“;
    - Bild-Upload, tastaturbedienbar wie beim Partner-Logo.
- **`AdminSupport`:**
  - GoFundMe-URL und Text;
  - Spendenberichte (Liste, anlegen, bearbeiten, löschen; Beträge in € eingeben, in Cent speichern).
- **Tests:** Anlegen mit Validierungsfehlern, Hinweise, Klickzahlen, Spendenbericht in €/Cent.

- [ ] Commit: `feat: Empfehlungen, Unterstützen und Klickzahlen im Admin`

---

### Task 6: Doku, Prüfung, Vorschau (Koordinator)

- [ ] README (Entdecken, Kennzeichnung, anonyme Klickzählung), Datenschutz-Seite ergänzen (Klickzählung ohne Cookies und IP), Roadmap.
- [ ] Abschluss-Review (offene Weiterleitung, Kennzeichnung, Demo- und Echt-Trennung, 5er-Navigation mobil).
- [ ] Browser-Prüfung, Vorschau deployen.
