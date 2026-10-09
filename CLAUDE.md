# Familie auf Pfoten

Familienalbum für Tiere: Zuhause, Familien (Rudel), Tierheime, Partner (Hundeschule, Salon).

## Stack
- `server/`: Node 24, Express 4, better-sqlite3. Tests: `node --test test/<datei>.test.js` (voll: `npm test`).
- `client/`: React 18, Vite 6, Vitest (jsdom). Tests: `npx vitest run src/<pfad>` (voll: `npm test`), Build: `npm run build`.
- Neue Tabellen/Logik in `server/lib/*.js` (Muster: `lib/visitenkarte.js`); `server/db.js` und
  `server/routes/dogs.js` sind am 800-Zeilen-Limit und dürfen nicht wachsen.
- node:test höchstens eine `t.test`-Ebene. Dateien < 800 Zeilen, Funktionen < 50.

## Harte Regeln
- `server/data.db` nie öffnen/schreiben; `testenv:seed` und `.testenv/` nur durch den Betreiber.
- Keine echten Namen, keine Server-IP, keine Codes/Passwörter im Repo (pre-commit-Hook prüft).
- Git-Identität repo-lokal `bavid` (noreply), **kein Co-Authored-By-Trailer** in Commits.
- Push nur über die safe-push-Prüfung; Prod-Deploy nur mit ausdrücklichem OK des Betreibers.
- Demo-Daten: neue Features auch ins Demo-Paket, Auffrischen nur `is_demo=1`.

## Sprache & Look
- UI Deutsch, ruhig, für „Susi“ (~40, Facebook-Nutzerin): ≤ 5 Menüpunkte, Reiter statt langer Seiten,
  keine Doppelungen. Look „B+ Familienalbum“ (Tokens in `client/src/styles/palettes.css`).
- Wörter: „Erinnerung“, „Grüße“, „Mit dabei“. Kosten: „heute kostenlos“ (nie „für immer“/„vorerst“);
  nie „ohne Werbung“, sondern „keine fremde Werbung, kein Tracking, kein Datenhandel“.

## Arbeitsweise (Tokens sparen)
- Gezielt lesen (codegraph, Zeilenbereiche), gezielt testen; volle Suite + Build einmal vor dem Commit.
- Kurze Berichte: SHAs, Testzahlen, offene Punkte.
