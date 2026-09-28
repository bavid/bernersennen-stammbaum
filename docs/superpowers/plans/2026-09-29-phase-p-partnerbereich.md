# Phase P – Partner-Zugang, Partner-Bereich und Kontakt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das zweite Produkt, das **Partner-Profil**:
- **Zugang:** Partner (Hundeschulen, Tierheime, Hundesalons, Betreuung …) bekommen vom Betreiber einen
  Partner-Zugang (Gutschein) und richten ihr Profil selbst ein.
- **Kundensicht:** Mit dem Umschalter „Bearbeiten | Kundensicht“ sehen sie jederzeit live, wie ihr Auftritt für
  Kunden aussieht.
- **Einblicke:** Sie zeigen Fotos mit Datum aus ihrer Arbeit.
- **Anzeigen:** Beiträge erscheinen nach Freigabe als „Anzeige“ im Umkreis.
- **Kontakt:** Partner sind über „Schreib uns“ (Postfach), E-Mail oder ihr eigenes Kontaktformular erreichbar.

**Architecture:**
- **Bereiche:**
  - Ein Partner-Bereich ist eine Familie mit `art = 'partner'` und `partner_id`.
  - Tierheime und Vermittlungen nutzen ihren Bereich `art = 'tierheim'`, der ebenfalls `partner_id` hat, und bekommen
    dieselben Partner-Funktionen.
- **Endpunkte:** Alle Partner-Endpunkte liegen unter `/api/partner-area/*`.
- **Kundensicht:**
  - Sie nutzt die echten Kunden-Komponenten (`DiscoverPage`, `PartnerPortalPage`, `SteckbriefPage`) mit
    eingespeisten Vorschau-Daten.
  - Diese Daten sind die Demo-„Entdecken“-Daten plus die eigene Karte und das eigene Portal, auch als Entwurf.

**Tech Stack:** Node 24, Express 4, better-sqlite3, React 18, Vite 6, node:test (höchstens eine Ebene `t.test`),
Vitest + jsdom.

**Grundlage:** [Konzept – Zwei Produkte, Phase P](../specs/2026-09-27-marketing-gutscheine-partner-design.md).

**Auslieferung:** **P1** = Tasks 1–7 (eigene Vorschau-Auslieferung), **P2** = Tasks 8–11.

**Regeln für alle Tasks:**
- **Git:**
  - Branch `staging`, nie pushen.
  - **Kein Co-Authored-By-Trailer.**
  - Nur die eigenen Dateien stagen.
  - Keine Worktrees und keine Junctions.
- **Daten:** Nie `server/data.db` anfassen.
- **Namen im Code:**
  - Fiktive Namen und Kontaktdaten (`example.org`).
  - **Nie** echte Namen von Menschen oder Tieren aus dem Bestand (die Liste führt der Koordinator).
- **Dienste:** Keine externen Dienste, **kein E-Mail-Versand**.
- **Züchter-Schutz** (`lib/breederGuard.js`) für alle Partner-Texte.
- **Demo-Sitzungen** lesen nur, alle Schreib-Endpunkte antworten 403 wie `requireAuth`.
- **Jede neue Funktion steckt auch in den Demo-Daten.**

**Bestehende Bausteine (lesen, bevor du anfängst):**
- **Gutscheine:**
  - `server/lib/vouchers.js` (`redeemVoucher`, `createBatch`, `voucherStatus`);
  - `server/routes/vouchers.js` (`/check`, `/redeem`).
- **Partner:**
  - `server/lib/partners.js` (`TYP_VALUES`, `validatePartner`, `publicPartner`, Slug-Erzeugung);
  - `server/routes/partners.js` (öffentlich);
  - `server/routes/admin.js` (Partner-Pflege, `/partners/:id/shelter` und `/shelter/key`).
- **Sitzung:**
  - `server/lib/context.js` (`ART`, `buildMe`);
  - `server/middleware/auth.js` (`requireSession`, `requireAuth`, `req.homeId`, `req.familyId`, `req.isDemo`).
- **Tiere und Steckbriefe:**
  - `server/routes/dogs.js` (`VERMITTLUNG_STATUS_VALUES`, `PUBLISHABLE_STATUS`);
  - `server/routes/publicAnimals.js`;
  - `server/lib/publicMedia.js` (öffentliche Fotos, Metadaten-Entfernung).
- **Entdecken:** `server/routes/discover.js`.
- **Demo:** `server/lib/demoPack.js`, `server/seed/demo-partners.js`, `server/seed/demo-shelter.js`,
  `server/routes/auth.js` (`POST /api/demo` mit `as`).
- **Client:**
  - `client/src/App.jsx` (Navigation je `art`), `client/src/lib/areas.js` (`startRoute`), `client/src/api.js`;
  - `RedeemForm`, `KeyReveal`, `PartnerPortalPage`, `SteckbriefPage`, `DiscoverPage` (aus Phase 3), `AdminPartners`,
    `AdminVouchers`, `ShelterAnimalsPage`, `VermittlungStatusPanel`.

---

## P1 — Partner-Zugang und Profil

### Task 1: Schema und Bereichsart `partner` (Server)

**Files:** `server/db.js`, `server/lib/partners.js`, `server/lib/context.js`, `server/routes/admin.js`,
`server/routes/dogs.js`, neu `server/lib/vermittlung.js`, `server/routes/publicAnimals.js`,
`server/lib/publicMedia.js`, Tests `server/test/partnerSchema.test.js`, bestehende Tests anpassen

- **Partner-Typen:**
  - `hundesalon` und `betreuung` kommen dazu.
  - Der CHECK in `CREATE TABLE partners` lässt sich per ALTER nicht ändern. Deshalb wird die Tabelle **einmalig
    neu aufgebaut**, wenn `sqlite_master.sql` für `partners` noch kein `'hundesalon'` enthält:
    1. `PRAGMA foreign_keys = OFF` (außerhalb der Transaktion).
    2. In einer Transaktion: `partners_neu` mit allen heutigen Spalten und neuem CHECK anlegen, Daten kopieren,
       `partners` löschen, `partners_neu` umbenennen, Indizes neu anlegen.
    3. `PRAGMA foreign_key_check`, danach `foreign_keys = ON`.
  - Das frische `CREATE TABLE` enthält die neuen Typen gleich mit.
  - `TYP_VALUES` wird ergänzt.
  - **Test:** Eine alte DB mit altem CHECK und Daten wird migriert, die Daten bleiben erhalten, ein zweiter Start
    ändert nichts.
- **Neue Spalten `partners`:**
  - `gesperrt INTEGER NOT NULL DEFAULT 0`: Admin-Sperre. Öffentlich gilt „gesperrt“ wie „nicht aktiv“.
  - `kontakt_formular_url TEXT`: http(s), Prüfung wie `website`.
  - `kontaktformular_aktiv INTEGER NOT NULL DEFAULT 1`
- **Neue Spalten `voucher_batches`:**
  - `zweck TEXT NOT NULL DEFAULT 'chronik'` mit den Werten `chronik` oder `partnerzugang`, im Code geprüft.
  - `partner_typ TEXT`: optionale Vorgabe für Partner-Zugänge.
- **Vermittlungsstatus `pausiert`:**
  - Neu in `lib/vermittlung.js` als einzige Quelle:
    - `VERMITTLUNG_STATUS = ['in_vermittlung','reserviert','pausiert','vermittelt']`;
    - `PUBLISHABLE_STATUS = ['in_vermittlung','reserviert','pausiert']`;
    - `publishableSql(alias)`;
    - `LISTED_STATUS = ['in_vermittlung','reserviert']` für „Entdecken“ und Listen, pausierte Tiere erscheinen dort
      nicht.
  - Alle fest verdrahteten `IN ('in_vermittlung','reserviert')` in `dogs.js`, `publicAnimals.js`,
    `publicMedia.js` und `discover.js` darauf umstellen.
  - Übergabe-Gutscheine gehen weiter nur aus `reserviert`.
- **Bereichsart:**
  - `ART.partner = 'partner'` in `context.js`.
  - `buildMe` liefert `partner: { id, slug, name, typ, status, gesperrt }` für `art` in `('partner','tierheim')`.
  - Aus einem Partner-Bereich heraus sind Beitreten, Gründen und `claim` gesperrt (400). Bitte prüfen, ob
    `requireHomeIdentity` o. ä. das schon abdeckt, sonst ergänzen.
  - `POST /api/dogs` in einem Bereich `art = 'partner'` → 400 „Partner-Bereiche haben keine Tiere“.
- **Admin:**
  - `POST /api/admin/partners/:id/area`: Für `tierheim` und `vermittlung` entsteht `art = 'tierheim'`, sonst
    `art = 'partner'`. Existiert schon ein Bereich → 409. `is_demo` kommt vom Partner. Antwort `{ familyId, key }`.
  - `POST /api/admin/partners/:id/area/key`: neuer Schlüssel, `auth_epoch + 1`.
  - Die alten Pfade `/shelter` und `/shelter/key` bleiben als Aliase.
  - `GET /api/admin/partners` liefert `area_family_id`, `area_art` und `gesperrt`.
  - `PUT /api/admin/partners/:id` darf `gesperrt` setzen. `gesperrt = 1` setzt zusätzlich `status = 'pausiert'`.
- **Tests:**
  - Migration;
  - neue Typen anlegen;
  - `pausiert` → Steckbrief bleibt öffentlich, erscheint aber nicht in `discover`;
  - Bereich für eine Hundeschule anlegen und damit anmelden → `me.art === 'partner'`, `me.partner.slug`;
  - Beitreten und Tier anlegen aus einem Partner-Bereich → 400;
  - der Alias `/shelter` funktioniert weiter.

- [ ] Commit: `feat: Partner-Bereiche für alle Partner-Typen, Hundesalon und Betreuung, Status Pausiert`

### Task 2: Partner-Zugang per Gutschein und Einrichtung (Server)

**Files:** `server/lib/vouchers.js`, `server/routes/vouchers.js`, `server/routes/admin.js`, `server/lib/partners.js`,
Tests `server/test/partnerAccess.test.js`

- **Admin-Stapel:**
  - `POST /api/admin/voucher-batches` nimmt zusätzlich `zweck` (`chronik`, Standard, oder `partnerzugang`),
    optional `partnerTyp` und optional `partnerId`.
  - Mit `partnerId` gilt `size = 1`, und der Partner darf noch keinen Bereich haben (sonst 409).
  - `kind` bleibt `admin`.
  - Die Liste zeigt `zweck`.
- **`POST /api/vouchers/check`:**
  - Bei `zweck = 'partnerzugang'` enthält die Antwort zusätzlich `zweck: 'partnerzugang'`, `partnerTyp` (falls
    vorgegeben) und `partnerName` (falls an einen Partner gebunden).
  - Nie Codes oder interne IDs.
- **`POST /api/vouchers/redeem` für Partner-Zugänge:**
  - **Eingaben:** `{ code, name, typ, plz, username?, password?, email? }`.
  - **Prüfung:**
    - Name wie Partner-Name (Länge, Züchter-Schutz);
    - Typ aus `TYP_VALUES`, eine Vorgabe aus dem Stapel gewinnt;
    - PLZ muss es geben (`lib/geo.js`), daraus Ort, `lat` und `lon`.
  - **Ungebunden:**
    - Neuer Partner mit `status = 'entwurf'`, `ist_partner = 1` und eindeutigem Slug aus dem Namen.
    - Dazu der Bereich: `art = 'tierheim'` bei Tierheim oder Vermittlung, sonst `'partner'`. Der Bereich hat
      `access_key_hash = codeHash`, `voucher_id`, `partner_id` und `legacy_password = 0`.
  - **Gebunden:** Der vorhandene Partner wird genommen, Name, Typ und PLZ aus der Anfrage werden ignoriert. Nur der
    Bereich entsteht.
  - Alles in **einer Transaktion** mit derselben Einlöse-Sperre wie heute.
  - Die Antwort entspricht der heutigen: `buildMe` plus `key`.
- **`POST /api/vouchers/claim`** mit einem Partner-Zugang → 400.
- **Tests:**
  - Stapel anlegen;
  - `check` liefert `zweck`;
  - Einlösen legt Partner und Bereich an (Hundeschule → `partner`, Tierheim → `tierheim`);
  - gebundener Zugang;
  - Züchtername → 400 und der Gutschein bleibt offen;
  - unbekannte PLZ → 400;
  - doppelt einlösen → 410;
  - ein Kunden-Gutschein verhält sich unverändert.

- [ ] Commit: `feat: Partner-Zugang per Gutschein – Partner richten ihr Profil selbst ein`

### Task 3: Profil selbst pflegen, Veröffentlichen, Einblicke, Vorschau-Daten (Server)

**Files:** neu `server/routes/partnerArea.js` (in `server/app.js` unter `/api/partner-area` einhängen), neu
`server/lib/einblicke.js`, `server/db.js`, `server/routes/partners.js`, `server/routes/discover.js`,
`server/routes/admin.js`, Tests `server/test/partnerArea.test.js`, `server/test/einblicke.test.js`

- **Middleware `requirePartnerArea`:**
  - Die Sitzung muss vorhanden sein, der aktive Bereich muss `art` in `('partner','tierheim')` mit `partner_id`
    haben, sonst 403.
  - Schreiben in der Demo → 403.
  - Setzt `req.partner`.
- **Profil:**
  - `GET /profile` liefert den eigenen Partner:
    - alle öffentlichen Felder;
    - `status`, `gesperrt`, `slug`, `typ`;
    - `vollstaendig: { ok, fehlt: [...] }`. Pflicht für „aktiv“: Name, PLZ und Portal-Text (mindestens 40 Zeichen).
      Empfohlen: Logo, Kontakt (E-Mail, Telefon oder Kontaktformular) und mindestens ein Einblick.
  - `PUT /profile`:
    - erlaubt nur `name`, `portalTitel`, `portalText`, `farbe`, `website`, `spendenUrl`, `vermittlungUrl`,
      `kontaktEmail`, `kontaktTelefon`, `kontaktFormularUrl`, `kontaktformularAktiv` und `plz`;
    - jedes andere Feld (`slug`, `typ`, `status`, `istPartner`, `gesperrt`) → **400**;
    - Prüfung mit den vorhandenen Validierungen und dem Züchter-Schutz;
    - der Slug bleibt unverändert.
  - `POST /profile/logo`: wie beim Admin-Logo, inklusive Metadaten-Entfernung.
  - `POST /profile/publish { aktiv: true|false }`:
    - Bei `gesperrt` → 403 „Gesperrt – bitte meldet euch beim Betreiber.“
    - `aktiv: true` ohne `vollstaendig.ok` → 400 mit der `fehlt`-Liste.
    - Sonst `status` auf `aktiv` bzw. `pausiert`.
- **Einblicke:**
  - **Tabelle:**

    ```sql
    CREATE TABLE IF NOT EXISTS partner_einblicke (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      partner_id INTEGER NOT NULL,
      foto_url TEXT NOT NULL,
      datum TEXT NOT NULL,              -- YYYY-MM-DD, nicht in der Zukunft
      text TEXT,                        -- höchstens 300 Zeichen, Klartext
      einwilligung INTEGER NOT NULL,    -- muss 1 sein
      ausgeblendet INTEGER NOT NULL DEFAULT 0,  -- Admin
      is_demo INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_einblicke_partner ON partner_einblicke(partner_id, datum DESC);
    ```

  - **Endpunkte:**
    - `GET /einblicke`: eigene, neueste zuerst, mit `ausgeblendet`.
    - `POST /einblicke` (multipart: `foto`, `datum`, `text`, `einwilligung`):
      - Foto wie bei den öffentlichen Tierfotos (MIME-Whitelist, Größe, EXIF/PNG-Metadaten entfernen, Ablage unter
        `/public-media`);
      - ohne `einwilligung = true` → 400;
      - Züchter-Schutz auf den Text;
      - bei 60 vorhandenen Einblicken → 409 „Höchstens 60 Einblicke – bitte ältere löschen.“
    - `PUT /einblicke/:id` ändert `datum` und `text`.
    - `DELETE /einblicke/:id` entfernt auch die Datei.
    - Nur eigene Einblicke, sonst 404.
  - **Öffentlich:**
    - `GET /api/public/partners/:slug` enthält `einblicke` (höchstens 60, nicht ausgeblendete, neueste zuerst:
      `{ id, fotoUrl, datum, text }`).
    - Partner-Karten in der Partnerliste und in `discover` bekommen `teaserFoto` (neuester sichtbarer Einblick,
      sonst `null`).
  - **Admin:** `GET /api/admin/einblicke?partnerId=` und `POST /api/admin/einblicke/:id/ausblenden { ausgeblendet }`.
- **Vorschau-Daten (Kundensicht):**
  - `GET /preview/portal`:
    - dieselbe Form wie `GET /api/public/partners/:slug`, aber **unabhängig vom Status** (auch Entwurf, pausiert,
      gesperrt);
    - zusätzlich `vorschau: true` und `status`;
    - die Funktion zum Aufbau des öffentlichen Portals wird dafür aus `routes/partners.js` in eine Lib-Funktion
      gezogen, damit beide dieselbe Form liefern.
  - `POST /preview/discover { plz?, radius? }`:
    - **Grundlage** ist die Antwort, die eine Demo-Sitzung bekäme. Dazu `routes/discover.js` so umbauen, dass eine
      Funktion `buildDiscover({ isDemo, center, radiusKm })` exportiert wird und die Route sie nur aufruft.
    - Die **eigene Partner-Karte** kommt an die erste Stelle des passenden Abschnitts, mit `vorschau: true`:
      - `hundeschule` → `hundeschulen`;
      - `tierheim` und `vermittlung` → `begleiter.partner`, dazu die eigenen gelisteten Tiere vorn in
        `begleiter.tiere`;
      - `hundesalon` und `betreuung` → Abschnitt `salon` (ab P2; in P1 vorerst in `hundeschulen`, mit `// P2`
        markieren);
      - `futter` und `sonstige` → `unterstuetzen.partnerSpenden` bzw. auslassen.
    - Eine eventuell vorhandene echte Karte desselben Partners wird entfernt, damit sie nicht doppelt erscheint.
  - `GET /preview/animals/:dogId`: Steckbrief-Form für ein eigenes Tier, auch unveröffentlicht. Fremde Tiere → 404.
- **Tests:**
  - erlaubte und verbotene Profilfelder;
  - Züchter-Schutz;
  - Veröffentlichen unvollständig → 400 mit `fehlt`, vollständig → aktiv, gesperrt → 403;
  - Einblicke: CRUD, Einwilligung Pflicht, Grenze 60, fremder Einblick → 404, ausgeblendet erscheint nicht
    öffentlich, `teaserFoto`;
  - Vorschau:
    - das Portal liefert auch den Entwurf, und das öffentliche Portal liefert ihn weiter nicht (404);
    - `discover` enthält die eigene Karte an erster Stelle mit `vorschau`;
    - `preview/animals` gilt nur für eigene Tiere;
  - aus Rudel, Zuhause oder einem fremden Partner-Bereich → 403;
  - Demo schreibt nicht.

- [ ] Commit(s): `feat: Partner pflegen Profil und Einblicke selbst, Vorschau-Daten für die Kundensicht`

### Task 4: Demo für Partner (Server)

**Files:** neu `server/seed/demo-partner-area.js`, `server/seed/demo-partners.js`, `server/lib/demoPack.js`,
`server/routes/auth.js`, `server/scripts/testenv-seed.js`, Tests `server/test/demoPartnerArea.test.js`

- **Demo-Bereiche:**
  - „Hundeschule Pfotenglück“ (vorhandener Demo-Partner) bekommt einen Demo-Partner-Bereich (`art = 'partner'`,
    `is_demo = 1`) mit 4 Einblicken („Welpengruppe am Samstag“, „Rückruftraining am Deich“ …).
  - Neuer Demo-Partner **„Hundesalon Wuschelglück“** (`hundesalon`, aktiv, PLZ im Demo-Gebiet, Akzentfarbe) mit
    Bereich und 5 Einblicken („Frisch getrimmt: Pudeldame Flocke“ …).
  - Das Demo-Tierheim bekommt 2 Einblicke.
- **Fotos:** die vorhandenen Demo-Fotos aus dem Demo-Pack wiederverwenden, wie `demo-shelter.js` sie bereitstellt.
  Keine neuen Binärdateien ins Repo, wenn es sich vermeiden lässt.
- **Demo-Login:** `POST /api/demo { as: 'partner' }` → Pfotenglück-Bereich, `{ as: 'partner', slug }` für einen
  bestimmten Demo-Partner-Bereich (nur `is_demo`).
- **Portal:** Die Portal-Antwort meldet `partnerDemo: true`, wenn es für diesen Demo-Partner einen Demo-Bereich
  gibt, analog zu `shelterDemo`.
- **Beim Ersetzen:** `replaceDemoPack` ersetzt alles mit, ohne Waisen (Einblicke, Dateien, Bereiche). Echte Daten
  bleiben unberührt.
- **Testumgebung:** `testenv-seed.js` legt zusätzlich einen Stapel „Partner-Zugang (Test)“ mit 3 Codes an und
  gibt ihn aus, so wie die übrigen Test-Codes.
- **Tests:**
  - Die Bereiche und Einblicke gibt es.
  - Der Login als Partner liefert `art = 'partner'`.
  - Ersetzen hinterlässt keine Waisen.
  - Echte Daten bleiben unverändert.

- [ ] Commit: `feat: Demo-Partner-Bereiche mit Einblicken, Hundesalon Wuschelglück, Demo als Partner`

### Task 5: Einlösen als Partner und Partner-Bereich „Bearbeiten“ (Client)

**Files:** `client/src/components/RedeemForm.jsx` (bzw. die `/v`-Seite), neu
`client/src/components/PartnerSetupFields.jsx`, neu `client/src/pages/PartnerProfilePage.jsx`, neu
`client/src/components/EinblickeEditor.jsx`, `client/src/App.jsx`, `client/src/lib/areas.js`, `client/src/api.js`,
`client/src/components/ShelterAnimalsPage.jsx`/`VermittlungStatusPanel.jsx` (Status „Pausiert“), Styles, Tests

- **Einlösen (`/v`):**
  - Liefert `check` `zweck === 'partnerzugang'`, zeigt die Seite „Partner-Profil einrichten“ statt „Meine
    Chronik anlegen“:
    - Felder Name, Typ (Auswahl ohne Züchter; bei einer Vorgabe fest), PLZ und optional Benutzer und Passwort;
    - gebunden: nur „Willkommen, {partnerName}“ und die Zugangsdaten.
  - Danach `KeyReveal` und weiter zum Partner-Bereich.
- **Navigation:**
  - `art = 'partner'`: „Profil“ (`/profil`) und „Zugang“ (vorhandene Zugangs-Einstellungen). In P2 kommen
    „Beiträge“ und „Nachrichten“ dazu.
  - `art = 'tierheim'`: vorhandene Einträge plus „Profil“, höchstens 5 Einträge in der mobilen Leiste.
  - `startRoute`: `partner` → `/profil`.
- **Umschalter „Bearbeiten | Kundensicht“:**
  - ein Segment-Schalter oben in jedem Partner- und Tierheim-Bereich, immer sichtbar, als echte Links;
  - „Bearbeiten“ führt auf die zuletzt benutzte Bearbeiten-Seite, „Kundensicht“ auf `/kundensicht` (Task 6);
  - in der Tastatur-Reihenfolge direkt nach dem Kopf, `aria-current` für den aktiven Teil.
- **`PartnerProfilePage` mit den Reitern „Angaben“ und „Einblicke“:**
  - **Status-Karte:**
    - „Entwurf / Aktiv / Pausiert / Gesperrt“;
    - die Checkliste aus `vollstaendig.fehlt` („Noch offen: Portal-Text, PLZ …“);
    - die Knöpfe „Veröffentlichen“ bzw. „Pausieren“; bei „gesperrt“ nur ein Hinweis.
  - **Formular „Angaben“:**
    - alle erlaubten Felder, gruppiert: Auftritt (Name, Titel, Text, Farbe mit der vorhandenen Kontrastanzeige,
      Logo), Links (Website, Spenden, Vermittlung) und Kontakt (E-Mail, Telefon, Kontaktformular-URL, Schalter
      „Formular ‚Schreib uns‘ anbieten“ mit dem Hinweis „kommt bald“ bis P2);
    - Fehler je Feld.
  - **Reiter „Einblicke“ (`EinblickeEditor`):**
    - Raster mit Foto, Datum und Text, bearbeiten und löschen (mit Bestätigung);
    - Formular „Neuer Einblick“ mit Foto, Datum (Standard heute), Text (Zähler 300) und dem Pflicht-Häkchen
      „Die Halterinnen und Halter der gezeigten Tiere sind einverstanden.“;
    - Hinweis „Bitte keine Personen, Nachnamen oder Adressen zeigen.“;
    - der Zähler „x von 60“.
  - **Hinweis:** „Privat eine eigene Chronik führen? Dafür gibt es Kunden-Gutscheine.“
  - **Demo:** alles sichtbar, Schreib-Knöpfe gesperrt mit „In der Demo nicht möglich.“
- **Tierheim-Status:**
  - Beschriftungen „Verfügbar“ (`in_vermittlung`), „Reserviert“, „Pausiert (on hold)“ und „Vermittelt“;
  - Filter-Chip „Pausiert“;
  - `VermittlungStatusPanel` mit der neuen Option;
  - die Bestätigung beim Verlassen von „Reserviert“ bleibt.
- **Tests:**
  - Einlösen als Partner (Felder, Typ-Vorgabe, gebunden);
  - Navigation je `art`;
  - Umschalter;
  - Profil speichern mit Feldfehler;
  - Veröffentlichen mit fehlenden Angaben zeigt die Checkliste;
  - Einblick ohne Häkchen wird nicht gesendet;
  - Demo gesperrt;
  - Status „Pausiert“.

- [ ] Commit: `feat: Partner-Profil einrichten und bearbeiten, Einblicke, Status Pausiert`

### Task 6: Kundensicht, Einblicke auf dem Portal, Admin (Client)

**Files:** neu `client/src/pages/CustomerPreviewPage.jsx`, neu `client/src/components/PreviewFrame.jsx`,
`client/src/pages/DiscoverPage.jsx`, `client/src/pages/PartnerPortalPage.jsx`, `client/src/pages/SteckbriefPage.jsx`,
`client/src/components/PartnerCard.jsx`, neu `client/src/components/EinblickeGallery.jsx`,
`client/src/components/AdminVouchers.jsx`, `client/src/components/AdminPartners.jsx`, `client/src/api.js`, Tests

- **Datenquelle einspeisbar:** `DiscoverPage`, `PartnerPortalPage` und `SteckbriefPage` bekommen eine optionale
  Datenquelle als Prop, zum Beispiel `load`, oder `data` plus `preview`. Ohne diese Prop verhalten sie sich exakt
  wie heute (Tests grün lassen).
- **`/kundensicht` (`CustomerPreviewPage`):**
  - **Band** oben: „Vorschau – so sehen Kunden euer Profil“, bei Entwurf oder Pausiert zusätzlich „Noch nicht
    öffentlich sichtbar.“
  - **Reiter:**
    - „Entdecken (Beispiel-Kunde)“;
    - „Euer Portal“;
    - bei Tierheimen „Steckbriefe“: Auswahl eigener Tiere mit Steckbrief-Vorschau.
  - **`PreviewFrame`:**
    - ein Rahmen, der eine Kunden-Oberfläche andeutet, mit Kopf „Zuhause am Deich (Beispiel)“ und der unteren
      Kunden-Navigation;
    - die Navigation ist nur Deko und nicht fokussierbar, außer „Entdecken“;
    - auf dem Handy volle Breite, am Desktop Telefonbreite zentriert.
  - Links in der Vorschau führen nicht aus dem Bereich hinaus: `clickUrl` und externe Links sind deaktiviert, mit dem
    Tooltip „In der Vorschau deaktiviert“.
  - Die eigene Karte trägt ein Badge „Das seid ihr“.
- **Portal:**
  - Abschnitt „Einblicke“ als `EinblickeGallery` (Raster, Datum deutsch, Text; Klick öffnet eine größere Ansicht
    mit Tastatur und Escape);
  - Status „Pausiert“ bei Tieren als Badge;
  - „Demo als Partner ansehen“ bei `partnerDemo`.
- **Karten:** `PartnerCard` zeigt `teaserFoto`, falls vorhanden (feste Größe, `loading="lazy"`, Alt-Text
  „Einblick bei {Name}“).
- **Steckbrief:** `pausiert` → Hinweis „Gerade nicht vermittelbar – schau bald wieder vorbei.“
- **Admin:**
  - Neuer Stapel mit der Auswahl „Zweck: Kunden-Gutscheine | Partner-Zugang“ und bei Partner-Zugang optional Typ
    oder Partner.
  - Die Stapel-Liste zeigt den Zweck.
  - In der Partnerliste:
    - „Bereich anlegen“ bzw. „Schlüssel neu ausgeben“ für alle Typen, verallgemeinert aus dem Tierheim-Knopf;
    - „Sperren / Entsperren“ mit Bestätigung;
    - „Einblicke“ (Liste mit Ausblenden-Schalter).
- **Tests:**
  - die Seiten verhalten sich ohne Prop unverändert;
  - die Kundensicht rendert die Demo-Daten mit der eigenen Karte zuerst und dem Band;
  - externe Links sind deaktiviert;
  - Galerie mit Tastatur;
  - `teaserFoto`;
  - Admin: Zweck-Auswahl, Sperren mit Bestätigung, Einblick ausblenden.

- [ ] Commit: `feat: Kundensicht für Partner, Einblicke auf dem Portal, Partner-Zugänge und Sperre im Admin`

### Task 7: P1 prüfen und ausliefern (Koordinator)

- [ ] README (zwei Produkte, Partner-Zugang, Kundensicht, Einblicke), Datenschutzseite (Einblicke mit Einwilligung
  der Halter), Roadmap.
- [ ] Abschluss-Review mit diesen Schwerpunkten:
  - Rechte: Partner nur eigener Datensatz, Demo nur lesen;
  - Umgehung des Züchter-Schutzes;
  - Upload-Sicherheit;
  - Entwurf nie öffentlich;
  - Migration der Partner-Tabelle.
- [ ] Browser-Prüfung:
  - einen Partner-Zugang einlösen;
  - Profil ausfüllen, veröffentlichen, Einblick hochladen;
  - Kundensicht;
  - Demo als Partner;
  - Handy und dunkles Design.
- [ ] Vorschau deployen und Showcase auffrischen.

---

## P2 — Anzeigen, Kontakt und Postfach

### Task 8: Beiträge der Partner mit Freigabe (Server)

**Files:** `server/db.js`, `server/lib/promotions.js`, `server/routes/partnerArea.js`,
`server/routes/adminMarketing.js`, `server/routes/discover.js`, Tests `server/test/partnerPosts.test.js`

- **Schema:**
  - `promotions.freigabe TEXT NOT NULL DEFAULT 'freigegeben'` mit den Werten `eingereicht`, `freigegeben` oder
    `abgelehnt`, im Code geprüft;
  - `promotions.ablehnungsgrund TEXT`;
  - `promotions.erstellt_von_partner INTEGER NOT NULL DEFAULT 0`.
- **Partner:**
  - `GET/POST/PUT/DELETE /api/partner-area/posts` für eigene Beiträge.
  - `kennzeichnung` ist serverseitig **immer „Anzeige“**.
  - Erlaubter `bereich` je Typ:

    | Typ | erlaubter `bereich` |
    |---|---|
    | hundeschule | hundeschule |
    | hundesalon, betreuung | salon |
    | tierheim, vermittlung | begleiter, unterstuetzen |
    | futter | futter |
    | sonstige | unterstuetzen, futter |

    Den Bereich `salon` in `promotions` zulassen.
  - Anlegen und Ändern setzen `freigabe = 'eingereicht'`.
  - Bild-Upload wie bei den Admin-Empfehlungen.
  - Die Liste zeigt `freigabe`, `ablehnungsgrund` und die Klicks (7 Tage und gesamt).
- **Admin:**
  - `GET /api/admin/promotions?freigabe=eingereicht`;
  - `POST /api/admin/promotions/:id/freigeben`;
  - `POST /api/admin/promotions/:id/ablehnen { grund }` (Pflicht, höchstens 300 Zeichen).
  - Vom Admin angelegte Beiträge sind sofort freigegeben.
- **Anzeige:**
  - `discover` und das Portal zeigen nur `freigabe = 'freigegeben'` und `aktiv`.
  - Neu `GET /api/public/partners/:slug/posts` mit `clickUrl`.
  - Die Kundensicht (`/preview/discover`) zeigt eigene eingereichte Beiträge zusätzlich, mit `vorschau: true` und
    dem Status.
- **Tests:**
  - Einreichen → unsichtbar, Freigabe → sichtbar, eine Änderung setzt zurück, Ablehnen mit Grund;
  - verbotener Bereich → 400;
  - die Kennzeichnung ist immer „Anzeige“;
  - fremde Beiträge → 404;
  - Züchter-Schutz.

- [ ] Commit: `feat: Beiträge der Partner als Anzeige mit Freigabe durch den Admin`

### Task 9: „Schreib uns“, Postfach, Salon & Betreuung, Umkreis mit Auffüllen (Server)

**Files:** `server/db.js`, `server/routes/partners.js`, `server/routes/partnerArea.js`, `server/routes/discover.js`,
Demo-Seeds, Tests `server/test/partnerMessages.test.js`

- **Tabelle `partner_messages`:**

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
  - Geht nur, wenn der Partner aktiv und nicht gesperrt ist, `kontaktformular_aktiv = 1` hat und einen Bereich
    besitzt. Sonst 404.
  - **Schutz:** Honeypot `website` (`rejectHoneypot`) und ein eigener Limiter von 5 pro Stunde je IP (IPv6-Maske
    wie `discoverLimiter`).
  - **Prüfung:**
    - Nachricht 10–2000 Zeichen, Steuer- und Bidi-Zeichen entfernt;
    - E-Mail oder Telefon ist Pflicht, mit Formatprüfung;
    - Name höchstens 80 Zeichen;
    - `bezugSlug` muss ein veröffentlichtes Tier dieses Partners sein, dann gilt `bezug` = „Anfrage zu {Name}“.
  - **Antwort:** 201 `{ ok: true }` ohne Echo.
  - **Keine Logs** mit Inhalten.
- **Postfach:**
  - `GET /api/partner-area/messages` (neueste zuerst, `unread`);
  - `POST /messages/:id/read`;
  - `DELETE /messages/:id`;
  - nur eigene;
  - Demo nur lesen.
  - Beim Lesen und Schreiben werden Nachrichten gelöscht, die älter als 180 Tage sind.
- **`me.partner.unread`:** Anzahl ungelesener Nachrichten, für das Badge in der Navigation.
- **„Entdecken“:** neuer Abschnitt `salon` für die Partner-Typen `hundesalon` und `betreuung` plus Beiträge mit
  `bereich = 'salon'`, mit derselben Umkreis- und Auffüll-Logik. Die Vorschau-Einordnung aus Task 3 auf `salon`
  umstellen.
- **Öffentliche Partnerliste:**
  - Betroffen sind `POST /api/public/partners/near` und `GET` mit `plz`.
  - Mit weniger als 5 im Radius werden die nächsten weiteren (höchstens 20) mit `ausserhalb: true` angehängt.
  - Die Antwort wird zu `{ partners, fallback }`. `client/src/api.js` und `PartnersPage` in dieser Task minimal
    anpassen, damit nichts bricht.
- **Demo:**
  - Pfotenglück: „Welpenkurs ab Oktober“ (freigegeben) und „Tag der offenen Tür“ (eingereicht).
  - Wuschelglück: „Herbst-Pflegetag“ (freigegeben).
  - Postfach Pfotenglück: 2 Nachrichten (`@example.org`), eine davon gelesen.
  - Demo-Tierheim: 1 Nachricht „Anfrage zu Pepper“.
- **Tests:**
  - Kontakt: Prüfung, Honeypot, Rate-Limit, nur mit Postfach, `bezug`;
  - Postfach: nur eigene, lesen, löschen, 180 Tage;
  - der Abschnitt `salon`;
  - Auffüllen in der Partnerliste;
  - Demo.

- [ ] Commit(s): `feat: Schreib uns mit Postfach, Salon & Betreuung in Entdecken, Partnerliste füllt dünnen Umkreis auf`

### Task 10: Beiträge, Postfach, „Schreib uns“, Freigabe (Client)

**Files:** neu `client/src/pages/PartnerPostsPage.jsx`, neu `client/src/pages/PartnerInboxPage.jsx`, neu
`client/src/components/ContactPartnerForm.jsx`, `client/src/pages/PartnerPortalPage.jsx`,
`client/src/pages/SteckbriefPage.jsx`, `client/src/pages/DiscoverPage.jsx`, `client/src/pages/PartnersPage.jsx`,
`client/src/pages/LegalPage.jsx`, `client/src/pages/PartnerProfilePage.jsx`, Admin-Komponenten, `App.jsx`,
`api.js`, Tests

- **Navigation im Partner-Bereich:**
  - „Profil“, „Beiträge“ und „Nachrichten“ (Badge `unread`);
  - im Tierheim „Nachrichten“ statt des am wenigsten genutzten Eintrags, oder „Beiträge“ als Reiter im Profil,
    damit höchstens 5 Einträge bleiben.
- **`PartnerPostsPage`:**
  - Liste mit Status-Chip (eingereicht, freigegeben, abgelehnt mit Grund) und Klickzahlen;
  - Formular für Titel, Text, Bereich nach Typ, URL, Zeitraum und Bild;
  - Hinweis „Beiträge erscheinen nach Freigabe als ‚Anzeige‘ bei Menschen in eurer Nähe.“
- **`PartnerInboxPage`:**
  - Liste (neueste zuerst, ungelesen fett, Bezug-Chip);
  - Detail mit `mailto:`- und `tel:`-Antwortlinks sowie „gelesen“ und „löschen“;
  - Hinweis zu den 180 Tagen;
  - Demo nur lesen.
- **Portal und Steckbrief:**
  - Abschnitt „Kontakt“ mit:
    - „Schreib uns“, als Modal mit `ContactPartnerForm`, nur wenn der Server `kontaktformular: true` meldet;
    - „E-Mail“ (`mailto:`);
    - „Zum Kontaktformular von {Name}“, extern mit `noopener noreferrer`.
  - Vom Steckbrief aus kommt `bezugSlug` mit.
  - Portal: Abschnitt „Aktuelles von {Name}“ mit den freigegebenen Beiträgen (Badge „Anzeige“,
    `rel="sponsored noopener noreferrer"`).
- **Formular:**
  - Name (optional), E-Mail oder Telefon (eins Pflicht), Nachricht, Honeypot;
  - Erfolg: „Danke! {Name} meldet sich bei dir.“;
  - Link zum Datenschutz.
- **Profil:** Den Schalter „Schreib uns anbieten“ scharf schalten, den Hinweis „kommt bald“ entfernen.
- **„Entdecken“:** Kapitel „Salon & Betreuung“. Einträge mit `ausserhalb` stehen unter „Weiter weg“, bei
  `fallback` mit dem Hinweis „In eurer Nähe gibt es nur wenige – hier die nächsten weiteren.“ Dasselbe gilt in der
  Partnerliste.
- **Admin:**
  - Karte „Zur Freigabe“ mit Vorschau, „Freigeben“ und „Ablehnen“ (Grund Pflicht);
  - Zähler im Admin-Kopf.
- **Datenschutzseite:** Abschnitt „Nachrichten an Partner“ (was gespeichert wird, wer es sieht, 180 Tage, kein
  E-Mail-Versand).
- **Tests:**
  - Formular: Prüfung, Honeypot, Erfolg;
  - Postfach;
  - Beiträge: Einreichen, Status;
  - Admin-Freigabe;
  - „Weiter weg“;
  - „Salon & Betreuung“;
  - Datenschutz-Text.

- [ ] Commit: `feat: Beiträge und Postfach für Partner, Schreib uns auf Portal und Steckbrief, Freigabe im Admin`

### Task 11: P2 prüfen und ausliefern (Koordinator)

- [ ] README und Roadmap.
- [ ] Abschluss-Review mit diesen Schwerpunkten:
  - Missbrauch des Kontaktformulars;
  - personenbezogene Daten;
  - Umgehung der Freigabe;
  - Kennzeichnung;
  - Rechte.
- [ ] Browser-Prüfung:
  - Beitrag einreichen, im Admin freigeben, erscheint in „Entdecken“;
  - Nachricht senden und im Postfach lesen;
  - Handy.
- [ ] Vorschau deployen.
