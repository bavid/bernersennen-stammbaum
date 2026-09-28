# Phase P – Partner-Bereich und Kontakt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- **Portal selbst pflegen:** Partner pflegen ihr Portal in einem eigenen Bereich.
- **Beiträge:** Sie stellen Beiträge ein, die als „Anzeige“ nach Freigabe durch den Admin in „Entdecken“ und auf dem Portal im Umkreis erscheinen.
- **Kontakt:** Sie sind über „Schreib uns“ (Postfach im Partner-Bereich), E-Mail oder einen Link zum eigenen Kontaktformular erreichbar.
- **Umkreis:** Gibt es weniger als 5 Treffer, werden die nächsten weiteren angehängt.

**Architecture:**
- **Bereich:**
  - Ein Partner-Bereich ist eine Familie mit `art = 'partner'` und `partner_id`.
  - Tierheime (`art = 'tierheim'`) bekommen dieselben Partner-Funktionen.
- **Eigene Endpunkte:**
  - Partner-Endpunkte liegen unter `/api/partner-area/*` (Session, aktiver Bereich muss `art` in `('partner','tierheim')` mit `partner_id` sein, nicht Demo für Schreibzugriffe).
  - Beiträge sind `promotions` mit neuer Spalte `freigabe`.
  - Nachrichten landen in der neuen Tabelle `partner_messages`.

**Tech Stack:** wie bisher.

**Grundlage:** [Konzept, Phase P](../specs/2026-09-27-marketing-gutscheine-partner-design.md), Roadmap (Entscheidung 7 geändert).

**Regeln für alle Tasks:**
- Branch `staging`, nie pushen, **kein Co-Authored-By-Trailer**, höchstens eine Ebene `t.test`.
- Fiktive Namen und Kontaktdaten (`example.org`).
- Keine externen Dienste, **kein E-Mail-Versand**.
- Absender-Daten von Nachrichten sind personenbezogen:
  - nur für den jeweiligen Partner sichtbar;
  - nie in Logs;
  - Löschung nach 180 Tagen.

---

### Task 1: Partner-Bereich und Portal selbst pflegen (Server)

**Files:** `server/db.js`, `server/lib/context.js` (`ART.partner`), `server/routes/admin.js`, neu `server/routes/partnerArea.js` (in `app.js` einhängen), `server/lib/partners.js`, Tests `server/test/partnerArea.test.js`

- **Schema:** `partners.kontakt_formular_url` TEXT (http(s)) und `partners.kontaktformular_aktiv` INTEGER NOT NULL DEFAULT 1.
- **Admin:**
  - `POST /api/admin/partners/:id/area` legt je nach Typ an: `tierheim`/`vermittlung` → `art = 'tierheim'` (wie `/shelter`), sonst `art = 'partner'`.
  - Mehrfach anlegen → 409.
  - Antwort `{ familyId, key }`, der Schlüssel erscheint einmal.
  - `/shelter` bleibt als Alias, `/shelter/key` gilt für beide Arten (neuer Alias `/area/key`).
  - Für Demo-Partner gilt `is_demo = 1`.
  - `GET /api/admin/partners` liefert `area_family_id` und `area_art`.
- **`buildMe`:** liefert `partner: { id, slug, name, typ }` auch für `art = 'partner'`.
- **`join`/`group` aus einem Partner-Bereich** → 400 (`requireHomeIdentity` erlaubt nur `zuhause`, prüfen).
- **Portal:**
  - `GET /api/partner-area/portal` → eigener Partner, voller Datensatz ohne Admin-Interna.
  - `PUT /api/partner-area/portal`:
    - erlaubt nur `portalTitel`, `portalText`, `farbe`, `website`, `spendenUrl`, `vermittlungUrl`, `kontaktEmail`, `kontaktTelefon`, `kontaktFormularUrl`, `kontaktformularAktiv`, `plz`;
    - andere Felder (name, slug, typ, status, istPartner) werden **ignoriert oder mit 400 abgewiesen** (bitte 400);
    - Validierung wie beim Admin (`validatePartner`-Teilmengen), `breederGuard`.
  - `POST /api/partner-area/portal/logo`: Logo wie beim Admin, inklusive Metadaten-Entfernung.
- **Öffentlich:** `GET /api/public/partners/:slug` enthält zusätzlich `kontakt_formular_url` und `kontaktformular_aktiv`.
- **Tests:**
  - Admin legt Bereiche beider Arten an;
  - Anmelden per Schlüssel → `art`/`partner` stimmen;
  - der Partner ändert erlaubte Felder, verbotene Felder → 400;
  - Zuchttext → 400;
  - ein fremder Bereich, Rudel oder Zuhause → 403 bzw. 404;
  - die Demo darf nicht schreiben.

- [ ] Commit: `feat: Partner-Bereich – Portal selbst pflegen`

---

### Task 2: Beiträge der Partner mit Freigabe (Server)

**Files:** `server/db.js`, `server/lib/promotions.js`, `server/routes/partnerArea.js`, `server/routes/adminMarketing.js`, `server/routes/discover.js`, Tests `server/test/partnerPosts.test.js`

- **Schema:** `promotions.freigabe` TEXT NOT NULL DEFAULT `'freigegeben'`, CHECK nicht per ALTER möglich, daher im Code validieren: `eingereicht | freigegeben | abgelehnt`. Dazu `promotions.ablehnungsgrund` TEXT und `promotions.erstellt_von_partner` INTEGER NOT NULL DEFAULT 0.
- **Partner:**
  - `GET/POST/PUT/DELETE /api/partner-area/posts` für eigene Beiträge (`partner_id` = eigener Partner).
  - `kennzeichnung` wird serverseitig **immer `Anzeige`**.
  - Erlaubter `bereich` je Partner-Typ:

    | Partner-Typ | erlaubter `bereich` |
    |---|---|
    | hundeschule | hundeschule |
    | tierheim, vermittlung | begleiter, unterstuetzen |
    | futter | futter |
    | sonstige | unterstuetzen, futter |

  - Anlegen und Ändern setzen `freigabe = 'eingereicht'`: Jede Änderung braucht eine neue Freigabe.
  - Bild-Upload wie bei den Admin-Empfehlungen.
  - Die Liste zeigt `freigabe`, `ablehnungsgrund` und Klicks (7 Tage und gesamt aus `link_clicks`).
- **Admin:**
  - `GET /api/admin/promotions?freigabe=eingereicht`;
  - `POST /api/admin/promotions/:id/freigeben`;
  - `POST /api/admin/promotions/:id/ablehnen { grund }` (Pflicht, höchstens 300 Zeichen).
  - Vom Admin angelegte Beiträge sind sofort `freigegeben`.
- **Anzeige:**
  - `/api/discover` zeigt nur `freigabe = 'freigegeben'` und `aktiv = 1`.
  - Neu `GET /api/public/partners/:slug/posts` liefert die freigegebenen aktiven Beiträge des Partners für sein Portal, mit `clickUrl`.
- **Tests:**
  - Der Partner legt einen Beitrag an → „eingereicht“ und nicht sichtbar in `discover` und im Portal.
  - Nach der Freigabe ist er sichtbar; eine Änderung setzt ihn zurück auf „eingereicht“.
  - Ablehnen mit Grund.
  - Verbotener Bereich → 400.
  - Die Kennzeichnung ist immer „Anzeige“, auch wenn anders gesendet.
  - Fremde Beiträge → 404.
  - Zuchttext → 400.

- [ ] Commit: `feat: Beiträge der Partner als Anzeige mit Freigabe durch den Admin`

---

### Task 3: „Schreib uns“ – Nachrichten an Partner, Umkreis mit Auffüllen, Demo (Server)

**Files:** `server/db.js`, `server/routes/partners.js`, `server/routes/partnerArea.js`, `server/lib/demoPack.js` + `server/seed/demo-partner-area.js` (neu), `server/routes/auth.js` (`/demo` mit `as: 'partner'`), `server/scripts/testenv-seed.js`, Tests `server/test/partnerMessages.test.js`

- **Schema:**

  ```sql
  CREATE TABLE IF NOT EXISTS partner_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    partner_id INTEGER NOT NULL,
    name TEXT, email TEXT, telefon TEXT,
    bezug TEXT,
    nachricht TEXT NOT NULL,
    gelesen_at TEXT,
    is_demo INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_partner_messages_partner ON partner_messages(partner_id, created_at);
  ```

- **`POST /api/public/partners/:slug/contact { name?, email?, telefon?, nachricht, bezugSlug?, website }`:**
  - Geht nur, wenn der Partner aktiv ist, `kontaktformular_aktiv = 1` hat und es für ihn einen Partner-Bereich gibt. Sonst 404, denn ohne Postfach gibt es keinen Empfänger.
  - **Schutz:** Honeypot `website` (`rejectHoneypot`) und ein eigener Limiter pro IP (5 pro Stunde, IPv6-Maske).
  - **Validierung:**
    - Nachricht 10–2000 Zeichen, Klartext, Steuer- und Bidi-Zeichen entfernt.
    - E-Mail oder Telefon ist Pflicht (Format prüfen), Name höchstens 80 Zeichen.
    - `bezugSlug` muss ein veröffentlichtes Tier dieses Partners sein, dann gilt `bezug` = „Anfrage zu {Name}“, sonst null.
  - **Antwort:** 201 `{ ok: true }`, ohne Echo der Daten.
  - **Keine Logs** mit Inhalten.
- **Partner-Postfach:**
  - `GET /api/partner-area/messages` (neueste zuerst, `unread` gezählt);
  - `POST /api/partner-area/messages/:id/read`;
  - `DELETE /api/partner-area/messages/:id`;
  - nur eigene Nachrichten;
  - Demo liest nur.
- **Aufbewahrung:** Beim Lesen des Postfachs und beim Schreiben werden Nachrichten, die älter als 180 Tage sind, gelöscht.
- **Umkreis mit Auffüllen für die öffentliche Partnerliste:**
  - Betroffen sind `POST /api/public/partners/near` und `GET` mit `plz`.
  - Liegen weniger als 5 Partner im Radius, werden die übrigen nach Entfernung mit `ausserhalb: true` angehängt, und die Antwort bekommt `fallback: true`.
  - Die Antwortform wird dafür zu `{ partners, fallback }`. Das ist eine **Breaking Change**, deshalb in dieser Task auch `client/src/api.js` `publicPartners` und `PartnersPage` minimal anpassen, damit nichts bricht.
- **Demo:**
  - Die „Hundeschule Pfotenglück“ bekommt einen Demo-Partner-Bereich (`art = 'partner'`, `is_demo`).
  - Sie hat zwei Beiträge: „Welpenkurs ab Oktober“ (freigegeben) und „Tag der offenen Tür“ (eingereicht).
  - Das Postfach hat zwei Demo-Nachrichten von fiktiven Absendern (`@example.org`), davon eine gelesen.
  - Das Demo-Tierheim bekommt eine Nachricht mit Bezug „Anfrage zu Pepper“.
- **Demo-Login:**
  - `POST /api/demo { as: 'partner' }` → Pfotenglück-Bereich.
  - Die Portal-Antwort meldet `partnerDemo: true`, wenn es einen Demo-Partner-Bereich gibt, analog zu `shelterDemo`.
- **Tests:**
  - Kontaktformular (Validierung, Honeypot, Rate-Limit, nur mit Postfach);
  - Postfach (nur eigene, lesen, löschen, 180-Tage-Löschung);
  - Auffüllen (weniger als 5 → angehängt);
  - Demo (Bereich, Beiträge, Nachrichten, Login als Partner, Ersetzen ohne Waisen).

- [ ] Commit(s): `feat: Schreib uns – Nachrichten an Partner, Umkreis mit Auffüllen, Demo-Partner-Bereich`

---

### Task 4: Partner-Bereich (Client)

**Files:** neu `client/src/pages/PartnerPortalEditPage.jsx`, `client/src/pages/PartnerPostsPage.jsx`, `client/src/pages/PartnerInboxPage.jsx`, `client/src/App.jsx`, `client/src/lib/areas.js`, `client/src/api.js`, Styles

- **Navigation:**
  - `art = 'partner'`: „Portal“ (`/portal`), „Beiträge“ (`/beitraege`), „Nachrichten“ (`/nachrichten`) mit Badge für ungelesene.
  - `art = 'tierheim'`: „Tiere“, „Portal“, „Nachrichten“, „Pinnwand“ („Beiträge“ als Reiter auf der Portal-Seite).
  - Start-Route: Partner `/portal`, Tierheim `/tiere`.
- **`PartnerPortalEditPage`:**
  - Formular für die erlaubten Felder (Farbe mit Kontrastanzeige wiederverwenden, Logo-Upload, Kontaktformular-URL, Schalter „Formular ‚Schreib uns‘ anbieten“);
  - Vorschau-Link „Portal ansehen“;
  - bei Tierheimen zusätzlich der Reiter „Beiträge“.
- **`PartnerPostsPage`:**
  - Liste mit Status-Chip (eingereicht, freigegeben, abgelehnt mit Grund) und Klickzahlen;
  - Formular (Titel, Text, Bereich nach Typ, URL, Zeitraum, Bild);
  - Hinweis: „Beiträge erscheinen nach Freigabe als ‚Anzeige‘ bei Menschen in eurer Nähe.“
- **`PartnerInboxPage`:**
  - Liste (neueste zuerst, ungelesen fett, Bezug-Chip);
  - Detail mit Antwort-Links (`mailto:` bzw. `tel:`) sowie „gelesen“ und „löschen“;
  - Hinweis: „Nachrichten werden nach 180 Tagen automatisch gelöscht.“;
  - Demo liest nur.
- **Tests:** Navigation je Art; Portal speichern (nur erlaubte Felder); Beitrag anlegen → „eingereicht“; Postfach lesen und löschen.

- [ ] Commit: `feat: Partner-Bereich – Portal, Beiträge, Nachrichten`

---

### Task 5: „Schreib uns“ auf Portal und Steckbrief, Admin-Freigabe, Auffüllen anzeigen (Client)

**Files:** neu `client/src/components/ContactPartnerForm.jsx`, `client/src/pages/PartnerPortalPage.jsx`, `client/src/pages/SteckbriefPage.jsx`, `client/src/components/AdminPromotions.jsx` bzw. neu `AdminPostReview.jsx`, `client/src/components/AdminPartners.jsx`, `client/src/pages/PartnersPage.jsx`, `client/src/pages/DiscoverPage.jsx` (falls schon da)

- **Kontakt auf Portal und Steckbrief:**
  - Abschnitt „Kontakt“ mit:
    - Knopf „Schreib uns“: öffnet `ContactPartnerForm` in einem Modal, nur wenn `kontaktformular_aktiv` und ein Bereich existiert; der Server meldet dazu `kontaktformular: true`;
    - Link „E-Mail“ (`mailto:`);
    - Link „Zum Kontaktformular von {Name}“ (extern, `noopener noreferrer`).
  - Vom Steckbrief aus kommt `bezugSlug` mit.
  - **Formular:** Name (optional), E-Mail, Telefon (eins Pflicht), Nachricht, Honeypot; Erfolg: „Danke! {Name} meldet sich bei dir.“; Datenschutz-Hinweis mit Link.
- **Portal:** Abschnitt „Aktuelles von {Name}“ mit den freigegebenen Beiträgen (Kennzeichnung „Anzeige“, `clickUrl`, `rel="sponsored noopener noreferrer"`).
- **Admin:**
  - Karte „Zur Freigabe“ mit eingereichten Beiträgen: Vorschau der Karte, „Freigeben“, „Ablehnen“ mit Grund.
  - Bei Partnern „Partner-Bereich anlegen“ bzw. „Schlüssel neu ausgeben“ für alle Typen (verallgemeinert aus dem Tierheim-Knopf).
- **Auffüllen anzeigen:** In Partnerliste und „Entdecken“ werden Einträge mit `ausserhalb` unter einer Zwischenüberschrift „Weiter weg“ gezeigt, bei `fallback` mit dem Hinweis „In eurer Nähe gibt es nur wenige – hier die nächsten weiteren.“
- **„Demo als Partner ansehen“** bei `partnerDemo`.
- **Datenschutzseite:** Abschnitt „Nachrichten an Partner“ (was gespeichert wird, wer es sieht, 180 Tage, kein E-Mail-Versand durch uns).
- **Tests:** Formular (Validierung, Honeypot-Feld, Erfolg); Portal-Beiträge; Admin-Freigabe; „Weiter weg“-Gruppe; Datenschutz-Text.

- [ ] Commit: `feat: Schreib uns auf Portal und Steckbrief, Freigabe im Admin, Umkreis mit Auffüllen`

---

### Task 6: Prüfung und Vorschau (Koordinator)

- [ ] README (Partner-Bereich, Beiträge mit Freigabe, Schreib uns), Roadmap.
- [ ] Abschluss-Review mit Schwerpunkt:
  - Missbrauch des Kontaktformulars, Spam-Schutz, personenbezogene Daten;
  - Rechte (Partner nur eigener Datensatz);
  - Freigabe-Umgehung.
- [ ] Browser-Prüfung: Demo als Partner, Beitrag einreichen, Admin-Freigabe, Nachricht senden und im Postfach lesen, Handy.
- [ ] Vorschau deployen.
