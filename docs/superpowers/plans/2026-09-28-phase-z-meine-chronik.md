# Phase Z – Meine Chronik, Wegbegleiter und Teilen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jeder Haushalt pflegt seine Tiere privat in „Meine Chronik". Die Zeitleiste „Wegbegleiter" zeigt Einzug, Abschied und Herkunft jedes Tiers. Einzelne Tiere lassen sich in gemeinsame Familien teilen, einzelne Einträge bleiben auf Wunsch privat. Zusammenleben zählt mehr als Abstammung.

**Architecture:**
- **Bereich:** Ein Haushalt ist eine Zeile in `families` mit `art='zuhause'`, eine gemeinsame Familie hat `art='rudel'` (so sind alle heutigen Rudel angelegt).
- **Sitzung:** Sie merkt sich die Identität (`familyId`, das Zuhause bzw. das alte Rudel) und den aktiven Bereich (`activeFamilyId`). `requireAuth` setzt `req.familyId` auf den aktiven Bereich, deshalb arbeiten die bestehenden Routen unverändert weiter. `req.homeId` ist die Identität.
- **Mitgliedschaft:** `family_members` hält fest, in welchen Familien ein Zuhause Mitglied ist.
- **Teilen:** `dog_shares` macht ein Tier des Zuhauses in einer Familie sichtbar.
- **Rechte:** Lesen richtet sich nach Sichtbarkeit (eigene plus geteilte Tiere; von geteilten Tieren nur Einträge mit `privat=0`). Schreiben darf weiterhin nur der besitzende Bereich.

**Tech Stack:** Node 24, Express 4, better-sqlite3, node:test; React 18, Vite 6, Vitest 4 (jsdom).

**Grundlage:** [Konzept, Abschnitt Phase Z](../specs/2026-09-27-marketing-gutscheine-partner-design.md), [Roadmap](2026-09-28-familie-auf-pfoten-roadmap.md).

**Regeln für alle Tasks:**
- Branch `staging`, nie pushen.
- Commit-Trailer laut eigener System-Anweisung.
- Keine echten Namen aus Nutzerdaten, stattdessen neutrale Namen: Hermes, Emma, Luna, Nele, Mira, Balu, Flocke, „Zuhause am Deich", „Familie Sonnenhang".
- **Heutige Rudel laufen unverändert weiter.** Wer sich mit einem Rudel-Passwort anmeldet, ist im Rudel. Alle bestehenden Tests bleiben grün.
- Neue Texte folgen dem Theme-Wortschatz (`useTheme().words`). Wo neue Wörter nötig sind, kommen sie in **beide** Theme-Dateien.

**Vorläufige Entscheidungen (Roadmap, Fragen 20–23):**
- Begriffe: „Meine Chronik", „Wegbegleiter", „lebt mit".
- Geteilte Tiere pflegt nur das eigene Zuhause. Die Familie liest und kommentiert.
- Abschied: „In Erinnerung", dezent.
- Nach dem Login landet man in der Identität. Beim Demo-Login ist das „Meine Chronik".

**Bewusst nicht in dieser Phase:**
- Tiere zwischen Rudel und Zuhause umziehen lassen (`dog_transfers`, kommt mit Phase T).
- Eltern-Verweise über Haushaltsgrenzen hinweg anlegen. Eltern bleiben im eigenen Bereich oder Freitext.

---

## Dateien

| Datei | Aufgabe |
|---|---|
| `server/db.js` | `families.art`, `family_members`, `dog_shares`, `uploads`, `dogs`-Spalten für Wegbegleiter, `timeline_entries.privat` |
| `server/lib/context.js` (neu) | Sichtbarkeit: `visibleDogIds`, `canSeeDog`, `buildMe`, Mitgliedschaften |
| `server/middleware/auth.js` | Sitzung mit `activeFamilyId`, `requireSession`, `req.homeId` |
| `server/routes/auth.js` | `/me` im neuen Format, `POST /view`, Registrierung mit `art`, beitreten/gründen/verlassen |
| `server/routes/dogs.js` | Sichtbarkeit beim Lesen, Wegbegleiter-Felder, `PUT /:id/shares` |
| `server/routes/timeline.js` | Sichtbarkeit, `privat`, Kommentare auf geteilten Einträgen |
| `server/lib/uploadAccess.js` (neu), `server/app.js`, `server/routes/uploads.js` | Fotos nur für Berechtigte |
| `server/lib/families.js` | Löschen räumt Mitgliedschaften, Freigaben und Uploads mit auf |
| `server/lib/demoPack.js`, `server/seed/demo-data.js` | Demo-Zuhause mit Wegbegleitern, Mitgliedschaft, Freigaben |
| `client/src/api.js` | neue Endpunkte |
| `client/src/components/ContextSwitcher.jsx`, `JoinFamilyDialog.jsx` (neu) | Bereich wechseln, beitreten, gründen |
| `client/src/lib/companions.js` (neu) | Zeitleisten-Logik (rein, getestet) |
| `client/src/pages/CompanionsPage.jsx`, `components/CompanionTimeline.jsx` (neu) | Seite „Wegbegleiter" |
| `client/src/lib/timeline.js` | Meilensteine Einzug/Abschied |
| `client/src/components/DogForm.jsx`, `pages/DogDetailPage.jsx`, `components/TimelineEntryForm.jsx`, `components/Timeline.jsx`, `components/DogCard.jsx`, `components/SharePanel.jsx` (neu) | Felder, Teilen, privat |
| `client/src/App.jsx`, `pages/LoginPage.jsx` | Navigation je Bereich, Registrierung mit Wahl |

---

### Task 1: Bereiche, Mitgliedschaften, Sitzung (Server)

**Files:**
- Modify: `server/db.js`, `server/middleware/auth.js`, `server/routes/auth.js`
- Create: `server/lib/context.js`
- Test: `server/test/context.test.js`

**Schema** (`server/db.js`, im bestehenden Migrationsstil, jeder Schritt idempotent):

```js
addColumnIfMissing('families', 'art', "TEXT NOT NULL DEFAULT 'rudel'")
db.exec(`
  CREATE TABLE IF NOT EXISTS family_members (
    member_family_id INTEGER NOT NULL REFERENCES families(id),
    group_family_id INTEGER NOT NULL REFERENCES families(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (member_family_id, group_family_id)
  );
  CREATE INDEX IF NOT EXISTS idx_family_members_group ON family_members(group_family_id);
`)
```

(Die Tabellen für Teilen und Uploads kommen in Task 2 bzw. 3.)

**`server/lib/context.js`:**

```js
const db = require('../db')

const ART = { zuhause: 'zuhause', rudel: 'rudel' }

// Familien (art rudel), in denen ein Zuhause Mitglied ist
function membershipsOf(homeId) {
  return db
    .prepare(
      `SELECT f.id, f.name, f.theme FROM family_members m JOIN families f ON f.id = m.group_family_id
       WHERE m.member_family_id = ? ORDER BY f.name COLLATE NOCASE`
    )
    .all(homeId)
}

function isMember(homeId, groupId) {
  return Boolean(
    db.prepare('SELECT 1 FROM family_members WHERE member_family_id = ? AND group_family_id = ?').get(homeId, groupId)
  )
}

// Darf die Identität homeId den Bereich familyId ansehen? (eigener Bereich oder Mitgliedschaft)
function canEnter(homeId, familyId) {
  return homeId === familyId || isMember(homeId, familyId)
}

// Antwort für /me, /login, /demo, /view: aktiver Bereich oben, Identität und Mitgliedschaften dazu
function buildMe(homeId, activeId, isDemo) {
  const family = (id) => db.prepare('SELECT id, name, theme, art FROM families WHERE id = ?').get(id)
  const active = family(activeId)
  const home = family(homeId)
  return { ...active, isDemo: Boolean(isDemo), home, memberships: membershipsOf(homeId) }
}

module.exports = { ART, membershipsOf, isMember, canEnter, buildMe }
```

**`server/middleware/auth.js`:**
- `signSession(familyId, activeFamilyId = familyId)` → JWT `{ familyId, activeFamilyId }`, dazu `setSessionCookie(res, familyId, activeFamilyId)`.
- Neue Middleware `requireSession` erledigt alles aus dem heutigen `requireAuth` **außer** der Demo-Schreibsperre:
  - Token prüfen und die Identität laden (`SELECT is_demo FROM families WHERE id = ?`).
  - `active = payload.activeFamilyId ?? payload.familyId`.
  - Ist `active !== payload.familyId` und `!canEnter(payload.familyId, active)` (Mitgliedschaft beendet oder Familie gelöscht), gilt `active = payload.familyId`.
  - Danach `req.homeId = payload.familyId`, `req.familyId = active`, `req.isDemo = Boolean(family.is_demo)`.
- `requireAuth = [requireSession, blockDemoWrites]` bzw. eine Funktion, die beides nacheinander ausführt. `blockDemoWrites` antwortet bei `req.isDemo && req.method !== 'GET'` mit 403 wie heute.
- Alte Tokens ohne `activeFamilyId` funktionieren weiter.

**`server/routes/auth.js`:**
- `GET /me` → `buildMe(req.homeId, req.familyId, req.isDemo)`.
- `POST /login` und `POST /demo` → `setSessionCookie(res, id)` und Antwort `buildMe(id, id, isDemo)`. `/demo` wählt `WHERE is_demo = 1 ORDER BY (art = 'zuhause') DESC, id DESC LIMIT 1`, also bevorzugt das Demo-Zuhause.
- `POST /families`:
  - nimmt zusätzlich `art` (`'zuhause'` oder `'rudel'`, Standard `'rudel'` für alte Clients; alles andere → 400) und speichert es;
  - antwortet mit `buildMe`, Status 201.
- `POST /view { familyId }` mit `requireSession` (also auch in der Demo erlaubt): Ist `canEnter(req.homeId, id)` falsch → 404 „Diesen Bereich gibt es nicht", sonst `setSessionCookie(res, req.homeId, id)` und Antwort `buildMe(req.homeId, id, req.isDemo)`.
- `POST /families/join { password }` mit `requireAuth` und `authLimiter`:
  - nur wenn die Identität `art='zuhause'` ist, sonst 400 „Nur aus ‚Meine Chronik' heraus möglich";
  - sucht per `findFamilyByPassword` nur Familien mit `art='rudel' AND is_demo=0`; nichts gefunden → 401 „Dieses Passwort kennen wir nicht";
  - `INSERT OR IGNORE INTO family_members`, Antwort `buildMe(req.homeId, req.familyId, false)`.
- `POST /families/group { name, password }` mit `requireAuth`:
  - nur aus einem Zuhause;
  - legt eine Familie `art='rudel'`, `theme='standard'` mit gehashtem Passwort an; Name und Passwort werden geprüft wie bei `POST /families`, „Passwort belegt" bleibt vorerst;
  - legt die Mitgliedschaft an, Antwort 201 mit `buildMe`.
- `DELETE /memberships/:groupId` mit `requireAuth`: löscht die Mitgliedschaft der Identität und (ab Task 2) alle `dog_shares` von Tieren des Zuhauses in diese Familie. War sie der aktive Bereich, zurück aufs Zuhause (neues Cookie). Antwort `buildMe`.

**Tests (`server/test/context.test.js`), vorher schreiben und scheitern sehen:**
1. Registrierung mit `art:'zuhause'` → `/me` liefert `art:'zuhause'`, `home.id === id`, `memberships: []`.
2. Zuhause tritt per Passwort einem Rudel bei → `memberships` enthält es. `POST /view` wechselt, `/me.id` ist dann das Rudel und `home` bleibt das Zuhause. `GET /api/dogs` liefert jetzt die Tiere des Rudels.
3. `POST /view` auf eine fremde Familie → 404, der Bereich bleibt.
4. Mitgliedschaft löschen, während das Rudel aktiv ist → die nächste Anfrage landet wieder im Zuhause (auch mit dem alten Cookie).
5. Login mit Rudel-Passwort (heutiger Weg) → `/me.art === 'rudel'`, `home.id === id`. `join` von dort → 400.
6. Die Demo darf `POST /view` (auf eigene Bereiche), aber weiter nichts schreiben (403).
7. `join` mit dem Passwort einer Demo-Familie → 401.

- [ ] Tests schreiben → scheitern → implementieren → `npm --prefix server test` grün (alle bestehenden Tests auch)
- [ ] Commit: `feat: Meine Chronik als eigener Bereich, Familien beitreten und wechseln`

---

### Task 2: Teilen, Wegbegleiter-Felder, private Einträge (Server)

**Files:**
- Modify: `server/db.js`, `server/lib/context.js`, `server/routes/dogs.js`, `server/routes/timeline.js`, `server/routes/auth.js` (leave cleanup), `server/lib/families.js`
- Test: `server/test/sharing.test.js`, `server/test/companions.test.js`

**Schema:**

```js
db.exec(`
  CREATE TABLE IF NOT EXISTS dog_shares (
    dog_id INTEGER NOT NULL REFERENCES dogs(id),
    family_id INTEGER NOT NULL REFERENCES families(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (dog_id, family_id)
  );
  CREATE INDEX IF NOT EXISTS idx_dog_shares_family ON dog_shares(family_id, dog_id);
`)
addColumnIfMissing('dogs', 'bei_uns_seit', 'TEXT')
addColumnIfMissing('dogs', 'bei_uns_bis', 'TEXT')
addColumnIfMissing('dogs', 'abschied_grund', 'TEXT')      // verstorben | abgegeben | umgezogen | anderes
addColumnIfMissing('dogs', 'herkunft_art', 'TEXT')        // tierheim | privat | zuechter | nachwuchs | fundtier | anderes
addColumnIfMissing('dogs', 'herkunft_text', 'TEXT')
addColumnIfMissing('timeline_entries', 'privat', 'INTEGER NOT NULL DEFAULT 0')
```

**Sichtbarkeit (`server/lib/context.js`):**

```js
// Tiere, die im Bereich familyId sichtbar sind: eigene und dorthin geteilte
const VISIBLE_DOGS_SQL = `(SELECT id FROM dogs WHERE family_id = @familyId
  UNION SELECT dog_id FROM dog_shares WHERE family_id = @familyId)`

function canSeeDog(familyId, dog) {
  if (!dog) return false
  if (dog.family_id === familyId) return true
  return Boolean(db.prepare('SELECT 1 FROM dog_shares WHERE dog_id = ? AND family_id = ?').get(dog.id, familyId))
}
```

**`server/routes/dogs.js`:**
- `SUMMARY_COLUMNS` um die neuen Felder und `families.name AS familyName` ergänzen (gibt es schon), dazu die Freigaben:
  - `GET /` und `GET /all` liefern `WHERE dogs.id IN ${VISIBLE_DOGS_SQL}`.
  - Jede Zeile bekommt `can_edit` (`dogs.family_id = @familyId`) und `shared_from` (Name des besitzenden Bereichs, nur wenn fremd, sonst `null`).
- `GET /:id` nutzt `loadVisibleDog`: 404, wenn nicht sichtbar. Die Antwort enthält:
  - `canEdit` und `isOwn` (beide gleich `dog.family_id === req.familyId`);
  - `familyName` und `ownerFamilyId`;
  - `shares` (Liste der `family_id`, nur wenn `canEdit`, sonst `[]`);
  - Eltern: Zusammenfassung nur, wenn das Elterntier im Bereich sichtbar ist, sonst `{ id: null, name }`, also nur den Namen;
  - Mitbewohner: nur sichtbare.
- `GET /links`: Links des Bereichs **plus** Links, deren beide Tiere im Bereich sichtbar sind.
- Schreibende Routen bleiben bei `loadOwnDog` (PUT, DELETE, Mitbewohner) → geteilte Tiere sind im fremden Bereich nicht änderbar (404 wie heute).
- Eingabe der neuen Felder in der bestehenden Validierung (`readDogInput` o. ä.):
  - Daten sind ISO-Daten oder leer;
  - `bei_uns_bis >= bei_uns_seit`, falls beide gesetzt, sonst 400 „Der Abschied liegt vor dem Einzug";
  - `abschied_grund` und `herkunft_art` nur aus den Listen oben (sonst 400);
  - `abschied_grund` nur mit `bei_uns_bis` (sonst wird es `null`);
  - `herkunft_text` höchstens 120 Zeichen per `cleanText`.
- `PUT /:id/shares { familyIds: number[] }`:
  - nur `loadOwnDog`;
  - der aktive Bereich muss `art='zuhause'` sein, sonst 400 „Teilen geht aus ‚Meine Chronik'";
  - jede ID muss eine Mitgliedschaft des Zuhauses sein, sonst 400;
  - ersetzt die Menge in einer Transaktion, Antwort `{ shares: [...] }`.
- `deleteDog`: löscht zusätzlich `dog_shares` des Tiers.

**`server/routes/timeline.js`:**
- **Sichtbare Einträge im Bereich:** `t.family_id = @familyId OR (t.dog_id IN (SELECT dog_id FROM dog_shares WHERE family_id = @familyId) AND t.privat = 0)`. Das gilt für `GET /`, `GET /recent` (inkl. `comment_count`) und `commentsByEntry`. `commentsByEntry` liefert **alle** Kommentare sichtbarer Einträge, nicht nur die des eigenen Bereichs.
- **`GET /?dogId=`:** Ist das Tier nicht sichtbar, kommt eine leere Liste bzw. 404, so wie es heute bei fremden Tieren der Fall ist (vorher prüfen).
- **Anlegen und ändern:** `POST` und `PUT` nehmen `privat` (boolean, Standard `false`) und speichern `privat ? 1 : 0`.
- **Kommentare:**
  - `POST /:id/comments` ist erlaubt, wenn der Eintrag im Bereich sichtbar ist (neues `loadVisibleEntry`). Der Kommentar bekommt `family_id = req.familyId`.
  - `DELETE` erlaubt der Bereich des Kommentars **oder** der Bereich, dem der Eintrag gehört (Moderation).

**Aufräumen:**
- `DELETE /memberships/:groupId` (Task 1) löscht nun `dog_shares` aller Tiere des Zuhauses in dieser Familie.
- `deleteFamily` (`server/lib/families.js`) löscht `family_members` (beide Seiten) und `dog_shares` (in die Familie hinein und von ihren Tieren) **vor** den Tieren; die Reihenfolge ist wichtig wegen `foreign_keys=ON`.

**Tests, vorher schreiben:**
- `sharing.test.js`: Aufbau mit Rudel R (per Rudel-Passwort) und Zuhause Z (Mitglied von R, Tier „Nele" mit einem öffentlichen und einem privaten Eintrag).
  1. Ohne Freigabe: in R nicht sichtbar (`/dogs`, `/dogs/:id` → 404, `/timeline?dogId=` leer, `/recent` ohne ihre Einträge).
  2. `PUT /dogs/:id/shares [R]` aus Z → in R sichtbar mit `can_edit:false`, `shared_from:'Zuhause am Deich'`. `/timeline` zeigt nur den öffentlichen Eintrag. `PUT /dogs/:id` aus R → 404, `POST /timeline` für Nele aus R → 403/404.
  3. Kommentar aus R auf den öffentlichen Eintrag → Z sieht ihn. Z darf ihn löschen, R auch, ein dritter Bereich nicht.
  4. Freigabe an eine Familie ohne Mitgliedschaft → 400. Teilen aus dem Rudel-Bereich → 400.
  5. Freigabe entfernen → wieder unsichtbar. Mitgliedschaft verlassen → Freigaben weg.
  6. Rudel R löschen (`deleteFamily`) → Z samt Nele bleibt vollständig erhalten, Freigaben und Mitgliedschaft sind weg.
- `companions.test.js`: Tier mit `bei_uns_seit`, `bei_uns_bis`, `abschied_grund` und `herkunft_*` anlegen, zurücklesen; Abschied vor Einzug → 400; unbekannter Grund → 400.

- [ ] Tests → scheitern → implementieren → alle Server-Tests grün
- [ ] Commit: `feat: Tiere in Familien teilen, private Einträge, Einzug/Abschied/Herkunft`

---

### Task 3: Fotos nur für Berechtigte (Server)

Heute darf **jede** eingeloggte Sitzung, auch die öffentliche Demo, jede Datei unter `/uploads/<uuid>.<ext>` abrufen. Geschützt ist sie nur dadurch, dass niemand den Dateinamen errät.

**Files:**
- Modify: `server/db.js`, `server/routes/uploads.js`, `server/app.js`, `server/lib/families.js`
- Create: `server/lib/uploadAccess.js`
- Test: erweitert `server/test/isolation.test.js` bzw. neu `server/test/uploadAccess.test.js`

**Schema:** `uploads(filename TEXT PRIMARY KEY, family_id INTEGER NOT NULL REFERENCES families(id), created_at TEXT NOT NULL DEFAULT (datetime('now')))`. `POST /api/uploads` schreibt eine Zeile mit `req.familyId`.

**`server/lib/uploadAccess.js`:** `canSeeUpload(familyId, homeId, filename)` gibt `true` zurück, wenn eine dieser Bedingungen zutrifft:
- **Hochgeladen:** Die Datei wurde im Bereich `familyId` oder in der Identität `homeId` hochgeladen (`uploads`-Zeile). So ist sie auch direkt nach dem Hochladen vor dem Speichern sichtbar.
- **Tierfoto:** `dogs.foto_url = '/uploads/' || filename` bei einem im Bereich sichtbaren Tier.
- **Eintragsfoto:** `timeline_entries.foto_urls LIKE '%"/uploads/' || filename || '"%'` bei einem im Bereich sichtbaren Eintrag (Regel aus Task 2).
- **Zuchtfoto:** `breeding_events.foto_urls LIKE …` mit `family_id = familyId`.

Der Dateiname wird vorher gegen `^[0-9a-f-]{36}\.(jpg|jpeg|png|webp|gif)$` geprüft. Passt er nicht, gibt es 404.

**`server/app.js`:** vor `express.static` für `/uploads` eine Middleware einhängen:
- Der Admin sieht alles.
- Eine Familien-Sitzung (`req.familyId`/`req.homeId` aus `requireSession`, Demo erlaubt, nur GET) muss `canSeeUpload` bestehen, sonst 404, nicht 403, damit nichts über fremde Dateien verraten wird.
- Prüfen, wie `requireFamilyOrAdmin` heute `req.familyId` setzt, und wiederverwenden.

**`deleteFamily`:** löscht die `uploads`-Zeilen der Familie.

**Tests:**
- Familie A lädt hoch → A sieht die Datei, B (eingeloggt) bekommt 404, die Demo bekommt 404.
- Nach dem Teilen eines Tiers mit diesem Foto sieht das Rudel das Tierfoto.
- Ein Foto eines privaten Eintrags eines geteilten Tiers bleibt für das Rudel 404.
- Ungültiger Dateiname → 404.
- Alte Dateien ohne `uploads`-Zeile, die nur über ein Tier der Familie referenziert sind, bleiben für diese Familie sichtbar.

- [ ] Tests → scheitern → implementieren → grün
- [ ] Commit: `fix: Fotos nur für Bereiche, die sie sehen dürfen`

---

### Task 4: Demo mit „Meine Chronik" (Server)

**Files:** `server/seed/demo-data.js`, `server/lib/demoPack.js`, `server/scripts/testenv-seed.js`, `server/scripts/demo.js` (nur wenn nötig), Tests `server/test/demoPack.test.js`, `server/test/testenvSeed.test.js`

- Neues Demo-Zuhause **„Zuhause am Deich"** (`art='zuhause'`, Theme `standard`, `is_demo` wie die Rudel-Demo) mit vier Wegbegleitern. Fotos: vorhandene Bilder aus `server/seed/images` wiederverwenden, keine neuen Dateien.

| Tier | Art | Geburt | Bei uns | Herkunft | Abschied |
|---|---|---|---|---|---|
| **Balu** | Hund | 2006-05-01 | seit 2008-03-15 | privat „von Nachbarn übernommen" | 2019-11-02, verstorben |
| **Mira** | Katze | 2012-05-20 | seit 2012-08-01 | privat „Bauernhof-Wurf" | – |
| **Nele** | Hündin, Mischling | 2019-03-10 | seit 2021-06-12 | Tierheim „Tierheim Sonnenhang" | – |
| **Flocke** | Kaninchen | 2023-04-01 | seit 2023-06-01 | anderes „aus einer Tierschutz-Pflegestelle" | – |

- Je 2–3 Chronik-Einträge, mindestens zwei davon `privat=1` (z. B. „Tierarzt-Termin" bei Nele, „Erinnerungen an Balu"). Einträge mit Einzug-Bezug („Nele zieht ein – die ersten Tage").
- Nele und Mira leben zusammen (`dog_links`).
- **Mitgliedschaft:** Das Zuhause ist Mitglied der Demo-Familie. **Nele und Mira** sind dorthin geteilt, dort gibt es einen Kommentar der Familie unter Neles öffentlichem Eintrag.
- **`replaceDemoPack`:**
  - legt beide Demo-Bereiche neu an, dazu Mitgliedschaft und Freigaben, alles in einer Transaktion;
  - löscht danach **alle** alten `is_demo=1`-Familien über `deleteFamily`, damit Mitgliedschaften und Freigaben mit aufgeräumt werden;
  - Theme und Name der Rudel-Demo bleiben wie übergeben.
- **Demo-Login:** landet im Zuhause (Task 1, `ORDER BY (art = 'zuhause') DESC`).
- **Tests:**
  - Nach `replaceDemoPack` gibt es genau zwei Demo-Familien, verbunden per Mitgliedschaft, mit zwei Freigaben und mindestens zwei privaten Einträgen.
  - Ein zweiter Lauf ersetzt beide vollständig: keine verwaisten `family_members` oder `dog_shares`.
  - `testenv-seed` wie bisher, plus Zuhause.
  - Echte Familien bleiben unberührt, wie der bestehende Test es verlangt.

- [ ] Tests → scheitern → implementieren → grün
- [ ] Commit: `feat: Demo mit Meiner Chronik – Wegbegleiter, geteilte Tiere, private Einträge`

---

### Task 5: Bereich wechseln, beitreten, gründen (Client)

**Files:**
- Modify: `client/src/api.js`, `client/src/App.jsx`, `client/src/pages/LoginPage.jsx`
- Create: `client/src/components/ContextSwitcher.jsx`, `client/src/components/JoinFamilyDialog.jsx`
- Test: `ContextSwitcher.test.jsx`, `JoinFamilyDialog.test.jsx`

- **`api.js`:**
  - `view(familyId)` → `POST /view`
  - `joinFamily(password)` → `POST /families/join`
  - `createGroup({ name, password })` → `POST /families/group`
  - `leaveFamily(id)` → `DELETE /memberships/:id`
  - `setDogShares(id, familyIds)` → `PUT /dogs/:id/shares`
- **`App.jsx`:**
  - `family` ist jetzt das `me`-Objekt: aktiver Bereich plus `home` und `memberships`.
  - Im Header wird `brand-sub` zum `ContextSwitcher`, sobald `family.home.art === 'zuhause'`. Für alte Rudel bleibt es beim Namen.
  - **Navigation je Bereich:**
    - Zuhause: Wegbegleiter (`/wegbegleiter`, Icon `heart` o. ä. in `Icon.jsx` ergänzen), Stammbaum, Pinnwand, Collage.
    - Rudel: wie heute.
  - Die Start-Route richtet sich nach dem Bereich: `/wegbegleiter` im Zuhause, sonst `/stammbaum` (Fallback-Route `*`).
- **`ContextSwitcher`:**
  - Knopf mit dem aktuellen Namen und einem Pfeil, darunter ein Menü (Tastatur: Pfeiltasten und Escape, `aria-expanded`):
    - „Meine Chronik" (das Zuhause);
    - Trenner, dann die Mitgliedschaften (Name);
    - Trenner, dann „Familie beitreten oder gründen …".
  - Beim Wechsel: `api.view(id)` → `onChange(me)` → navigieren zur Start-Route des neuen Bereichs → Toast „Du bist jetzt in …".
- **`JoinFamilyDialog`:**
  - zwei Reiter: „Beitreten" (Passwort der Familie) und „Neu gründen" (Name + Passwort, Hinweis: „Teilt das Passwort mit allen, die dazugehören sollen.");
  - Erfolg → `onChange(me)`, Toast, Dialog zu;
  - in der Demo deaktiviert, mit Hinweis.
- **`LoginPage`, Modus „Neu":**
  - Wahl per Segment: **„Meine Chronik"** (Standard, Text: „Privat – für deine eigenen Tiere. Familien kannst du später beitreten.") oder **„Gemeinsame Familie"** (heutiger Weg).
  - Das Formular sendet `art`; Titel und Knöpfe passen sich an.
- **Tests:**
  - Der Switcher listet die Bereiche und ruft `api.view` mit der richtigen ID auf.
  - Der Dialog ruft `joinFamily` bzw. `createGroup` auf und zeigt Fehler als `role="alert"`.
  - Die Registrierung sendet `art:'zuhause'` als Standard.

- [ ] Tests → scheitern → implementieren → Tests und Build grün
- [ ] Commit: `feat: Zwischen Meiner Chronik und Familien wechseln, beitreten und gründen`

---

### Task 6: Wegbegleiter-Zeitleiste und Meilensteine (Client)

**Files:**
- Create: `client/src/lib/companions.js` (+ Test), `client/src/components/CompanionTimeline.jsx`, `client/src/pages/CompanionsPage.jsx`, `client/src/styles/companions.css`
- Modify: `client/src/lib/timeline.js` (+ Test), `client/src/App.jsx` (Route)

**`client/src/lib/companions.js`:**

```js
// Wegbegleiter: Zeitspanne je Tier – vom Einzug (sonst Geburt) bis Abschied (sonst heute)
export function companionRows(dogs, today) {
  return dogs
    .map((dog) => {
      const start = dog.bei_uns_seit || dog.geburtsdatum
      if (!start) return null
      const departed = Boolean(dog.bei_uns_bis)
      return { dog, start, end: dog.bei_uns_bis || today, ongoing: !departed, departed }
    })
    .filter(Boolean)
    .sort((a, b) => a.start.localeCompare(b.start) || a.dog.name.localeCompare(b.dog.name, 'de'))
}

// Achse in ganzen Jahren über alle Zeilen
export function yearSpan(rows, today) {
  if (!rows.length) return null
  const from = Number(rows[0].start.slice(0, 4))
  const to = Math.max(...rows.map((r) => Number(r.end.slice(0, 4))), Number(today.slice(0, 4)))
  return { from, to }
}

// Anteil 0..1 eines Datums auf der Achse (für Balken-Position)
export function position(date, span) {
  const [y, m, d] = date.split('-').map(Number)
  const yearFraction = y + (m - 1) / 12 + (d - 1) / 365
  return (yearFraction - span.from) / (span.to + 1 - span.from)
}

// Nächster Jahrestag des Einzugs eines noch lebenden Tiers
export function nextAnniversary(dogs, today) { /* wie nextLitterBirthday in lib/litters.js: {dog, date, years, daysUntil} | null */ }
```

Tests: Sortierung, Tiere ohne Datum fallen weg, `ongoing`/`departed`, `yearSpan` inklusive heute, `position` (Jahresanfang 0, Ende 1), `nextAnniversary` (heute ist Jahrestag → `daysUntil 0`; nur `bei_uns_seit`, verstorbene nicht).

**`CompanionTimeline`:**
- **Aufbau:** Oben eine Jahresachse mit Beschriftung alle 1, 2 oder 5 Jahre, je nach Spannweite. Darunter je Tier eine Zeile: Avatar, Name und Art links, rechts ein Balken zwischen `position(start)` und `position(end)`.
- **Balken:**
  - laufend: `--rust`, rechts ausgeblendet mit „heute";
  - verstorben: gedämpft `--muted`, mit Etikett „In Erinnerung · 2008–2019";
  - abgegeben/umgezogen: gestrichelt.
- Ein Herkunfts-Chip am Balkenanfang, z. B. „aus dem Tierheim".
- Die ganze Zeile ist ein Link auf `/tier/:id`.
- Überlappende Zeiträume ergeben sich durch die gemeinsame Achse von selbst. Eine senkrechte Linie für „heute" gehört dazu.
- **Mobil (< 640px):** Die Achse schrumpft auf Anfangs- und Endjahr, die Namen stehen über dem Balken.
- `prefers-reduced-motion` respektieren; Balken dürfen beim ersten Anzeigen einwachsen (nur `transform`).

**`CompanionsPage`** (`/wegbegleiter`):
- **Kopf:** Eyebrow „Meine Chronik", Titel „Wegbegleiter", Lede „Alle Tiere, die bei euch gelebt haben und leben – von {from} bis heute."
- Stats: Tiere gesamt, davon aktuell bei euch, Jahre gemeinsam (Summe).
- Knopf „Tier hinzufügen" (bestehendes Formular, wie in `OverviewPage`).
- Hinweis auf den nächsten Jahrestag („In 5 Tagen: Nele ist 5 Jahre bei euch").
- Leerzustand mit Logo und Aufforderung.
- Nutzt `api.listDogs()`.

**`lib/timeline.js` / `buildTimeline`** bekommt zwei neue Meilensteine:
- `{ type: 'arrival', datum: bei_uns_seit, titel: '<Name> zieht ein' }`, als Text die Herkunft („aus dem Tierheim – Tierheim Sonnenhang").
- `{ type: 'farewell', datum: bei_uns_bis, titel }`, je nach Grund: verstorben → „Abschied von <Name>", abgegeben/umgezogen → „<Name> zieht aus", sonst „<Name> geht".
- Die Darstellung in `Timeline.jsx` folgt dem Muster von `birth`, mit eigenem Icon.

Tests für beide Meilensteine und die Herkunftstexte (Tabelle `HERKUNFT_LABELS`: tierheim „aus dem Tierheim", privat „von privat", zuechter „vom Züchter", nachwuchs „eigener Nachwuchs", fundtier „als Fundtier", anderes „").

- [ ] Tests → scheitern → implementieren → Tests und Build grün, dazu eine Sichtprüfung im Browser (Demo-Zuhause)
- [ ] Commit: `feat: Wegbegleiter-Zeitleiste, Einzug und Abschied als Meilensteine`

---

### Task 7: Tier-Formular, Teilen, private Einträge (Client)

**Files:**
- Modify: `client/src/components/DogForm.jsx`, `client/src/pages/DogDetailPage.jsx`, `client/src/components/TimelineEntryForm.jsx`, `client/src/components/Timeline.jsx`, `client/src/components/DogCard.jsx`
- Create: `client/src/components/SharePanel.jsx`
- Tests: `SharePanel.test.jsx`, Erweiterungen bestehender Tests

- **`DogForm`:** Abschnitt „Bei uns" (aufklappbar, offen, sobald ein Wert gesetzt ist) mit:
  - Einzug (Datum);
  - Herkunft (Auswahl + Freitext „z. B. Tierheim Sonnenhang");
  - Schalter „Nicht mehr bei uns" → Abschied (Datum) + Grund (verstorben/abgegeben/umgezogen/anderes);
  - Senden als `bei_uns_seit`, `bei_uns_bis`, `abschied_grund`, `herkunft_art`, `herkunft_text` (Namen wie beim Server prüfen).
- **`DogDetailPage`, Hero:**
  - Zeile „Bei euch seit 12. Juni 2021 · aus dem Tierheim (Tierheim Sonnenhang)";
  - bei Abschied „In Erinnerung · 2008–2019" in dezenter Ausführung;
  - für geteilte Tiere im fremden Bereich (`!dog.canEdit`) ein Hinweis „Lebt im Zuhause ‚{familyName}' und wird hier geteilt.";
  - ist `dog.ownerFamilyId === family.home.id`, gibt es den Knopf „In Meiner Chronik bearbeiten" (`api.view(home.id)` → `/tier/:id`);
  - Bearbeiten, Löschen und Neuer Eintrag nur mit `canEdit`; das bestehende `isOwn`-Verhalten beibehalten.
- **`SharePanel`**: wird angezeigt, wenn `canEdit`, `family.art === 'zuhause'` und Mitgliedschaften vorhanden sind.
  - Überschrift „In Familien zeigen", je Mitgliedschaft eine Checkbox;
  - Änderung → `api.setDogShares(id, ids)` mit optimistischem Update; bei Fehler zurück und Toast;
  - Text: „Geteilt werden das Tier und alle Einträge, die nicht als privat markiert sind.";
  - ohne Mitgliedschaften: Hinweis mit Link „Familie beitreten oder gründen" (öffnet den `JoinFamilyDialog`).
- **`TimelineEntryForm`:**
  - Checkbox „Nur für uns (privat)", nur sichtbar, wenn der aktive Bereich ein Zuhause ist;
  - sendet `privat`, bestehende Einträge zeigen den Wert.
- **`Timeline.jsx`:** private Einträge mit einem Schloss und „privat" (`aria-label` „Privater Eintrag").
- **`DogCard`:** für `dog.shared_from` ein kleines Etikett „aus {shared_from}", das Stammbaum-Layout darf nicht springen.
- **Tests:**
  - `SharePanel` ruft `setDogShares` auf und nimmt die Änderung bei einem Fehler zurück.
  - Die Privat-Checkbox erscheint nur im Zuhause.
  - Hero: Die Wegbegleiter-Zeile erscheint bei gesetzten Feldern.

- [ ] Tests → scheitern → implementieren → Tests und Build grün
- [ ] Commit: `feat: Einzug, Herkunft und Abschied pflegen, Tiere teilen, private Einträge`

---

### Task 8: Doku, Prüfung, Vorschau (Koordinator)

- [ ] README → Funktionen: „Meine Chronik & Wegbegleiter", „Tiere in Familien teilen", „Fotos nur für Berechtigte" (Sicherheit).
- [ ] Roadmap: Phase Z auf ✅/🚀, Fortschritts-Log.
- [ ] Abschluss-Review über den ganzen Phasen-Diff.
- [ ] Browser-Prüfung (`npm run testenv:reset`, `npm run dev:test`):
  - Demo landet in „Meine Chronik" → Wegbegleiter mit 4 Tieren, Balu „In Erinnerung";
  - Wechsel in „Familie Sonnenhang" → Nele und Mira im Stammbaum mit „aus Zuhause am Deich", private Einträge unsichtbar;
  - zurück;
  - Handy, hell und dunkel.
- [ ] Vorschau deployen und Beispieldaten neu anlegen.
