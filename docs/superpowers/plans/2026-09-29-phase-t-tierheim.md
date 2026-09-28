# Phase T – Tierheim-Chroniken Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tierheime nutzen die App selbst.
- **Chronik:** Sie pflegen für jedes Tier eine Chronik mit Ankunft, Tierarzt, Verhalten, Training, Gassi-Berichten und Fotos.
- **Steckbrief:** Sie schalten einen öffentlichen Steckbrief `/t/:slug` frei und zeigen ihre Tiere in Vermittlung auf ihrem Portal.
- **Übergabe:** Bei einer Vermittlung erzeugen sie einen **Übergabe-Gutschein**. Die neuen Halter lösen ihn ein (neue Chronik oder bestehendes Zuhause), und das Tier zieht **mit seiner ganzen Chronik** in „Meine Chronik“ um. Die Herkunft bleibt sichtbar.
- **Mitlesen:** Mit freiwilliger, widerrufbarer Einwilligung darf das Tierheim weiter mitlesen („Wie geht's unseren Ehemaligen?“).

**Architecture:**
- **Tierheim-Bereich:** ein Tierheim ist eine Familie mit `art = 'tierheim'` und `partner_id` gleich dem Partner. Der Admin legt es aus der Partnerverwaltung an. Anmelden geht per Schlüssel, Mitarbeitende bekommen Benutzer (vorhandene Zugangsverwaltung).
- **Neue Spalten:**
  - `dogs.vermittlung_status`, `dogs.public_slug`;
  - `timeline_entries.kategorie`, `is_public`, `herkunft_family_id`;
  - `dog_transfers`;
  - `dog_shares.story_consent`.
- **Übergabe-Gutscheine** sind normale Gutscheine eines Partner-Stapels mit gesetztem `vouchers.dog_id`. So braucht es keine Änderung der CHECK-Bedingung, denn SQLite kann CHECK nicht per ALTER ändern.
- **Mitlesen des Tierheims** ist ein `dog_shares`-Eintrag Richtung Tierheim-Familie. Die vorhandene Sichtbarkeitslogik gilt unverändert: nur Einträge mit `privat = 0`, nur lesen und kommentieren.
- **Öffentliche Fotos** laufen über `/public-media/<datei>`: nur Dateien, die zu einem freigeschalteten Steckbrief gehören.

**Tech Stack:** Node 24, Express 4, better-sqlite3, node:test; React 18, Vite 6, Vitest 4.

**Grundlage:** [Konzept, Phase T + Phase Z](../specs/2026-09-27-marketing-gutscheine-partner-design.md), Roadmap-Entscheidungen 12 bis 14:
- beides sammeln: Einträge im Tierheim und Neuigkeiten nach der Vermittlung;
- die Chronik zieht ganz mit um, die Herkunft bleibt sichtbar;
- Steckbriefe sind `noindex`.

**Regeln für alle Tasks:**
- Branch `staging`, nie pushen.
- **Kein Co-Authored-By-Trailer.**
- Höchstens eine Ebene `t.test`.
- Fiktive Namen: „Tierheim Sonnenhang“, Tiere Pepper, Sunny, Oskar, Momo (Nele ist schon Demo-Tier).
- **Keine externen Dienste.**
- Tierneutral: Hunde, Katzen, andere Tiere.

**Bewusst nicht in dieser Phase:**
- Such-Indexierung (immer `noindex`).
- Anfragen oder Vermittlung über die App: Der Kontakt geht immer direkt zum Tierheim.
- Statistik für Tierheime (Phase 5).
- Happy-End-Seite mit Auswahl einzelner Einträge. In dieser Phase gibt es nur die Einwilligung und eine einfache Sektion auf dem Portal, siehe Task 6.

---

### Task 1: Tierheim-Bereich und Datenmodell (Server)

**Files:** `server/db.js`, `server/lib/context.js` (`ART.tierheim`), `server/routes/admin.js`, Tests `server/test/shelter.test.js`

- **Schema (idempotent):**
  - `dogs.vermittlung_status` TEXT, NULL oder `'in_vermittlung' | 'reserviert' | 'vermittelt'`.
  - `dogs.public_slug` TEXT mit Unique-Index, `WHERE public_slug IS NOT NULL`.
  - `timeline_entries.kategorie` TEXT, NULL oder `'ankunft' | 'tierarzt' | 'verhalten' | 'training' | 'gassi' | 'sonstiges'`.
  - `timeline_entries.is_public` INTEGER NOT NULL DEFAULT 0.
  - `timeline_entries.herkunft_family_id` INTEGER.
  - Neue Tabelle `dog_transfers(id, dog_id, from_family_id, to_family_id, voucher_id, transferred_at)`.
  - `dog_shares.story_consent` INTEGER NOT NULL DEFAULT 0.
  - `vouchers.dog_id` INTEGER.
- **Admin:** `POST /api/admin/partners/:id/shelter`:
  - nur für Partner mit Typ `tierheim` oder `vermittlung`;
  - legt eine Familie an (`art = 'tierheim'`, Name wie der Partner, `theme = 'standard'`, `partner_id`, `password_hash = '!'`, `legacy_password = 0`, Zugangsschlüssel = neuer Code);
  - gibt `{ familyId, key }` **einmal** zurück;
  - existiert schon eines → 409.
  - `GET /api/admin/partners` zeigt `shelter_family_id`.
- **Rechte im Tierheim:**
  - Es gilt dieselbe Bereichslogik: Das Tierheim sieht nur eigene Tiere und solche, die mit ihm geteilt wurden.
  - `join` und `group` gehen aus einem Tierheim nicht (400, wie bei Rudel-Identitäten).
  - Tierheime erscheinen nie als beitretbare Familie; `findFamilyByPassword` `onlyJoinable` filtert schon auf `rudel`.
- **`buildMe`:** liefert `art: 'tierheim'` und zusätzlich `partner: { id, slug, name }`, wenn der aktive Bereich ein Tierheim ist.
- **Tests:**
  - Anlage durch den Admin, der Schlüssel-Login ergibt ein Tierheim;
  - ein Partner vom Typ Hundeschule → 400;
  - doppelt → 409;
  - `/me` enthält `art` und `partner`;
  - Beitreten oder Gründen aus einem Tierheim → 400.

- [ ] Commit: `feat: Tierheim als eigener Bereich, Datenmodell für Vermittlung und Übergabe`

---

### Task 2: Tiere in Vermittlung, Kategorien, Steckbrief (Server)

**Files:**
- Modify: `server/routes/dogs.js`, `server/routes/timeline.js`
- Create: `server/routes/publicAnimals.js`, `server/lib/publicMedia.js`
- Modify: `server/app.js`
- Tests: `server/test/steckbrief.test.js`

- **Tiere:**
  - `POST`/`PUT /api/dogs` nehmen `vermittlungStatus` an, nur im Tierheim-Bereich (sonst 400, wenn gesetzt).
  - `PUT /api/dogs/:id/steckbrief { published: boolean }`, nur Tierheim und nur der Besitzer:
    - Veröffentlichen erzeugt `public_slug` = `<name-kebab>-<6 Zufallszeichen>`.
    - Zurückziehen setzt es auf NULL.
    - Veröffentlichen geht nur mit `vermittlung_status` `in_vermittlung` oder `reserviert`.
- **Einträge:** `POST`/`PUT /api/timeline` nehmen `kategorie` (Liste oben, sonst 400) und `isPublic` an. `isPublic` gilt nur für Tiere des Tierheims und nie zusammen mit `privat = 1`.
- **Öffentlich, ohne Login, mit `apiLimiter`:**
  - **`GET /api/public/animals/:slug`**:
    - liefert nur Tiere mit `public_slug` und Status `in_vermittlung` oder `reserviert`;
    - Inhalt: Name, Tierart, Geschlecht, Rasse, Geburtsdatum (Alter), Beschreibung, Foto-URL als `/public-media/…`, öffentliche Einträge (Titel, Datum, Text, Kategorie, Foto-URLs als `/public-media/…`) und das Tierheim (Partner: Name, Slug, Kontakt, `vermittlung_url`);
    - sonst 404.
  - **`GET /api/public/partners/:slug/animals`**: die veröffentlichten Tiere eines Tierheim-Partners (Karten-Daten).
- **`/public-media/<datei>`:**
  - nur Dateien, die als `foto_url` eines veröffentlichten Tiers oder in `foto_urls` eines öffentlichen Eintrags eines veröffentlichten Tiers vorkommen;
  - Dateiname per Regex geprüft, sonst 404;
  - mit `nosniff`, `Cache-Control: public, max-age=3600`.
- **`noindex`:** Antwort-Header `X-Robots-Tag: noindex` für `/api/public/animals/*` und `/public-media/*`. Der Client setzt zusätzlich ein Meta-Tag (Task 4).
- **Tests:**
  - Status und Kategorien, Validierung;
  - Steckbrief veröffentlichen (Slug) und zurückziehen (404);
  - nur öffentliche Einträge sind sichtbar;
  - private Einträge nie;
  - Fotos über `/public-media` nur, wenn sie freigegeben sind, sonst 404;
  - `noindex`-Header;
  - Nicht-Tierheime können keinen Steckbrief anlegen.

- [ ] Commit: `feat: Tiere in Vermittlung mit öffentlichem Steckbrief`

---

### Task 3: Übergabe-Gutschein und Umzug (Server)

**Files:**
- Modify: `server/lib/vouchers.js`, `server/routes/vouchers.js`, `server/routes/dogs.js`
- Create: `server/lib/transfers.js`
- Tests: `server/test/transfer.test.js`

- **`POST /api/dogs/:id/handover`** (Tierheim, Besitzer, nicht Demo, `authLimiter`):
  - setzt `vermittlung_status = 'reserviert'`;
  - legt einen Gutschein in einem Stapel an: `kind = 'partner'`, `partner_id` = Partner des Tierheims, `label = 'Übergabe <Name>'`, `vouchers.dog_id`, `issued_by_family_id` = Tierheim;
  - Antwort `{ code (formatiert), link: '/v#<CODE>' }`;
  - höchstens ein offener Übergabe-Gutschein pro Tier; ein neuer zieht den alten zurück.
- **`lib/transfers.js` `transferDog(db, { dogId, fromFamilyId, toFamilyId, voucherId, today })`** erledigt in einer Transaktion:
  - `dogs.family_id` = neu, `herkunft_art = 'tierheim'`, `herkunft_text` = Tierheim-Name, `bei_uns_seit = today`, falls leer, `vermittlung_status = 'vermittelt'`, `public_slug = NULL`;
  - alle `timeline_entries` des Tiers: `family_id` = neu, `herkunft_family_id` = alt (falls noch leer), `is_public = 0`;
  - `dog_links` des Tiers löschen;
  - Eltern-Verweise des Tiers und Verweise anderer Tiere auf dieses Tier auf Freitext umstellen (`dogLabel`, wie in `deleteFamily`);
  - `dog_shares` des Tiers löschen;
  - `breeding_events` mit dem Tier als Mutter oder Vater: Verweis im Tierheim auf NULL plus Freitext;
  - einen Eintrag in `dog_transfers` schreiben.
- **Einlösen:**
  - **Nicht eingeloggt**, `POST /api/vouchers/redeem` wie bisher: Enthält der Gutschein eine `dog_id`, zieht das Tier nach dem Anlegen des Zuhauses dorthin um. Mit dem optionalen Feld `shelterMayRead` (boolean) entsteht sofort ein `dog_shares`-Eintrag zum Tierheim, mit `story_consent = 0`.
  - **Eingeloggt als Zuhause**, neu `POST /api/vouchers/claim { code, shelterMayRead }` (`requireAuth`, `codeLimiter`, aktiver Bereich muss das eigene Zuhause sein): löst den Gutschein ein, ohne eine neue Familie anzulegen, und zieht das Tier in das aktive Zuhause um. Ein Gutschein ohne `dog_id` → 400 „Das ist kein Übergabe-Gutschein – zum Einlösen bitte abmelden.“
  - `POST /api/vouchers/check` liefert zusätzlich `handover: { animalName, shelterName }` bei offenen Übergabe-Gutscheinen, für die Anzeige.
- **Einwilligung verwalten:** `PUT /api/dogs/:id/shelter-share { enabled, storyConsent }` (Besitzer-Zuhause, nur wenn `dog_transfers` ein Tierheim als Herkunft kennt): setzt oder löscht den `dog_shares`-Eintrag zur Herkunfts-Tierheim-Familie mit `story_consent`. Detailantwort `GET /api/dogs/:id` enthält `shelterShare: { shelterName, enabled, storyConsent } | null` für den Besitzer.
- **Tests:**
  - Übergabe erzeugen; einlösen neu (Tier samt allen Einträgen im neuen Zuhause, Herkunft gesetzt, Tierheim sieht es nicht mehr);
  - mit `shelterMayRead` sieht das Tierheim das Tier und nicht-private Einträge (`shared_from`), aber nichts Privates;
  - einlösen per `claim` in ein bestehendes Zuhause;
  - ein zweites Einlösen → 410;
  - Einwilligung widerrufen → das Tierheim sieht nichts mehr;
  - Eltern-Verweise werden zu Freitext;
  - `dog_transfers`-Eintrag vorhanden;
  - `claim` aus einem Rudel oder Tierheim → 400.

- [ ] Commit: `feat: Übergabe-Gutschein – Tier zieht mit Chronik ins neue Zuhause`

---

### Task 4: Tierheim-Oberfläche (Client)

**Files:**
- Create: `client/src/pages/ShelterAnimalsPage.jsx`, `client/src/components/HandoverDialog.jsx`, `client/src/components/SteckbriefPanel.jsx`
- Modify: `client/src/App.jsx` (Navigation für `art === 'tierheim'`: „Tiere“ `/tiere`, „Pinnwand“, „Collage“; Start-Route `/tiere` in `lib/areas.js`), `client/src/pages/DogDetailPage.jsx`, `client/src/components/DogForm.jsx`, `client/src/components/TimelineEntryForm.jsx`, `client/src/components/Timeline.jsx`, `client/src/api.js`

- **`ShelterAnimalsPage` „Unsere Tiere“:**
  - Filter-Chips „In Vermittlung / Reserviert / Vermittelt / Ehemalige (mitgelesen)“;
  - Karten mit Foto, Name, Art, Status-Chip, Steckbrief-Status (öffentlich/privat) und letztem Eintrag;
  - Knopf „Tier aufnehmen“, die vorhandene Schnellerfassung plus Status „in Vermittlung“.
- **Tierseite im Tierheim:**
  - Status-Auswahl;
  - `SteckbriefPanel`: „Steckbrief veröffentlichen“ mit Link `/t/:slug` zum Kopieren und Öffnen, „zurückziehen“;
  - Knopf „Vermittelt – Übergabe vorbereiten“ öffnet den `HandoverDialog`. Der zeigt den Code groß und den Link `/v#…` mit Kopieren und Teilen, dazu den Hinweis: „Gebt den Code den neuen Menschen – beim Einlösen zieht {Name} mit der ganzen Chronik zu ihnen.“
- **Eintragsformular im Tierheim:** Kategorie-Auswahl und die Checkbox „Im Steckbrief zeigen (öffentlich)“; die Checkbox „privat“ gibt es hier nicht.
- **Timeline:** Kategorie-Chip und „öffentlich“-Kennzeichen; für umgezogene Einträge der Hinweis „aus Tierheim Sonnenhang“ (`herkunft_family_id` → Name; der Server liefert `herkunft_name` in den Einträgen mit, siehe unten).
- **Server-Ergänzung:** Die Timeline-Einträge enthalten `herkunft_name`, per JOIN auf `families.name` über `herkunft_family_id`.
- **Tests:** Navigation für Tierheime; Status ändern; Steckbrief veröffentlichen und Link zeigen; Übergabe-Dialog zeigt den Code; Kategorie und öffentlich im Formular.

- [ ] Commit: `feat: Tierheim-Oberfläche – Tiere in Vermittlung, Steckbrief, Übergabe`

---

### Task 5: Steckbrief-Seite, Portal-Sektion, Einlösen mit Tier (Client)

**Files:**
- Create: `client/src/pages/SteckbriefPage.jsx`, `client/src/components/AnimalAdoptionCard.jsx`
- Modify: `client/src/App.jsx` (öffentliche Route `/t/:slug`), `client/src/pages/PartnerPortalPage.jsx` (Sektion „Fellnasen suchen ein Zuhause“), `client/src/components/RedeemForm.jsx` (Übergabe-Anzeige und Einwilligung), `client/src/components/SharePanel.jsx` oder neu `ShelterSharePanel.jsx` (Einwilligung verwalten), `client/src/pages/DogDetailPage.jsx`, `client/src/api.js`

- **`/t/:slug`:**
  - Titelbild, Name, Art, Alter, Geschlecht, Rasse;
  - Beschreibung (Klartext);
  - öffentliche Chronik als Zeitleiste mit Kategorien und Fotos;
  - Tierheim-Kasten: Logo, Name, „Anfrage direkt beim Tierheim“ mit Kontakt bzw. `vermittlung_url`, Link zum Portal;
  - Hinweis: „Die Vermittlung läuft direkt über das Tierheim.“;
  - `<meta name="robots" content="noindex">` per Effect in `document.head` setzen und beim Verlassen entfernen;
  - Knopf „Teilen“ mit dem Link;
  - 404-Seite.
- **Portal:** Sektion „Fellnasen suchen ein Zuhause“ mit Karten (`AnimalAdoptionCard`) → `/t/:slug`, nur wenn es Tiere gibt. Überschrift je Tierart neutral: „Fellnasen“ bzw. „Tiere“ bei gemischten Arten.
- **Einlösen mit Tier:**
  - `RedeemForm` zeigt nach `check` mit `handover` den Hinweis „Mit diesem Gutschein zieht {animalName} aus {shelterName} zu euch – mit der ganzen Chronik.“;
  - dazu die Checkbox „{shelterName} darf weiter mitlesen (freiwillig, jederzeit widerrufbar)“;
  - Eingeloggt (Zuhause): Auf `/v#CODE` mit laufender Sitzung erscheint für Übergabe-Gutscheine statt „Abmelden und einlösen“ die Aktion „In Meine Chronik übernehmen“ (`api.claimVoucher`), danach geht es zur Tierseite.
- **Einwilligung verwalten:** Auf der Tierseite (Besitzer-Zuhause) gibt es bei `shelterShare` den Abschnitt „Tierheim“ mit dem Schalter „{shelterName} darf mitlesen“ und der Checkbox „… darf Einträge als Happy-End-Geschichte zeigen“.
- **Tests:**
  - Steckbrief rendert und setzt `noindex`;
  - Portal-Sektion;
  - `RedeemForm` mit Übergabe-Hinweis und Einwilligung wird gesendet;
  - Claim-Flow;
  - Schalter der Einwilligung.

- [ ] Commit: `feat: Steckbrief-Seite, Tiere auf dem Portal, Übergabe einlösen`

---

### Task 6: Demo-Tierheim, Happy-End, Doku (Server + Client)

**Files:** `server/lib/demoPack.js`, `server/seed/demo-shelter.js` (neu), `server/routes/auth.js` (`/demo` mit `as`), `client/src/pages/PartnerPortalPage.jsx`, Tests

- **Demo-Tierheim „Tierheim Sonnenhang“:**
  - `art = 'tierheim'`, `is_demo = 1`, `partner_id` = Demo-Partner `tierheim-sonnenhang`.
  - Vier Tiere:
    - **Pepper**: Hündin, Mischling, in Vermittlung, Steckbrief öffentlich, 4 Einträge mit Kategorien (Ankunft, Tierarzt, Verhalten, Gassi), davon 3 öffentlich;
    - **Sunny**: Katze, in Vermittlung, Steckbrief öffentlich;
    - **Oskar**: Hund, reserviert, Steckbrief öffentlich;
    - **Momo**: Kaninchen, in Vermittlung, ohne Steckbrief.
  - Fotos: vorhandene Seed-Bilder, keine Dopplungen mit den geteilten Demo-Tieren.
- **Verbindung zur Demo-Chronik:** Die Demo-Nele im „Zuhause am Deich“ bekommt einen `dog_transfers`-Eintrag vom Demo-Tierheim, `herkunft_family_id` bei zwei alten Einträgen („Ankunft im Tierheim“, „Erster Spaziergang“) und `dog_shares` zum Tierheim mit `story_consent = 1`. Das Tierheim sieht dann unter „Ehemalige“ Nele.
- **Demo-Login als Tierheim:** `POST /api/demo { as: 'tierheim' }` meldet sich im Demo-Tierheim an, sonst wie bisher im Zuhause. Auf dem Portal eines Demo-Partners gibt es dazu den Knopf „Demo als Tierheim ansehen“, nur für `is_demo`-Partner in dev/staging bzw. mit `?demo=1`.
- **Happy-End (einfach):** Das Portal zeigt die Sektion „Happy Ends“, wenn es geteilte Tiere mit `story_consent = 1` gibt.
  - Inhalt je Tier: Name, Foto und der neueste nicht-private Eintrag (Titel, Datum, gekürzter Text); nie Namen oder Daten der Halter.
  - Neuer öffentlicher Endpunkt: `GET /api/public/partners/:slug/happy-ends`, höchstens 6.
  - Fotos über `/public-media`: Erweiterung der Freigaberegel auf `story_consent`-Tiere, nur deren Titelbild und das Foto dieses einen Eintrags.
- **Tests:** Demo-Tierheim vorhanden; der zweite Demo-Lauf ersetzt alles ohne Waisen; `/api/demo {as:'tierheim'}`; Happy-Ends nur mit Einwilligung; keine Halterdaten in der Antwort.
- **Doku:** README-Funktion „Tierheime“; Roadmap.

- [ ] Commit: `feat: Demo-Tierheim mit Steckbriefen, Übergabe-Geschichte und Happy-Ends`

---

### Task 7: Prüfung und Vorschau (Koordinator)

- [ ] Abschluss-Review (Datenschutz! Öffentliche Endpunkte, Fotos, Einwilligungen, Umzug).
- [ ] Browser-Prüfung: Demo als Tierheim → Pepper → Steckbrief öffentlich → `/t/…`; Übergabe in der Testumgebung (Test-Tierheim) → einlösen → Tier im neuen Zuhause, Tierheim liest mit; Portal mit Tieren und Happy-End; Handy.
- [ ] Vorschau deployen, Beispieldaten neu.
