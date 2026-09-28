# Phase D – Design & Themes („Familie auf Pfoten") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die App bekommt zwei Auftritte:
- **„Familie auf Pfoten"** (Standard): Pfoten-Logo, tierneutrale Texte, „Familie" statt „Rudel".
- **„Berner"**: heutiges Wappen, Dreifarb-Streifen, heutige Texte.

Jede Familie wählt ihren Auftritt selbst, mit Live-Vorschau. Zusätzlich verschwindet überall „Adoptiv-…" zugunsten von „lebt mit".

**Architecture:**
- **Server:** speichert `families.theme` und liefert den Wert bei `/me`, Login und Demo mit. Bestehende Rudel werden bei der Migration auf `berner` gesetzt.
- **Client:** beschreibt jedes Theme als Datenobjekt mit Logo-Komponente, App-Name, Texten und Wortschatz. Ein `ThemeProvider` setzt `<html data-theme>`, Titel und Favicon. Komponenten holen ihre Texte über `useTheme()`.
- **Farben:** Die Farben (`tokens.css`) bleiben für beide Themes unverändert.

**Tech Stack:** Node 24, Express 4, better-sqlite3, node:test; React 18, Vite 6, Vitest 4 (jsdom, `react-dom/client` + `act`).

**Grundlage:** [Konzept, Abschnitt „Design: Name, Farbschema, Themes"](../specs/2026-09-27-marketing-gutscheine-partner-design.md), [Roadmap](2026-09-28-familie-auf-pfoten-roadmap.md).

**Regeln für alle Tasks:**
- Branch `staging`, nie pushen.
- Commit-Trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Keine echten Namen aus Nutzerdaten in Tests oder Beispielen. Erlaubt sind neutrale Namen wie Hermes, Emma, Luna, Minka.
- **Das Berner-Theme muss die heutigen Texte exakt wiedergeben.** Für heutige Nutzer ändert sich nichts außer „lebt mit".

---

## Dateien

| Datei | Aufgabe |
|---|---|
| `server/lib/themes.js` (neu) | Liste der erlaubten Themes, `isTheme()` |
| `server/db.js` | Spalte `families.theme`, Migration bestehender Rudel auf `berner` |
| `server/routes/auth.js` | `theme` in `/me`, `/login`, `/demo`, `POST /families`; `PUT /family` nimmt `theme` an |
| `server/lib/demoPack.js`, `server/scripts/testenv-seed.js` | Demo mit wählbarem Theme; Vorschau-Demo im Standard |
| `client/src/themes/standard.js`, `berner.js`, `index.js` (neu) | Theme-Daten |
| `client/src/themes/ThemeProvider.jsx` (neu) | Kontext, `useTheme()`, `data-theme`, Titel, Favicon, Vorschau |
| `client/src/components/PawMark.jsx`, `ThemeMark.jsx` (neu) | Pfoten-Logo, Logo je Theme |
| `client/public/favicon.svg`, `favicon-berner.svg` | Pfote (Standard), heutiges Icon (Berner) |
| `client/src/App.jsx`, `pages/*`, `components/*` | Logo, Name, Streifen, Texte je Theme |
| `client/src/components/ThemePicker.jsx`, `FamilySettings.jsx` (neu) | Einstellungen: Name und Aussehen |
| `client/src/lib/timeline.js` u. a. | „lebt mit" statt „Adoptiv-…" |

---

### Task 1: Theme im Server

**Files:**
- Create: `server/lib/themes.js`
- Modify: `server/db.js:133-142`, `server/routes/auth.js`, `server/lib/demoPack.js`, `server/scripts/testenv-seed.js`
- Test: `server/test/theme.test.js`

- [ ] **Step 1: Failing tests schreiben** – `server/test/theme.test.js`

Nach dem Muster von `server/test/appenv.test.js` (`useTempDataDir`, `startApp`, `call`, `cleanup`) und den
Helfern aus `server/test/helpers.js` (`createFamily` usw., vorher lesen). Fälle:

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const Database = require('better-sqlite3')
const { useTempDataDir, startApp, cleanup, call, createFamily } = require('./helpers')

const dataDir = useTempDataDir('theme')

test('new families start with the standard theme, /me and login report it', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const { cookie } = await createFamily(base)            // Signatur im Helper prüfen
  const me = await call(base, '/api/me', { cookie })
  assert.equal(me.data.theme, 'standard')
})

test('PUT /api/family switches the theme and rejects unknown ones', async (t) => { /* berner → 200 + /me berner; 'pink' → 400; {} → 400; Name allein funktioniert weiter */ })

test('the read-only demo cannot change its theme', async (t) => { /* /api/demo → theme im Body; PUT → 403 */ })

test('existing families are migrated to the berner theme', () => {
  // Alte Datenbank ohne theme-Spalte anlegen, dann db.js in einem eigenen Prozess laden
  const dir = path.join(dataDir, 'legacy')
  require('node:fs').mkdirSync(dir, { recursive: true })
  const legacy = new Database(path.join(dir, 'data.db'))
  legacy.exec(`CREATE TABLE families (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
    password_hash TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')))`)
  legacy.prepare("INSERT INTO families (name, password_hash) VALUES ('Altes Rudel', 'x')").run()
  legacy.close()
  execFileSync(process.execPath, ['-e', "require('./db')"], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, DATA_DIR: dir, DB_PATH: path.join(dir, 'data.db') }
  })
  const db = new Database(path.join(dir, 'data.db'))
  assert.equal(db.prepare('SELECT theme FROM families').get().theme, 'berner')
  db.close()
})

test('createDemoPack keeps berner by default and accepts a theme', () => { /* über lib/demoPack mit Test-DB */ })
```

- [ ] **Step 2: Tests laufen lassen, sie müssen scheitern**

Run: `npm --prefix server test -- --test-name-pattern theme` (bzw. `node --test test/theme.test.js` in `server/`)
Expected: FAIL, weil `theme` fehlt.

- [ ] **Step 3: Implementieren**

`server/lib/themes.js`:

```js
// Erlaubte Auftritte einer Familie – muss zu client/src/themes/index.js passen
const THEMES = ['standard', 'berner']

function isTheme(value) {
  return THEMES.includes(value)
}

module.exports = { THEMES, isTheme }
```

`server/db.js`: `addColumnIfMissing` gibt zurück, ob es die Spalte angelegt hat:

```js
function addColumnIfMissing(table, column, definition) {
  const exists = db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column)
  if (exists) return false
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  return true
}
```

und nach den bestehenden Aufrufen:

```js
// Bestehende Rudel behalten ihren Berner-Auftritt, neue Familien starten mit „Familie auf Pfoten"
if (addColumnIfMissing('families', 'theme', "TEXT NOT NULL DEFAULT 'standard'")) {
  db.exec("UPDATE families SET theme = 'berner'")
}
```

`server/routes/auth.js`:
- `SELECT` in `/me`, `/demo` und `findFamilyByPassword` um `theme` ergänzen. Die Antworten von `/login`, `/demo` und
  `POST /families` enthalten `theme`; `POST /families` antwortet mit `theme: 'standard'`.
- `PUT /family`:

```js
// Name und/oder Aussehen der Familie ändern – betrifft alle, die das gemeinsame Passwort nutzen
router.put('/family', requireAuth, (req, res) => {
  const { name, theme } = req.body || {}
  if (name === undefined && theme === undefined) {
    return res.status(400).json({ error: 'Nichts zu ändern' })
  }
  const updates = {}
  if (name !== undefined) {
    const trimmedName = typeof name === 'string' ? name.trim() : ''
    if (!trimmedName) return res.status(400).json({ error: 'Der Name darf nicht leer sein' })
    if (trimmedName.length > MAX_NAME_LENGTH) {
      return res.status(400).json({ error: `Der Name darf höchstens ${MAX_NAME_LENGTH} Zeichen haben` })
    }
    updates.name = trimmedName
  }
  if (theme !== undefined) {
    if (!isTheme(theme)) return res.status(400).json({ error: 'Dieses Aussehen gibt es nicht' })
    updates.theme = theme
  }
  if (updates.name) db.prepare('UPDATE families SET name = ? WHERE id = ?').run(updates.name, req.familyId)
  if (updates.theme) db.prepare('UPDATE families SET theme = ? WHERE id = ?').run(updates.theme, req.familyId)
  res.json(db.prepare('SELECT id, name, theme FROM families WHERE id = ?').get(req.familyId))
})
```

  Bestehende Tests prüfen evtl. die alten Fehlertexte („Der Rudelname darf nicht leer sein") – mit `grep -rn
  "Rudelname" server/test` suchen und anpassen.
- `server/lib/demoPack.js`: `createDemoPack(db, { password, isDemo, copyImage, name = FAMILY_NAME, theme = 'berner' })`
  schreibt `theme` mit ins `INSERT`. `replaceDemoPack(db, uploadDir, { theme } = {})` reicht `theme` durch.
- `server/scripts/testenv-seed.js`: `replaceDemoPack(db, uploadDir, { theme: 'standard' })`. Die öffentliche Demo der
  Vorschau zeigt den neuen Auftritt, das Test-Rudel bleibt `berner`. So sind lokal und auf der Vorschau beide Themes
  zu sehen.

- [ ] **Step 4: Tests grün** – `npm --prefix server test` komplett grün.

- [ ] **Step 5: Commit** – `git add server/ && git commit -m "feat: families.theme (standard|berner), bestehende Rudel behalten Berner"`

---

### Task 2: Theme-Daten und `ThemeProvider`

**Files:**
- Create: `client/src/themes/standard.js`, `client/src/themes/berner.js`, `client/src/themes/index.js`,
  `client/src/themes/ThemeProvider.jsx`
- Test: `client/src/themes/themes.test.js`, `client/src/themes/ThemeProvider.test.jsx`

`Mark` (die Logo-Komponente) kommt erst in Task 3 dazu. Bis dahin bleibt `Mark` weg, damit dieser Task allein
lauffähig ist.

- [ ] **Step 1: Failing tests**

`client/src/themes/themes.test.js`:

```js
import { describe, expect, test } from 'vitest'
import { THEME_IDS, getTheme } from './index.js'

describe('themes', () => {
  test('standard and berner are available, unknown ids fall back to standard', () => {
    expect(THEME_IDS).toEqual(['standard', 'berner'])
    expect(getTheme('berner').id).toBe('berner')
    expect(getTheme('pink').id).toBe('standard')
    expect(getTheme(undefined).id).toBe('standard')
  })

  test('both themes define the same words, none empty', () => {
    const standard = getTheme('standard')
    const berner = getTheme('berner')
    expect(Object.keys(berner.words).sort()).toEqual(Object.keys(standard.words).sort())
    for (const theme of [standard, berner]) {
      for (const [key, value] of Object.entries(theme.words)) expect(value, key).toMatch(/\S/)
    }
  })

  test('berner keeps the wording families know today', () => {
    const { words, appName } = getTheme('berner')
    expect(appName).toBe('Familienchronik')
    expect(words.newsTitle).toBe('Neu im Rudel')
    expect(words.inGroup).toBe('im Rudel')
    expect(getTheme('standard').words.newsTitle).toBe('Neu in der Familie')
  })
})
```

`client/src/themes/ThemeProvider.test.jsx`: Muster wie `client/src/components/EnvBanner.test.jsx`
(`createRoot` + `act`). Fälle:
- `<ThemeProvider themeId="berner">` setzt `document.documentElement.dataset.theme` auf `berner` und `document.title`
  auf `Familienchronik`.
- Eine Testkomponente ruft `setPreviewId('standard')` auf. Danach steht `data-theme` auf `standard`. Nach einem
  Rerender mit anderer `themeId` gilt wieder die gespeicherte.
- `useTheme()` außerhalb eines Providers liefert Standard.

- [ ] **Step 2: Scheitern sehen** – `npm --prefix client test -- themes`

- [ ] **Step 3: Implementieren**

`client/src/themes/standard.js`:

```js
// „Familie auf Pfoten" – tierneutraler Standard-Auftritt
export default {
  id: 'standard',
  label: 'Familie auf Pfoten',
  description: 'Pfoten-Logo, für alle Tierarten',
  appName: 'Familie auf Pfoten',
  footer: 'Familie auf Pfoten · Eine tierisch nette Familie',
  tricolor: false,
  favicon: '/favicon.svg',
  words: {
    group: 'Familie',
    theGroup: 'die Familie',
    TheGroup: 'Die Familie',
    thisGroup: 'diese Familie',
    inGroup: 'in der Familie',
    ofGroup: 'der Familie',
    ofAGroup: 'einer Familie',
    yourGroup: 'eure Familie',
    yourGroupDat: 'eurer Familie',
    ourGroup: 'Unsere Familie',
    ownGroup: 'eine eigene Familie',
    newGroup: 'Neue Familie',
    createGroup: 'Familie anlegen',
    createOwnGroup: 'Eigene Familie anlegen',
    groupName: 'Name der Familie',
    newGroupName: 'Neuer Name',
    groupNamePlaceholder: 'z. B. Familie Sonnenhang',
    groupPassword: 'Familien-Passwort',
    groupSettings: 'Familie einstellen',
    newsTitle: 'Neu in der Familie',
    animal: 'Tier',
    animals: 'Tiere'
  },
  texts: {
    loginKicker: 'Eine Familie · viele Zuhause',
    loginHeadline: ['Wie geht’s den anderen', 'Fellnasen?'],
    loginLede:
      'Tiere, die zusammengehören, leben oft in verschiedenen Zuhause. Hier bleibt ihr verbunden: Klickt ein Tier an und schaut nach, was es so treibt.',
    loginFacts: [
      ['Familie', 'wer zu wem gehört'],
      ['Chronik', 'was jedes Tier erlebt'],
      ['Pinnwand', 'Treffen und Notizen für alle']
    ],
    overviewLede:
      'Damit wir wissen, was die anderen treiben: Klick ein Tier an und schau nach, wie es ihm geht – oder erzähl, was es gerade erlebt.',
    feedEmpty: 'Klick ein Tier an und erzähl, was es so treibt'
  }
}
```

`client/src/themes/berner.js`: gleiche Schlüssel, Werte **exakt aus dem heutigen Code übernommen**. Die Stellen findet
`grep -rn "Rudel\|Hund" client/src`, siehe Task 5. Beispiele:

```js
// Berner-Auftritt: Wappen, Dreifarb-Streifen und die Texte, die bestehende Rudel kennen
export default {
  id: 'berner',
  label: 'Berner',
  description: 'Berner-Wappen und Dreifarb-Streifen',
  appName: 'Familienchronik',
  footer: 'Familienchronik · damit wir wissen, wie es den anderen geht',
  tricolor: true,
  favicon: '/favicon-berner.svg',
  words: {
    group: 'Rudel', theGroup: 'das Rudel', TheGroup: 'Das Rudel', thisGroup: 'dieses Rudel', inGroup: 'im Rudel',
    ofGroup: 'des Rudels', ofAGroup: 'eines Rudels', yourGroup: 'euer Rudel', yourGroupDat: 'eurem Rudel',
    ourGroup: 'Unser Rudel', ownGroup: 'ein eigenes Rudel', newGroup: 'Neues Rudel', createGroup: 'Rudel anlegen',
    createOwnGroup: 'Eigenes Rudel anlegen', groupName: 'Name des Rudels', newGroupName: 'Neuer Rudelname',
    groupNamePlaceholder: 'z. B. Rudel vom Sonnenhang', groupPassword: 'Rudel-Passwort',
    groupSettings: 'Rudel einstellen', newsTitle: 'Neu im Rudel', animal: 'Hund', animals: 'Hunde'
  },
  texts: {
    loginKicker: 'Eine Familie · viele Zuhause',
    loginHeadline: ['Wie geht’s', 'den anderen?'],
    loginLede:
      'Geschwister, Eltern und Großeltern leben in verschiedenen Familien. Hier bleibt ihr verbunden: Klickt einen Hund an und schaut nach, was er so treibt.',
    loginFacts: [
      ['Stammbaum', 'wer mit wem verwandt ist'],
      ['Chronik', 'was jeder Hund erlebt'],
      ['Pinnwand', 'Treffen und Notizen für alle']
    ],
    overviewLede:
      'Damit wir wissen, was die anderen treiben: Klick einen Hund an und schau nach, wie es ihm geht – oder erzähl, was er gerade erlebt.',
    feedEmpty: 'Klick einen Hund an und erzähl, was er so treibt'
  }
}
```

(Formatierung per Prettier-Stil des Projekts, ein Schlüssel pro Zeile.) Braucht Task 5 weitere Wörter, kommen sie
dort in **beide** Dateien. Der Schlüsseltest sichert das ab.

`client/src/themes/index.js`:

```js
import berner from './berner.js'
import standard from './standard.js'

// Reihenfolge = Reihenfolge in der Auswahl; muss zu server/lib/themes.js passen
export const THEMES = { standard, berner }
export const THEME_IDS = Object.keys(THEMES)

export function getTheme(id) {
  return THEMES[id] || THEMES.standard
}
```

`client/src/themes/ThemeProvider.jsx`:

```jsx
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { getTheme } from './index.js'

const ThemeContext = createContext(null)
const noop = () => {}

// Setzt das Aussehen der Familie: data-theme am <html>, Fenstertitel und Favicon.
// setPreviewId zeigt ein anderes Theme vorübergehend (Auswahl in den Einstellungen), ohne zu speichern.
export function ThemeProvider({ themeId, children }) {
  const [previewId, setPreviewId] = useState(null)
  const theme = getTheme(previewId || themeId)

  useEffect(() => setPreviewId(null), [themeId])

  useEffect(() => {
    document.documentElement.dataset.theme = theme.id
    document.title = theme.appName
    const icon = document.querySelector('link[rel="icon"]')
    if (icon) icon.setAttribute('href', theme.favicon)
  }, [theme])

  const value = useMemo(() => ({ theme, words: theme.words, setPreviewId }), [theme])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const value = useContext(ThemeContext)
  if (value) return value
  const theme = getTheme('standard')
  return { theme, words: theme.words, setPreviewId: noop }
}
```

- [ ] **Step 4: Grün** – `npm --prefix client test`
- [ ] **Step 5: Commit** – `feat: Themes Standard und Berner als Daten, ThemeProvider mit Vorschau`

---

### Task 3: Pfoten-Logo, `ThemeMark`, Favicons

**Files:**
- Create: `client/src/components/PawMark.jsx`, `client/src/components/ThemeMark.jsx`, `client/public/favicon-berner.svg`
- Modify: `client/public/favicon.svg`, `client/src/themes/standard.js`, `client/src/themes/berner.js`
- Test: `client/src/components/ThemeMark.test.jsx`

- [ ] **Step 1: Failing test** – `ThemeMark` rendert im Standard ein SVG mit `data-mark="paw"`, im Berner-Theme
  `data-mark="berner"`. `title` wird zum zugänglichen Namen (`role="img"`), ohne `title` ist das Logo `aria-hidden`.
- [ ] **Step 2: Scheitern sehen**
- [ ] **Step 3: Implementieren**

`client/src/components/PawMark.jsx`: Gleiches Medaillon wie `BernerMark`, also Creme-Kreis, Rost-Ring und dunkle
Zehenballen. Der Hauptballen ist ein Herz in Rost, als Bild für die tierisch nette Familie.

```jsx
// Logo von „Familie auf Pfoten": Pfote im Medaillon, der Ballen ist ein Herz
export default function PawMark({ size = 40, title, className }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      data-mark="paw"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : 'true'}
    >
      {title && <title>{title}</title>}
      <circle cx="32" cy="32" r="31" fill="#f1e2cc" />
      <circle cx="32" cy="32" r="31" fill="none" stroke="#b5541f" strokeWidth="2" />
      <ellipse cx="18.6" cy="29" rx="4.3" ry="5.4" transform="rotate(-24 18.6 29)" fill="#1c1511" />
      <ellipse cx="26.4" cy="19.6" rx="4.6" ry="5.8" transform="rotate(-8 26.4 19.6)" fill="#1c1511" />
      <ellipse cx="37.6" cy="19.6" rx="4.6" ry="5.8" transform="rotate(8 37.6 19.6)" fill="#1c1511" />
      <ellipse cx="45.4" cy="29" rx="4.3" ry="5.4" transform="rotate(24 45.4 29)" fill="#1c1511" />
      <path
        d="M32 52c-1.1 0-2.4-.7-3.7-1.8C23.2 45.9 19.4 42.3 19.4 37.8c0-3.6 2.7-6.4 6.1-6.4 2.6 0 4.7 1.4 6.5 3.7 1.8-2.3 3.9-3.7 6.5-3.7 3.4 0 6.1 2.8 6.1 6.4 0 4.5-3.8 8.1-8.9 12.4-1.3 1.1-2.6 1.8-3.7 1.8Z"
        fill="#b5541f"
      />
    </svg>
  )
}
```

  `BernerMark.jsx` bekommt `data-mark="berner"`.

`client/src/components/ThemeMark.jsx`:

```jsx
import { useTheme } from '../themes/ThemeProvider.jsx'

// Das Logo des aktuellen Auftritts (Pfote oder Berner-Wappen)
export default function ThemeMark(props) {
  const { theme } = useTheme()
  const Mark = theme.Mark
  return <Mark {...props} />
}
```

  In `standard.js` `Mark: PawMark` und in `berner.js` `Mark: BernerMark` ergänzen (Import der Komponente). Der
  Themes-Test aus Task 2 bleibt grün.
- Favicons:
  - `client/public/favicon.svg` nach `favicon-berner.svg` kopieren.
  - `favicon.svg` durch das Pfoten-SVG ersetzen (derselbe Inhalt wie `PawMark`, mit `xmlns`, ohne React-Attribute).
- [ ] **Step 4: Grün** – `npm --prefix client test`
- [ ] **Step 5: Commit** – `feat: Pfoten-Logo, ThemeMark und Favicon je Theme`

---

### Task 4: App-Rahmen je Theme

**Files:**
- Modify: `client/src/App.jsx`, `client/src/pages/LoginPage.jsx`, `client/src/pages/OverviewPage.jsx`,
  `client/src/pages/AdminPage.jsx`, `client/src/components/collage/CollagePageView.jsx`, `client/index.html`,
  `client/src/styles/collage.css` (nur falls für den Standard-Rahmen nötig)

- [ ] **Step 1:** In `App.jsx` den gesamten Rückgabewert von `App` in `<ThemeProvider themeId={…}>` legen:
  - eingeloggt: `family.theme`
  - Splash, Login und Admin: `'standard'`

  `<BernerMark>` wird überall zu `<ThemeMark>`: App-Header, Splash, Login-Hero, leerer Stammbaum in
  `OverviewPage`, `AdminPage` (Admin immer Standard).
- [ ] **Step 2:** Header: `brand-name` = `theme.appName`. Footer: `theme.footer` statt des festen Texts; die
  `tricolor`-Leiste nur, wenn `theme.tricolor`. `DemoBanner`: `words.createOwnGroup`.
- [ ] **Step 3:** Login-Hero:
  - Kicker, Headline (zwei Zeilen, zweite in `<em>`), Lede und Fakten aus `theme.texts`.
  - Die senkrechte `tricolor-vertical` nur bei `theme.tricolor`.
  - Prüfen, dass das Layout ohne den Streifen nicht springt. Ggf. über `.login-hero` einen Rand in `--line` bei
    `[data-theme="standard"]` (in `login.css`).
- [ ] **Step 4:** Collage: `cpage-brand` = `theme.appName`. Die Dreifarb-Leisten oben und unten nur bei
  `theme.tricolor`, sonst eine dünne Linie in `--rust` (`.cpage-rule`, 3px) an derselben Stelle.
- [ ] **Step 5:** `client/index.html`: `<title>Familie auf Pfoten</title>`, Beschreibung
  `Familie auf Pfoten – eine tierisch nette Familie: die gemeinsame Chronik eurer Tiere mit Stammbaum, Erinnerungen und Pinnwand.`
- [ ] **Step 6:** `npm --prefix client test` und `npm --prefix client run build` grün.
- [ ] **Step 7: Commit** – `feat: Logo, Name, Streifen und Login-Texte je Theme`

---

### Task 5: Wortschatz je Theme

**Files:** alle Client-Dateien mit sichtbarem „Rudel" bzw. „Hund(e)" als Gruppen- oder Tierbegriff, laut
Bestandsaufnahme:
- `pages/LoginPage.jsx` (Formulare und Demo-Hinweis)
- `pages/OverviewPage.jsx` (Statistik „Hund/Hunde", Toast nach Umbenennen, `aria-label`, Lede)
- `components/InviteDialog.jsx`, `components/RenameFamilyForm.jsx`, `components/ActivityFeed.jsx`
- `pages/DogDetailPage.jsx:350`, `pages/LittersPage.jsx:142`, `pages/PinboardPage.jsx:141`,
  `pages/ContactAdminPage.jsx:12,132`, `components/LitterCard.jsx:69`, `components/BreedingRecords.jsx:57`
- `lib/collage/pages.js:44` („Unser Rudel", als Parameter vom Aufrufer)

**Nicht anfassen:**
- Tierart-Beschriftungen (Rüde/Hündin usw. in `lib/timeline.js`)
- „Würfe"/„Deckakt"
- den Admin-Bereich (intern, bleibt „Rudel")
- Kommentare im Code

- [ ] **Step 1: Failing tests**, zum Beispiel `components/ActivityFeed.test.jsx`:
  - im Berner-Provider steht „Neu im Rudel", im Standard „Neu in der Familie";
  - der Leertext folgt `texts.feedEmpty`;
  - dazu ein Test für `RenameFamilyForm` („Das betrifft alle im Rudel." bzw. „… in der Familie.").
- [ ] **Step 2: Scheitern sehen**
- [ ] **Step 3:** Jede Stelle nutzt `const { words, theme } = useTheme()`. Wo ein Satz grammatisch nicht mit den
  Wörtern aufgeht, einen ganzen Satz in `texts` beider Themes anlegen, statt Wörter zu verketten. **Berner-Werte =
  exakt der heutige Text** (vorher per `git grep` festhalten). Beispiel `RenameFamilyForm`:
  `<strong>Das betrifft alle {words.inGroup}.</strong>`, Label `{words.newGroupName}`. Der Demo-Hinweis im Login
  lautet für beide: „Ohne Anmeldung, schreibgeschützt – mit Beispiel-Tieren über mehrere Generationen."
- [ ] **Step 4: Prüfen**:
  - `grep -rn "Rudel" client/src --include=*.jsx | grep -v "^client/src/pages/AdminPage\|AdminFamilyDetails\|//"`
    zeigt nur noch Code-Kommentare bzw. Theme-Dateien.
  - Tests und Build sind grün.
- [ ] **Step 5: Commit** – `feat: Texte je Theme – Familie oder Rudel, Tier oder Hund`

---

### Task 6: „lebt mit" statt „Adoptiv-…"

**Files:**
- Modify: `client/src/lib/timeline.js:37-44` (+ Test), `client/src/components/PedigreeTree.jsx:128-137`,
  `client/src/pages/DogDetailPage.jsx:32-36`, `client/src/components/DogForm.jsx:227`,
  `client/src/components/DogCard.jsx` (Prop-Name), Kommentare in `Housemates.jsx`, `lib/pedigree.js`,
  `server/routes/dogs.js:174`, `README.md` („Adoptiv-Geschwister & andere Tiere")

- [ ] **Step 1: Failing test** in `client/src/lib/timeline.test.js`: `adoptiveTitle` wird zu

```js
test('livesWithLabel names the animals someone lives with', () => {
  expect(livesWithLabel([{ name: 'Hermes' }])).toBe('lebt mit Hermes')
  expect(livesWithLabel([{ name: 'Hermes' }, { name: 'Minka' }])).toBe('lebt mit Hermes & Minka')
})
```

  (`displayName` für unbekannte Namen verwenden wie bisher.) Die alten `adoptiveTitle`-Tests entfallen.
- [ ] **Step 2: Scheitern sehen**
- [ ] **Step 3:** Umsetzen:
  - `livesWithLabel(dogs)` in `lib/timeline.js`, `adoptiveTitle` löschen.
  - Tierseite: „lebt mit Hermes & Minka".
  - Baum-Karten in der Mitbewohner-Reihe: „lebt mit Hermes".
  - `DogCard`-Prop `adoptiveLabel` → `livesWithLabel`, CSS-Klassen `is-adoptive`/`dog-card-adoptive`/
    `dog-hero-adoptive` → `is-housemate`/`dog-card-housemate`/`dog-hero-housemate` (CSS mitziehen, `grep -rn adoptive client/src`).
  - Formular-Hinweis: „(optional, für Tiere ohne gemeinsame Abstammung)".
  - Kommentare sprechen von „Mitbewohnern".
  - README: „Mitbewohner & andere Tiere". Beispiel „Adoptiv-Katze von Hermes" → „lebt mit Hermes".
- [ ] **Step 4:** `grep -rni adoptiv client/src server README.md` → keine Treffer. Tests und Build grün.
- [ ] **Step 5: Commit** – `feat: „lebt mit" statt „Adoptiv-…"`

---

### Task 7: Einstellungen mit Theme-Auswahl

**Files:**
- Create: `client/src/components/ThemePicker.jsx`, `client/src/components/FamilySettings.jsx`,
  `client/src/styles/settings.css` (in `global.css` importieren wie die anderen)
- Modify: `client/src/api.js` (`updateFamily`), `client/src/pages/OverviewPage.jsx` (Modal)
- Test: `client/src/components/ThemePicker.test.jsx`

- [ ] **Step 1: Failing tests** (`vi.mock('../api.js', …)` für `api.updateFamily`):
  - Auswahl „Berner" setzt sofort `document.documentElement.dataset.theme = 'berner'` (Vorschau);
  - „Übernehmen" ruft `api.updateFamily({ theme: 'berner' })` und `onSaved` mit der Antwort;
  - im Demo-Modus (`DemoProvider value={true}`) ist „Übernehmen" deaktiviert und ein Hinweis sichtbar;
  - Schließen ohne Speichern setzt die Vorschau zurück (Unmount → `setPreviewId(null)`).
- [ ] **Step 2: Scheitern sehen**
- [ ] **Step 3: Implementieren**
  - `api.js`: `updateFamily: (payload) => request('/family', json('PUT', payload))`.
  - `ThemePicker({ family, onSaved })`:
    - `fieldset` mit `legend` „Aussehen"; je Theme eine Karte als `label` mit `input type="radio"`.
    - Jede Karte zeigt das Theme-Logo (`theme.Mark`, 44px), `label`, `description`, eine kleine Vorschau-Leiste
      (Dreifarb-Streifen bzw. Rost-Linie) und den Gruppennamen („Familie"/„Rudel").
    - Auswahl → `setPreviewId(id)`. Knopf „Übernehmen" (deaktiviert, wenn unverändert oder Demo) →
      `api.updateFamily({ theme })` → `onSaved(updated)`.
    - Unmount → `setPreviewId(null)`.
    - Tastatur: native Radios, sichtbarer Fokus (`:focus-visible` auf der Karte über `:has(input:focus-visible)`).
  - `FamilySettings({ family, onChange, onClose })`: zwei Abschnitte, „Name" (bestehendes `RenameFamilyForm`) und
    „Aussehen" (`ThemePicker`). `onChange` bekommt immer `{ ...family, ...updated }`, damit `isDemo` erhalten bleibt.
  - `OverviewPage`:
    - Der Stift-Knopf öffnet `FamilySettings` im Modal, Titel `words.groupSettings`; `aria-label` und `title`
      ebenfalls `words.groupSettings`.
    - Toast nach Theme-Wechsel: „Neues Aussehen gespeichert"; nach Umbenennen wie bisher.
    - `handleRenamed` merged ebenfalls `{ ...family, ...renamed }`.
- [ ] **Step 4:** Tests und Build grün.
- [ ] **Step 5: Commit** – `feat: Einstellungen mit Theme-Auswahl und Live-Vorschau`

---

### Task 8: Doku und Roadmap

- [ ] README → Funktionen: neuer Punkt **„Aussehen"**: „Familie auf Pfoten" (Pfoten-Logo, tierneutrale Texte) oder
  „Berner" (Wappen, Dreifarb-Streifen). Jede Familie wählt selbst unter „Familie einstellen", bestehende Rudel
  behalten Berner.
- [ ] Roadmap: Phase D auf ✅ bzw. 🚀 setzen, Fortschritts-Log ergänzen.
- [ ] Commit – `docs: Themes in README und Roadmap`

---

### Task 9 (Koordinator): Prüfen und auf die Vorschau bringen

- [ ] `npm run testenv:reset`, dann `npm run dev:test`. Playwright-Skript (Scratchpad):
  - Login-Seite im Standard: Pfote, „Familie auf Pfoten", kein Streifen.
  - „Demo ansehen" zeigt den Standard: „Neu in der Familie", „Tiere".
  - Login ins Test-Rudel (Passwort aus `testenv-seed`) zeigt Berner: Wappen, Streifen, „Neu im Rudel".
  - Einstellungen: Vorschau wechselt, Speichern wirkt nach dem Reload.
  - „lebt mit" auf einer Mitbewohner-Karte.
  - Screenshots Desktop, Handy (375px), hell und dunkel.
- [ ] Finaler Code-Review über den ganzen Phasen-Diff.
- [ ] Deploy der Vorschau (`manage.ps1 -Target staging` → Deploy, dann **[11]** Beispieldaten neu).
