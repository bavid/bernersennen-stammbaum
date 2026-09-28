# Phase 1 – Gutscheine und neuer Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Man registriert sich nur noch mit einem **Einmal-Gutschein**. Beim Einlösen entsteht „Meine Chronik“ (ein Zuhause), und der Code wird zum **Schlüssel** – er dient als Login und als Wiederherstellung (PUK). Ein Benutzername mit eigenem Passwort und eine E-Mail sind optional. Jede Familie und jedes Zuhause hat ein paar Gutscheine zum Weitergeben. Gutscheine aus einer Familie machen beim Einlösen gleich zum Mitglied. Der Admin erzeugt Gutschein-Stapel. Alte Passwörter funktionieren weiter.

**Architecture:**
- `server/lib/codes.js`: Format (12 Zeichen Crockford-Base32, angezeigt `XXXX-XXXX-XXXX`), großzügiges Normalisieren beim Eintippen, HMAC-SHA256 mit `CODE_PEPPER` zum Nachschlagen und AES-256-GCM, damit noch offene Codes wieder angezeigt werden können.
- Tabellen `voucher_batches`, `vouchers` und `users`; Spalten `families.access_key_hash`, `legacy_password`, `auth_epoch`, `voucher_id`.
- Das Login erkennt Codes und schlägt sie per Hash nach. Die bcrypt-Schleife läuft nur noch über Familien mit altem Passwort (`legacy_password=1`).
- Die Sitzung bekommt eine Epoche: Wird der Schlüssel erneuert, enden alle Sitzungen des Bereichs.
- `POST /api/families` und `FAMILY_INVITE_CODE` entfallen.

**Tech Stack:** Node 24, Express 4, better-sqlite3, node:test; React 18, Vite 6, Vitest 4 (jsdom).

**Grundlage:**
- [Konzept, Phase 1 + Phase Z](../specs/2026-09-27-marketing-gutscheine-partner-design.md)
- [Roadmap](2026-09-28-familie-auf-pfoten-roadmap.md), vorläufige Entscheidungen:
  - 3 Gutscheine je Bereich (`RUDEL_VOUCHER_QUOTA`)
  - nur PUK, keine E-Mail-Wiederherstellung
  - alte Passwörter ohne Stichtag
  - Hinweis „Schlüssel erneuern" nach dem Einlösen

**Regeln für alle Tasks:**
- Branch `staging`, nie pushen.
- Commit-Trailer laut eigener System-Anweisung.
- **Tests mit höchstens einer Ebene `t.test`.**
- Nur neutrale Namen: Hermes, Emma, Luna, Nele, Mira, „Zuhause am Deich", „Familie Sonnenhang"; keine echten Personen- oder Tiernamen.
- **Codes nie loggen und nie in URLs außer hinter `#`.**

**Bewusst nicht in dieser Phase:**
- Partner-Kontingente und Branding beim Einlösen (Phase 2, Spalte `partner_id` wird aber schon angelegt).
- Druckkarten mit QR (Phase 5).
- Übergabe-Gutscheine (Phase T).
- PLZ (Phase 2).
- „Altes Passwort abschalten".

---

## Dateien

| Datei | Aufgabe |
|---|---|
| `server/lib/codes.js` (neu) | erzeugen, formatieren, normalisieren, hashen, ver- und entschlüsseln |
| `server/lib/vouchers.js` (neu) | Stapel anlegen, Kontingent auffüllen, einlösen (Transaktion), Status |
| `server/config.js` | `codePepper` (Pflicht in Produktion), `voucherQuota`, `inviteCode` entfällt |
| `server/db.js` | Schema |
| `server/middleware/auth.js` | Epoche in der Sitzung (`e`, optional `uid`/`ue`) |
| `server/middleware/abuse.js` | `codeLimiter` |
| `server/routes/auth.js` | Login per Schlüssel/Passwort/Benutzer, `/families` und `/invite` entfallen |
| `server/routes/vouchers.js` (neu) | `check`, `redeem`, `mine`, `recover`, `family/key`, `users` |
| `server/routes/admin.js` | Gutschein-Stapel |
| `server/test/helpers.js` | `createFamily` legt Alt-Rudel direkt an; neu `createHousehold` per Gutschein |
| `deploy/remote.sh`, `manage.ps1`, `.env.example` | `CODE_PEPPER`, Einladungscode entfernen |
| `client/src/pages/LoginPage.jsx` (+ neue Teile) | Schlüssel-Login, Benutzer-Login, Gutschein einlösen, Wiederherstellung, `/v#CODE` |
| `client/src/components/KeyReveal.jsx` (neu) | Schlüssel einmal anzeigen |
| `client/src/components/InviteDialog.jsx` | eigene Gutscheine teilen |
| `client/src/components/AccessSettings.jsx` (neu) | Schlüssel erneuern, Benutzer anlegen |
| `client/src/pages/AdminPage.jsx` + `components/AdminVouchers.jsx` (neu) | Stapel anlegen und ansehen |

---

### Task 1: Codes, Konfiguration, Schema (Server)

**Files:**
- Create: `server/lib/codes.js`
- Modify: `server/config.js`, `server/db.js`
- Test: `server/test/codes.test.js`, `server/test/schema-vouchers.test.js`

**`server/lib/codes.js`:**

```js
const crypto = require('node:crypto')
const { codePepper } = require('../config')

// Crockford-Base32 ohne I, L, O, U – gut vorlesbar, keine Verwechslungen
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const CODE_LENGTH = 12 // 60 Bit Zufall

function generateCode() {
  let code = ''
  for (let i = 0; i < CODE_LENGTH; i += 1) code += ALPHABET[crypto.randomInt(ALPHABET.length)]
  return code
}

function formatCode(code) {
  return `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8, 12)}`
}

// Nachsichtig beim Eintippen: Groß/klein, Leerzeichen, Bindestriche egal; O→0, I/L→1
function normalizeCode(input) {
  if (typeof input !== 'string') return null
  const cleaned = input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
  if (cleaned.length !== CODE_LENGTH) return null
  for (const ch of cleaned) if (!ALPHABET.includes(ch)) return null
  return cleaned
}

function hashCode(code) {
  return crypto.createHmac('sha256', codePepper).update(code).digest('hex')
}

const cipherKey = () => crypto.createHash('sha256').update(`${codePepper}:voucher-cipher`).digest()

function encryptCode(code) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', cipherKey(), iv)
  const data = Buffer.concat([cipher.update(code, 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64')).join('.')
}

function decryptCode(stored) {
  const [iv, tag, data] = stored.split('.').map((part) => Buffer.from(part, 'base64'))
  const decipher = crypto.createDecipheriv('aes-256-gcm', cipherKey(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}

module.exports = { ALPHABET, CODE_LENGTH, generateCode, formatCode, normalizeCode, hashCode, encryptCode, decryptCode }
```

**`server/config.js`:**
- **`codePepper`:** In Produktion ist `CODE_PEPPER` Pflicht (mindestens 32 Zeichen, sonst beim Start `throw`, genau wie bei `JWT_SECRET`, dort nachsehen). In `dev`/`test` gilt der Fallback `'dev-code-pepper'`.
- **`voucherQuota`:** `Number(process.env.RUDEL_VOUCHER_QUOTA) || 3`.
- **`inviteCode` entfernen**, erst nachdem Task 3 alle Verwendungen entfernt hat. In Task 1 bleibt es noch.

**Schema** (`server/db.js`, idempotent, im bestehenden Stil):

```js
db.exec(`
  CREATE TABLE IF NOT EXISTS voucher_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('admin','rudel','partner','demo')),
    partner_id INTEGER,
    size INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS vouchers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id INTEGER NOT NULL REFERENCES voucher_batches(id),
    code_hash TEXT NOT NULL UNIQUE,
    code_cipher TEXT,
    code_hint TEXT NOT NULL,
    partner_id INTEGER,
    issued_by_family_id INTEGER REFERENCES families(id),
    join_family_id INTEGER REFERENCES families(id),
    redeemed_by_family_id INTEGER REFERENCES families(id),
    redeemed_at TEXT,
    expires_at TEXT,
    revoked_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_vouchers_issued ON vouchers(issued_by_family_id);
  CREATE INDEX IF NOT EXISTS idx_vouchers_batch ON vouchers(batch_id);
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    family_id INTEGER NOT NULL REFERENCES families(id),
    username TEXT NOT NULL COLLATE NOCASE UNIQUE,
    password_hash TEXT NOT NULL,
    email TEXT,
    session_epoch INTEGER NOT NULL DEFAULT 0,
    last_login_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_users_family ON users(family_id);
`)
addColumnIfMissing('families', 'access_key_hash', 'TEXT')
addColumnIfMissing('families', 'legacy_password', 'INTEGER NOT NULL DEFAULT 1')
addColumnIfMissing('families', 'auth_epoch', 'INTEGER NOT NULL DEFAULT 0')
addColumnIfMissing('families', 'voucher_id', 'INTEGER')
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_families_access_key ON families(access_key_hash) WHERE access_key_hash IS NOT NULL')
```

- `code_hint` ist das letzte Vierer-Stück, zum Beispiel „…QRST", damit man Codes zuordnen kann, ohne sie zu zeigen.
- Neue Familien aus einem Gutschein bekommen `password_hash = '!'` und `legacy_password = 0`. `'!'` kann nie zu einem bcrypt-Hash passen.

**Tests:**
- `codes.test.js`:
  - Länge und Alphabet von `generateCode`;
  - `formatCode`;
  - `normalizeCode` (klein, Leerzeichen, Bindestriche, O/I/L, zu kurz → null, U → null);
  - `hashCode` ist deterministisch und hängt vom Pepper ab (zweiter Prozess mit anderem Pepper, oder Hash gegen einen bekannten HMAC prüfen);
  - `encrypt`/`decrypt` hin und zurück; manipulierter Text wirft.
- `config`: `CODE_PEPPER` fehlt in Produktion → Start wirft (per Kindprozess mit `NODE_ENV=production`, gesetztem `JWT_SECRET` und ohne Pepper).
- `schema`: Tabellen und Spalten existieren. Alte Familien haben `legacy_password = 1`, `auth_epoch = 0`.

- [ ] Tests → scheitern → implementieren → alle Server-Tests grün
- [ ] Commit: `feat: Gutschein-Codes (Crockford, HMAC, AES-GCM) und Schema`

---

### Task 2: Einlösen, Login per Schlüssel, Sitzungs-Epoche (Server)

**Files:**
- Create: `server/lib/vouchers.js`, `server/routes/vouchers.js` (in `server/app.js` unter `/api` einhängen wie die anderen)
- Modify: `server/routes/auth.js`, `server/middleware/auth.js`, `server/middleware/abuse.js`
- Test: `server/test/vouchers.test.js`

**`lib/vouchers.js`:**
- `createBatch(db, { label, kind, size, issuedByFamilyId = null, joinFamilyId = null, partnerId = null, expiresAt = null })`:
  - legt den Stapel und `size` Codes an (`code_hash`, `code_cipher`, `code_hint`, weitere Felder);
  - gibt `{ batchId, codes: [plain…] }` zurück, nur für Aufrufer, die die Codes sofort brauchen (Tests, Seed, Admin).
  - Bei der seltenen Hash-Kollision einfach neu würfeln.
- `voucherStatus(row)` → `'offen' | 'eingelöst' | 'abgelaufen' | 'widerrufen'`.
- `redeemVoucher(db, { code, name, username, password, email })` → `{ familyId }` oder wirft einen Fehler mit `status`. Alles in **einer Transaktion**:
  1. `UPDATE vouchers SET redeemed_at = datetime('now'), code_cipher = NULL WHERE code_hash = ? AND redeemed_at IS NULL AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > datetime('now'))`. Nur bei genau einer geänderten Zeile geht es weiter. Sonst den Status prüfen und 410 „Dieser Gutschein wurde schon eingelöst“ bzw. „… ist abgelaufen“ oder „… wurde zurückgezogen“ werfen; unbekannt → 404 „Diesen Gutschein kennen wir nicht“.
  2. Familie anlegen: `art = 'zuhause'`, `theme = 'standard'`, `password_hash = '!'`, `legacy_password = 0`, `access_key_hash = hashCode(code)`, `voucher_id`.
  3. `vouchers.redeemed_by_family_id` setzen.
  4. `join_family_id` gesetzt und die Familie ist ein echtes Rudel (nicht Demo) → Mitgliedschaft anlegen.
  5. Benutzer anlegen, falls `username` und `password` mitkommen.
     - Benutzername: 3–40 Zeichen `[A-Za-z0-9._-]`.
     - Passwort: mindestens 8 Zeichen.
     - E-Mail: optional, höchstens 120 Zeichen, einfaches Format.
     - Benutzername vergeben → 409 „Benutzername ist vergeben“.
     - Kommt nur eins von beiden → 400.

**Middleware:**
- `codeLimiter` (per IP, 15 min, Standard 20, per Konfiguration `CODE_RATE_LIMIT`) in `middleware/abuse.js`.
- Die Sitzung trägt `e` (`families.auth_epoch` der Identität beim Login) und optional `uid`/`ue` (Benutzer und `session_epoch`).
- `requireSession` weist ab (401 „Sitzung abgelaufen – bitte neu anmelden“), wenn:
  - `payload.e ?? 0` nicht gleich `auth_epoch` der Identität ist, oder
  - `uid` gesetzt ist und `ue` nicht gleich `users.session_epoch` ist bzw. der Benutzer fehlt.
- Alte Tokens ohne `e` gelten, solange `auth_epoch` 0 ist.
- `signSession(familyId, activeFamilyId, { userId } = {})` liest die Epochen selbst.

**Endpunkte (`routes/vouchers.js`), alle POST, damit Codes nie in Logs landen:**

| Endpunkt | Schutz | Verhalten |
|---|---|---|
| `POST /api/vouchers/check { code }` | `codeLimiter` | `{ status }` (`offen/eingelöst/abgelaufen/widerrufen/unbekannt`). Ungültiges Format → `unbekannt`. |
| `POST /api/vouchers/redeem { code, name, username?, password?, email?, website }` | `codeLimiter`, `rejectHoneypot` | Ruft `redeemVoucher` auf, setzt die Sitzung, Antwort 201 `{ ...buildMe(id, id, false), key: formatCode(code), fromOthers: true }`. |

**Login (`routes/auth.js`, `POST /login`):**
- Nimmt `{ secret }`; `{ password }` gilt als Alias für alte Clients.
- `{ username, password }` → Benutzer-Login (Task 3).
- `normalizeCode(secret)` ergibt einen Code:
  - Familie mit `access_key_hash = hashCode(code)` → Login.
  - Sonst ein offener Gutschein mit diesem Hash → **409** `{ redeem: true }`.
  - Sonst weiter mit der alten Passwort-Schleife.
- Die Passwort-Schleife läuft nur über `legacy_password = 1` (siehe `findFamilyByPassword`).
- Nichts gefunden → 401 wie heute.

**Tests (`vouchers.test.js`):**
- Einlösen legt ein Zuhause an; `/me` hat `art: 'zuhause'`; die Antwort enthält den `key`.
- Zweites Einlösen → 410.
- Gleichzeitiges Einlösen (zwei parallele Requests) → genau einer 201.
- Abgelaufen, zurückgezogen und unbekannt ergeben die jeweilige Antwort.
- Login mit dem Code in allen Schreibweisen (klein, Leerzeichen, O statt 0) klappt.
- Login mit einem noch offenen Gutschein → 409 `{ redeem: true }`.
- Ein Einladungs-Gutschein aus Rudel R macht das Zuhause beim Einlösen zum Mitglied von R.
- Ein Gutschein mit `join_family_id` einer Demo-Familie → keine Mitgliedschaft.
- Honeypot beim Einlösen → 400.
- Alte Rudel-Passwörter funktionieren weiter; das Passwort `'!'` passt auf keine Familie.
- Sitzungs-Epoche: Wird `auth_epoch` direkt in der DB erhöht, bekommt das alte Cookie 401.
- `codeLimiter` greift (mit kleinem Limit per Umgebung).

- [ ] Tests → scheitern → implementieren → grün
- [ ] Commit: `feat: Gutschein einlösen – Meine Chronik mit Schlüssel, Login per Schlüssel`

---

### Task 3: Benutzer, Wiederherstellung, Schlüssel erneuern, Einladungscode entfernen (Server)

**Files:**
- Modify: `server/routes/vouchers.js`, `server/routes/auth.js`, `server/config.js`, `server/lib/families.js`, `server/test/helpers.js`
- Tests: bestehende anpassen, neu `server/test/access.test.js`

**Endpunkte:**

| Endpunkt | Schutz | Verhalten |
|---|---|---|
| `POST /api/login { username, password }` | `authLimiter` | Benutzer-Login. Die Sitzung bekommt die Identität `users.family_id` mit `uid`/`ue`, dazu `last_login_at`. Falscher Name oder falsches Passwort → dieselbe 401. |
| `POST /api/recover { code, username, newPassword }` | `codeLimiter` | Der Code ist der Schlüssel (`access_key_hash`) der Familie des Benutzers. Neues Passwort (≥ 8), `session_epoch + 1`, Antwort 204. Jede Unstimmigkeit → 400 „Schlüssel oder Benutzername stimmen nicht“, immer dieselbe Meldung. |
| `POST /api/family/key` | `requireAuth`, nicht Demo | Nur für die **Identität**, wenn sie der aktive Bereich ist. Erzeugt einen neuen Code als Schlüssel, `auth_epoch + 1`, setzt ein neues Cookie für die aktuelle Sitzung und gibt `{ key: formatCode(neu) }` **einmal** zurück. Alle anderen Geräte müssen sich neu anmelden. |
| `GET /api/users` | `requireAuth` | Benutzer der Identität: `[{ id, username, email, last_login_at }]` |
| `POST /api/users { username, password, email? }` | `requireAuth`, nicht Demo | Legt einen Benutzer der Identität an (Regeln wie oben). |
| `DELETE /api/users/:id` | `requireAuth`, nicht Demo | Nur Benutzer der eigenen Identität. |

**Einladungscode und alte Registrierung entfernen:**
- `POST /api/families` (Registrierung ohne Gutschein) samt Einladungscode-Prüfung und `quelle`-Eingabe fällt weg; die Spalte `quelle` bleibt.
- `GET /api/invite` fällt weg; die Antwort von `GET /api/config` enthält kein `inviteRequired` mehr.
- In `config.js` fällt `inviteCode` weg; `FAMILY_INVITE_CODE` wird ignoriert.
- `POST /api/families/group` (Familie gründen aus Meiner Chronik) bleibt mit Passwort (`legacy_password = 1`), denn beigetreten wird per Passwort.

**`deleteFamily`:** löscht die `users` der Familie. Bei Gutscheinen:
- `issued_by_family_id`, `join_family_id` und `redeemed_by_family_id` auf NULL setzen, damit die Statistik bleibt;
- noch offene Gutscheine, die die Familie ausgegeben hat, löschen.

**`server/test/helpers.js`:**
- `createFamily(base, name, password, extra)` legt eine **Alt-Familie direkt in der DB** an: bcrypt-Hash, `legacy_password = 1`, `art` aus `extra.art` oder `'rudel'`.
- Danach meldet sie sich per `/api/login` an und gibt `{ status: 201, data: me, cookie, res }` zurück. Die ungefähr 23 bestehenden Testdateien laufen so weiter.
- Validierungsfälle, die `POST /api/families` direkt testen (z. B. `security.test.js` für Einladungscode und doppeltes Passwort), werden durch Gutschein-Tests ersetzt. Doppeltes Passwort bleibt bei `families/group` testbar.
- Neu: `createHousehold(base, name, { username, password } = {})` legt per `lib/vouchers.createBatch` einen Gutschein an, löst ihn per API ein und gibt `{ …, key, cookie }` zurück.
- Tests, die ein Zuhause per `POST /api/families { art: 'zuhause' }` angelegt haben (`context.test.js`, `sharing*.test.js`, `uploadAccess.test.js` usw.), nutzen jetzt `createHousehold`.

**Tests (`access.test.js`):**
- Benutzer-Login; Benutzer anlegen und löschen; Benutzername schon vergeben.
- Wiederherstellung per Schlüssel: danach klappt das neue Passwort, alte Sitzungen des Benutzers → 401.
- Schlüssel erneuern: Der alte Schlüssel ergibt 401, der neue klappt, das Cookie eines anderen Geräts → 401, die eigene Sitzung läuft weiter.
- Die Demo darf keinen Schlüssel erneuern und keine Benutzer anlegen.
- `POST /api/families` → 404.

- [ ] Tests → scheitern → implementieren → **alle** Server-Tests grün
- [ ] Commit: `feat: Benutzer, Wiederherstellung per Schlüssel, Schlüssel erneuern; Einladungscode entfällt`

---

### Task 4: Weitergabe-Gutscheine, Admin-Stapel, Demo, Deploy (Server)

**Files:**
- Modify: `server/routes/vouchers.js`, `server/routes/admin.js`, `server/lib/demoPack.js`, `server/scripts/testenv-seed.js`, `deploy/remote.sh`, `manage.ps1` (UTF-8-BOM und CRLF behalten!), `.env.example`, `README.md` (Konfigurationstabelle)
- Test: `server/test/vouchersMine.test.js`, `server/test/adminVouchers.test.js`

- **`GET /api/vouchers/mine`** (`requireAuth`), gilt für den **aktiven Bereich**:
  - **Demo:** feste Schein-Liste mit drei Einträgen (`code: 'DEMO-0000-000A'` usw., Status gemischt) und `demo: true`. Nichts wird angelegt, und diese Codes lassen sich nicht einlösen (`normalizeCode` lehnt sie ab).
  - **Sonst:** Fehlen noch offene oder eingelöste Gutscheine, die dieser Bereich ausgegeben hat, bis zum Kontingent (`voucherQuota`), werden sie nachgelegt:
    - ein Stapel `kind: 'rudel'`, `label: 'Weitergabe <Name>'`;
    - `issued_by_family_id` = Bereich;
    - `join_family_id` = Bereich, falls `art = 'rudel'`, sonst null.
  - Rückgabe: `[{ id, code (formatiert, nur solange offen, entschlüsselt), hint, status, joins: boolean, redeemed_at, created_at }]`, die neuesten zuerst.
  - Es wird nicht endlos nachgefüllt: Eingelöste Gutscheine zählen mit.
- **Admin** (`requireAdmin`):
  - `POST /api/admin/voucher-batches { label, size (1–200), joinFamilyId? }` → `kind: 'admin'`. Antwort `{ batch, codes: [formatiert] }`.
  - `GET /api/admin/voucher-batches` → Liste mit Zählern (offen, eingelöst).
  - `GET /api/admin/voucher-batches/:id` → Codes mit Status und Klartext, solange offen.
  - `POST /api/admin/vouchers/:id/revoke`.
- **Demo-Pack:** keine echten Gutscheine anlegen; das Einlösen bleibt über die Schein-Liste demonstrierbar.
- **`testenv-seed.js`:**
  - legt in dev/staging einen Admin-Stapel „Testumgebung" mit 5 Codes an und gibt sie aus (Klartext **nur** in der Konsole);
  - der Test-Rudel bekommt einen Einladungs-Gutschein, der ebenfalls ausgegeben wird;
  - `--reset` räumt Gutscheine mit auf (`deleteFamily` plus Löschen verwaister Admin-Stapel).
- **Deploy:**
  - `remote.sh` `ensure_env`: `env_default CODE_PEPPER "$(openssl rand -hex 32)"`.
  - `FAMILY_INVITE_CODE`-Erzeugung, den Befehl `invite` und die Log-Zeile in `setup` entfernen; Kopfkommentar anpassen.
  - `manage.ps1`: Menüpunkt `[6] Einladungscode` entfernen oder ersetzen durch „Admin-Seite öffnen" (`Start-Process "https://$SiteHost:$HttpsPort/admin"`). BOM, CRLF und Parser prüfen.
  - `.env.example`: `CODE_PEPPER` (Pflicht in Produktion) und `RUDEL_VOUCHER_QUOTA`, `FAMILY_INVITE_CODE` raus.
  - **Wichtig:** `CODE_PEPPER` darf auf dem Server nach dem ersten Setzen nie mehr wechseln, sonst sind alle Codes wertlos. `env_default` überschreibt nie, und `.env` steckt schon im Backup.
- **Tests:**
  - Das Kontingent wird aufgefüllt und bleibt bei 3, auch wenn einer eingelöst ist.
  - Die Rudel-Gutscheine enthalten `joins: true`.
  - Die Demo bekommt die Schein-Liste, und in der DB entsteht nichts.
  - Admin-Stapel: Anlegen, Liste und Zurückziehen (danach → 410 beim Einlösen); kein Zugriff ohne Admin.

- [ ] Tests → scheitern → implementieren → grün; `bash -n deploy/remote.sh`; Prüfung von `manage.ps1` (Parser, BOM)
- [ ] Commit: `feat: Weitergabe-Gutscheine, Admin-Stapel, CODE_PEPPER im Deploy`

---

### Task 5: Login-Seite, Gutschein einlösen, `/v#CODE` (Client)

**Files:**
- Modify: `client/src/pages/LoginPage.jsx`, `client/src/App.jsx` (früher Zweig für `/v`), `client/src/api.js`
- Create: `client/src/components/RedeemForm.jsx`, `client/src/components/KeyReveal.jsx`, `client/src/components/RecoverForm.jsx`
- Tests dazu

- **`api.js`:**
  - `login(secret)` sendet `{ secret }`;
  - `loginUser(username, password)`;
  - `checkVoucher(code)`;
  - `redeemVoucher(payload)`;
  - `recover(payload)`;
  - `myVouchers()`;
  - `renewKey()`;
  - `listUsers()`, `createUser(p)`, `deleteUser(id)`.
- **Login-Modus:**
  - Ein Feld „Schlüssel oder Passwort" (Autocomplete `current-password`), Knopf „Chronik öffnen".
  - Link „Mit Benutzername anmelden": zeigt die Felder Benutzername und Passwort, sendet über `loginUser`.
  - Link „Schlüssel vergessen?": wechselt in den Wiederherstellungs-Modus.
  - Antwort 409 `{ redeem: true }` → Wechsel in den Einlöse-Modus mit vorausgefülltem Code, Hinweis „Das ist ein Gutschein – löst ihn ein, um eure Chronik anzulegen.".
- **Einlöse-Modus (Segment „Gutschein einlösen", ersetzt „Neu"):**
  - **Code-Feld:**
    - Schrift: Monospace;
    - Anzeige: formatiert `XXXX-XXXX-XXXX` beim Tippen;
    - beim Verlassen des Felds `checkVoucher` mit Statusanzeige.
  - Feld „Wie heißt euer Zuhause?".
  - Aufklappbar „Benutzername und eigenes Passwort (optional)": Benutzername, Passwort, E-Mail (optional, Hinweis „nur für Rückfragen, keine Werbung").
  - Honeypot bleibt.
  - Knopf „Meine Chronik anlegen".
  - Die Registrierung als „Gemeinsame Familie" entfällt hier, Familien gründet man in der App.
- **`KeyReveal`** nach dem Einlösen:
  - „Euer Schlüssel" groß in Monospace, Knopf „Kopieren";
  - Text: „Mit diesem Schlüssel meldet ihr euch an – auf jedem Gerät. Hebt ihn gut auf, er ist auch eure Wiederherstellung.";
  - Hinweis: „Wer euch die Karte gegeben hat, kennt diesen Code. Erneuert den Schlüssel später unter ‚… einstellen‘, wenn ihr sicher gehen wollt.";
  - Knopf „Weiter zu Meiner Chronik" → `onLogin(me)`.
- **Wiederherstellungs-Modus:** Schlüssel, Benutzername, neues Passwort → `recover` → Erfolg: „Passwort geändert – jetzt anmelden.". Ohne Benutzer gilt: Der Schlüssel selbst ist das Login, Hinweis „Kein Benutzer? Dann meldet euch einfach mit dem Schlüssel an.".
- **Route `/v`** (öffentlich, früher Zweig in `App.jsx` wie `/admin`):
  - liest den Code aus `location.hash`, entfernt ihn sofort per `history.replaceState` und zeigt die Login-Seite im Einlöse-Modus mit Code;
  - ist man schon eingeloggt: Karte „Du bist angemeldet als … – Abmelden und Gutschein einlösen" mit Knopf.
- **Texte:** Standard-Theme, denn die Login-Seite ist immer Standard. „Rudel" kommt nicht mehr vor.
- **Tests:**
  - Login sendet `secret`; Benutzer-Login;
  - 409 wechselt in den Einlöse-Modus;
  - Einlösen sendet die Felder;
  - `KeyReveal` wird gezeigt und `onLogin` erst nach „Weiter" aufgerufen;
  - `/v#abcd…` füllt den Code vor und leert den Hash;
  - Wiederherstellung.

- [ ] Tests → scheitern → implementieren → Tests und Build grün
- [ ] Commit: `feat: Login mit Schlüssel, Gutschein einlösen, /v#CODE, Wiederherstellung`

---

### Task 6: Gutscheine weitergeben, Zugang verwalten, Admin-Stapel (Client)

**Files:**
- Modify: `client/src/components/InviteDialog.jsx`, `client/src/components/FamilySettings.jsx`, `client/src/pages/AdminPage.jsx`
- Create: `client/src/components/AccessSettings.jsx`, `client/src/components/AdminVouchers.jsx`
- Tests dazu

- **`InviteDialog`** „Jemanden einladen":
  - Liste aus `myVouchers()`, je Gutschein:
    - Code (Monospace, formatiert);
    - Status-Chip (offen / eingelöst am …);
    - „Code kopieren", „Link kopieren" (`${location.origin}/v#<CODE ohne Bindestriche>`);
    - „Teilen" (`navigator.share`, wenn vorhanden).
  - Erklärtext je Bereich: im Rudel „Wer den Gutschein einlöst, bekommt eine eigene Chronik und ist gleich Mitglied in {Name}.", im Zuhause „… bekommt eine eigene Chronik.".
  - Der alte Weg „Adresse und Passwort weitergeben" bleibt für Familien mit altem Passwort als zweiter Abschnitt (nur wenn `family.art === 'rudel'`).
  - In der Demo die Schein-Liste mit dem Hinweis „Beispiel – in der Demo werden keine Gutscheine vergeben.".
- **`AccessSettings`** als Abschnitt „Zugang" in `FamilySettings`, nur wenn der aktive Bereich die Identität ist und keine Demo:
  - **„Schlüssel erneuern"**:
    - zweistufige Bestätigung, Hinweis „Alle anderen Geräte müssen sich danach neu anmelden.";
    - danach `KeyReveal`-Ansicht mit dem neuen Schlüssel.
  - **„Benutzer"**:
    - Liste (Name, letzte Anmeldung) mit Entfernen;
    - Formular Benutzername, Passwort, E-Mail optional.
- **Admin:**
  - Abschnitt „Gutscheine" (`AdminVouchers`) mit Formular (Bezeichnung, Anzahl 1–200, optional „tritt Familie bei" als Auswahl aus der Familienliste der Übersicht).
  - Nach dem Anlegen die Codes als Liste mit „Alle kopieren".
  - Stapel-Liste mit Zählern; ein Klick zeigt die Codes mit Status, „Zurückziehen" für offene.
- **Tests:**
  - `InviteDialog` zeigt die Codes und kopiert den Link (`navigator.clipboard` gemockt);
  - `AccessSettings`: Erneuern mit Bestätigung, Benutzer anlegen;
  - `AdminVouchers` legt einen Stapel an und zeigt die Codes.

- [ ] Tests → scheitern → implementieren → Tests und Build grün
- [ ] Commit: `feat: Gutscheine weitergeben, Schlüssel erneuern, Benutzer, Admin-Stapel`

---

### Task 7: Doku, Prüfung, Vorschau (Koordinator)

- [ ] README: Gutscheine statt Einladungscode, Schlüssel als Login und Wiederherstellung, Benutzer optional, Konfiguration (`CODE_PEPPER`, `RUDEL_VOUCHER_QUOTA`), Hinweis zur Datensicherung von `.env`.
- [ ] Roadmap: Phase 1 ✅/🚀, Log.
- [ ] Abschluss-Review über den ganzen Phasen-Diff (Sicherheit!).
- [ ] Browser-Prüfung (Testumgebung neu, Codes aus der Konsole):
  - einlösen → Schlüssel → Wegbegleiter;
  - abmelden → mit Schlüssel anmelden;
  - Gutschein der Test-Familie einlösen → Mitglied;
  - Schlüssel erneuern → altes Gerät raus;
  - Admin-Stapel;
  - `/v#CODE`;
  - Handy.
- [ ] Vorschau deployen (`CODE_PEPPER` wird automatisch erzeugt), Beispieldaten neu.
