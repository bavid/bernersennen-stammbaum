# Phase R – Familien-Verwaltung und Rollen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Familien (im Berner-Theme „Rudel“) bekommen:
- eine **Leitung** (Rudelführer bzw. Familienleitung), die alles verwalten darf;
- darunter die Rollen **Stellvertretung**, **Mitglied** und **Gast**;
- eine Mitglieder-Seite: Rollen, Entfernen, Einladungen mit Rolle, Übersicht „privat – Familie – öffentlich“.

**Architecture:**
- **Rolle:** Sie steht an der Mitgliedschaft (`family_members.rolle`).
- **Leitungsrechte ohne Zeile in `family_members`:** Wer mit dem gemeinsamen Schlüssel der Familie angemeldet ist
  (alte Rudel-Logins, `homeId === familyId`), hat Leitungsrechte, wie bisher.
- **Prüfung:** Ein zentraler Helfer `roleOf(homeId, familyId)` und die Middleware `requireRole(min)` prüfen alle
  Schreibwege in Familien.
- **Einladungen:** Einladungs-Gutscheine (`vouchers.join_family_id`) tragen die Rolle.

**Tech Stack:** wie bisher.

**Grundlage:** [Konzept – Phase R](../specs/2026-09-27-marketing-gutscheine-partner-design.md).

**Regeln:** wie in den anderen Phasen:
- **Git:** Branch `staging`, nicht pushen, kein Co-Authored-By-Trailer, nur eigene Dateien stagen, keine Worktrees.
- **Daten:** Nie `server/data.db`.
- **Namen:** keine echten Namen von Menschen oder Tieren aus dem Bestand (Liste beim Koordinator).
- **Demo:** Demo nur lesen, jede neue Funktion auch in der Demo.

**Bestehende Bausteine:**
- **Mitgliedschaft:** `server/lib/context.js` (`isMember`, `canEnter`, `buildMe`, `membershipsOf`).
- **Familien-Endpunkte:** `server/routes/auth.js` (`/families/join`, `/families/group`, `/memberships/:groupId`,
  `/family`, `/family/key`, `/users`).
- **Einladungs-Gutscheine:** `server/lib/vouchers.js` (`ensureVoucherQuota`, Kontingent `RUDEL_VOUCHER_QUOTA`,
  `join_family_id`).
- **Schreibwege in Familien:** `server/routes/dogs.js`, `server/routes/timeline.js`, `server/routes/breeding.js`,
  `server/routes/notes.js`, `server/routes/messages.js`.
- **Theme-Wörter:** `server/lib/themes.js` bzw. Client-`ThemeProvider` mit Key-Parity-Test.

---

### Rollen und Rechte

| Recht | leitung | stellvertretung | mitglied | gast |
|---|---|---|---|---|
| ansehen, kommentieren | ✓ | ✓ | ✓ | ✓ |
| eigene Tiere teilen, Einträge schreiben, Tiere der Familie pflegen, Würfe/Stammbaum | ✓ | ✓ | ✓ | – |
| einladen (Kontingent), Tier eines anderen aus der Familie nehmen, Kommentare anderer löschen | ✓ | ✓ | – | – |
| Rollen ändern, Mitglieder entfernen, Name/Theme/Schlüssel/Benutzer der Familie, auflösen | ✓ | – | – | – |

Rangfolge: `gast < mitglied < stellvertretung < leitung`.

---

### Task 1: Rollen im Datenmodell und zentrale Prüfung (Server)

**Files:** `server/db.js`, `server/lib/context.js`, neu `server/lib/roles.js`, `server/middleware/auth.js`, alle
Schreib-Routen in Familien (siehe oben), Tests `server/test/roles.test.js`, bestehende Tests anpassen

- **Schema:** `family_members.rolle TEXT NOT NULL DEFAULT 'mitglied'`, im Code geprüft.
- **Migration** (idempotent, eine Transaktion): Jede Familie ohne `leitung` bekommt ihr ältestes Mitglied
  (`created_at`, bei Gleichstand die kleinste `member_family_id`) als `leitung`.
- **`/families/group`** (Gründen): Die gründende Identität wird `leitung`.
- **`lib/roles.js`:**
  - `ROLES`, `rank(rolle)` und `roleOf(homeId, familyId)`:
    - `homeId === familyId` → `'leitung'` (eigener Bereich bzw. gemeinsamer Familien-Schlüssel);
    - sonst die Rolle aus `family_members`;
    - sonst `null`.
  - `requireRole(min)` als Middleware nach `requireAuth`, 403 „Dafür fehlt dir die Berechtigung in dieser
    Familie.“
- **Anwenden:**
  - **Schreiben in einer Familie:** Tiere der Familie anlegen und bearbeiten, eigene Tiere in die Familie teilen,
    Einträge, Würfe, Stammbaum-Verknüpfungen und Notizen brauchen mindestens `mitglied`.
  - **Kommentieren:** mindestens `gast`.
  - **Einladungs-Gutscheine erzeugen:** mindestens `stellvertretung`.
  - **Leitung:**
    - `PUT /family` (Name, Theme);
    - `POST /family/key`;
    - Benutzer der Familie verwalten;
    - Rollen ändern;
    - Mitglieder entfernen;
    - auflösen.
  - Bereiche `zuhause`, `tierheim` und `partner` bleiben unverändert: Dort gilt der eigene Bereich wie bisher als
    `leitung`.
- **`buildMe`:** liefert `role` für den aktiven Bereich.
- **Tests:**
  - Migration: die älteste Mitgliedschaft wird `leitung`, ein zweiter Start ändert nichts;
  - beim Gründen wird man `leitung`;
  - ein Gast darf kommentieren, aber keinen Eintrag schreiben (403);
  - ein Mitglied darf nicht einladen (403);
  - die Stellvertretung darf einladen, aber keine Rollen ändern;
  - der gemeinsame Schlüssel hat Leitungsrechte;
  - `buildMe.role`.

- [ ] Commit: `feat: Rollen in Familien – Leitung, Stellvertretung, Mitglied, Gast`

### Task 2: Mitglieder verwalten, Einladungen mit Rolle, Moderation (Server)

**Files:** neu `server/routes/members.js` (unter `/api/family/members`), `server/lib/vouchers.js`,
`server/routes/auth.js`, `server/routes/dogs.js`, `server/routes/messages.js` (Kommentare), Tests
`server/test/members.test.js`

- **`GET /api/family/members`** (jede Rolle):
  - Haushalte mit `id`, `name`, `rolle`, `seit` und der Anzahl der in diese Familie geteilten Tiere;
  - `ichBin`;
  - für `stellvertretung` und höher zusätzlich die offenen Einladungen (Hinweis auf den Code, Rolle, Ablauf,
    `id`).
  - Nie Schlüssel oder Codes.
- **`PUT /api/family/members/:homeId { rolle }`** (Leitung):
  - Die letzte Leitung kann sich nicht selbst herabstufen (409 „Es muss immer eine Leitung geben.“).
- **`DELETE /api/family/members/:homeId`** (Leitung, nicht sich selbst): In einer Transaktion werden die
  Mitgliedschaft und die `dog_shares` dieses Haushalts für diese Familie entfernt. Die Tiere bleiben in seiner
  Chronik.
- **Kommentare ehemaliger Mitglieder:**
  - Die Autor-Anzeige lautet „ehemaliges Mitglied“, wenn der Haushalt nicht mehr Mitglied ist. Dazu vorhandene
    Speicherung der Autorenschaft prüfen.
  - Die Anzeige erfolgt nur in der Familienansicht, die Daten bleiben.
- **Verlassen (`DELETE /memberships/:groupId`):** Für die letzte Leitung → 409 mit dem Hinweis „Übergib zuerst die
  Leitung oder löse die Familie auf.“
- **`POST /api/family/dissolve { bestaetigung: '<Familienname>' }`** (Leitung):
  - Nur für Familien **ohne eigene Tiere** (sonst 409 „Die Familie hat eigene Tiere – bitte vorher in eine Chronik
    übernehmen.“).
  - Entfernt alle Mitgliedschaften, Shares und offenen Einladungen und dann die Familie über den vorhandenen
    Lösch-Pfad (`lib/families.js deleteFamily`).
- **Einladungen:**
  - Das Erzeugen des Einladungs-Gutscheins nimmt `rolle` an (Standard `mitglied`). Die Stellvertretung darf nur
    `mitglied` oder `gast`.
  - Speicherort: `vouchers.join_rolle TEXT`.
  - Beim Einlösen (neues Zuhause) und beim Beitreten per Gutschein wird die Rolle übernommen.
  - `DELETE /api/family/members/invites/:voucherId` widerruft eine offene Einladung (Stellvertretung und höher).
- **Moderation:**
  - `DELETE /api/family/shares/:dogId` (Stellvertretung und höher) nimmt das Tier eines anderen Haushalts aus der
    Familie.
  - Kommentare anderer löschen in der Familie (Stellvertretung und höher), über den vorhandenen Lösch-Endpunkt mit
    Rollenprüfung.
- **Tests:**
  - Liste mit und ohne Einladungen je Rolle;
  - Rolle ändern, und die letzte Leitung ist geschützt;
  - Entfernen entfernt Shares, das Tier bleibt beim Besitzer;
  - Verlassen der letzten Leitung → 409;
  - Auflösen: ohne Tiere geht es, mit eigenen Tieren → 409, falsche Bestätigung → 400;
  - die Einladung trägt die Rolle, und die Stellvertretung kann keine Leitung einladen;
  - Moderation.

- [ ] Commit: `feat: Mitglieder verwalten, Einladungen mit Rolle, Leitung übergeben, Familie auflösen`

### Task 3: Demo mit allen Rollen (Server)

**Files:** `server/lib/demoPack.js`, Demo-Seeds, `server/scripts/testenv-seed.js`, Tests

- **Demo-Familie:** In der Demo-Familie der Vorschau („Familie Sonnenhang“) sind alle vier Rollen mit fiktiven
  Demo-Haushalten besetzt, jeweils mit einem geteilten Tier (der Gast ohne).
- **Offene Einladung:** eine offene Demo-Einladung mit der Rolle „Gast“.
- **Test-Rudel:** Im Test-Rudel der lokalen Testumgebung bekommt der Test-Haushalt die Leitung.
- **Tests:**
  - Die Rollen sind vorhanden.
  - Ersetzen hinterlässt keine Waisen.
  - Echte Daten bleiben unverändert.

- [ ] Commit: `feat: Demo-Familie mit allen Rollen`

### Task 4: Mitglieder-Seite und Rollen in der Oberfläche (Client)

**Files:** neu `client/src/pages/MembersPage.jsx`, neu `client/src/components/RoleBadge.jsx`,
`client/src/components/InviteDialog.jsx`, `client/src/App.jsx` (Route `/mitglieder`, Link in den
Familien-Einstellungen bzw. im `ContextSwitcher`), Theme-Wörter (Rollen je Theme, Key-Parity-Test), `api.js`, Tests

- **Rollen-Wörter:**
  - Berner: „Rudelführer“, „Stellvertretung“, „Mitglied“, „Gast“;
  - Standard: „Familienleitung“, „Stellvertretung“, „Mitglied“, „Gast“.
- **`MembersPage`:**
  - **Karte „Wer sieht was?“:** die drei Ebenen Privat, Familie und Öffentlich, kurz und mit Icons.
  - **Mitgliederliste:**
    - Name, `RoleBadge`, „seit …“, geteilte Tiere;
    - für die Leitung zusätzlich eine Rollen-Auswahl und „Entfernen“ mit einem Bestätigungsdialog, der die Folgen
      nennt;
    - die letzte Leitung sieht den Hinweis statt der Auswahl.
  - **Offene Einladungen** (ab Stellvertretung): Rolle, Ablauf, „Widerrufen“.
  - **„Einladen“** öffnet den `InviteDialog` mit Rollen-Auswahl, eingeschränkt je eigener Rolle, und zeigt das
    Kontingent.
  - **Eigene Mitgliedschaft:** „Familie verlassen“; für die letzte Leitung stattdessen „Leitung übergeben“ oder
    „Familie auflösen“ (Bestätigung durch Eintippen des Namens).
- **Rechte in der ganzen Oberfläche:**
  - Knöpfe, die die eigene Rolle nicht erlaubt, erscheinen nicht, zum Beispiel „Eintrag schreiben“ für Gäste oder
    „Einladen“ für Mitglieder.
  - Der Server bleibt die Instanz. Bei 403 kommt eine freundliche Meldung.
- **Demo:** Die Seite ist sichtbar, alle Aktionen sind gesperrt („In der Demo nicht möglich.“).
- **Tests:**
  - Rollen-Wörter je Theme;
  - Liste je Rolle mit den passenden Knöpfen;
  - Rolle ändern;
  - Entfernen mit Bestätigung;
  - die Einladung zeigt Rollen je eigener Rolle;
  - die letzte Leitung;
  - der Gast sieht kein „Eintrag schreiben“;
  - Demo gesperrt.

- [ ] Commit: `feat: Mitglieder-Seite mit Rollen, Einladungen mit Rolle, Wer-sieht-was`

### Task 5: Prüfen und ausliefern (Koordinator)

- [ ] README und Roadmap.
- [ ] Abschluss-Review mit diesen Schwerpunkten:
  - kein Schreibweg ohne Rollenprüfung (alle Routen durchgehen);
  - Selbst-Hochstufung unmöglich;
  - die letzte Leitung;
  - Demo/Echt.
- [ ] Browser-Prüfung: Einladung als Gast einlösen, Gast darf nur kommentieren, Leitung stuft hoch, Handy.
- [ ] Vorschau deployen.
