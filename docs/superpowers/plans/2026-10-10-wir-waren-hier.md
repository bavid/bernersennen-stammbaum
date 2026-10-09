# Plan: „Wir waren hier“ (Größe M/L, 6 Aufgaben)

Ziel: Eine Familie (Zuhause, art `zuhause`) meldet sich bei einem Partner (Hundeschule, Salon, Tierheim …) an, zeigt dort ihr Tier
und heftet Erinnerungen an den Ort. Der Partner gibt jede Anmeldung und jede angeheftete Erinnerung frei. Wer ein Tier „hier zeigt“,
kann von anderen Familien am selben Ort einen Kontaktwunsch bekommen; nach Zusage sieht die Anfragende die Erinnerungen
(über den bestehenden Besuchs-Mechanismus, kein neues Sichtbarkeitssystem).

## Entscheidungen (vom Betreiber delegiert)
- **Neues Modul `server/lib/wirWarenHier.js` (+ kleine Hilfsdateien `wwhKontakt.js`, `wwhPartnerView.js`)**: legt seine Tabellen selbst an
  (`CREATE TABLE IF NOT EXISTS` beim ersten `require`, Muster `lib/visitenkarte.js`, `lib/serverHistory.js`). `server/db.js` und
  `routes/dogs.js` bleiben unverändert. Kein REFERENCES auf `partners(id)` (wie `partner_einblicke`), aber REFERENCES mit
  `ON DELETE CASCADE` auf `families`, `dogs`, `timeline_entries` (wie `erlebt_mit`).
- **Freigabe durch den Partner** nach Muster `erlebt_mit`: `status IN ('offen','bestaetigt','abgelehnt')`, `entschieden_at`;
  Partner-Seite nach Muster `routes/partnerArea/messages.js` (hinter `requirePartnerArea`, `req.partner`, `denyDemoWrites`).
- **Kontakt = bestehendes „Besuch“-System**: Zusage ruft `addVisit(anfragendeHomeId, zusagendeHomeId)` (`lib/visits.js`) auf, danach
  `acknowledgeGuest` (gilt als bestätigt). Die Sichtbarkeit (nicht-private Tiere/Einträge, nur lesen/kommentieren,
  `lib/guestAccess.js`) kommt unverändert von dort. Beenden: bestehendes `DELETE /api/besuche/gaeste/:id` / `/bei/:id`.
  Hinweis im Dialog: „Dann sieht diese Familie die nicht privaten Erinnerungen eurer Tiere“ (Besuch gilt je Zuhause, nicht je Tier).
- **Keine neue Navigation**: Familien-Seite als Abschnitt „Wir waren hier“ auf der Partnerseite (`PartnerPortalPage`, nur mit Zuhause-Sitzung)
  und als Block „Orte, an denen wir waren“ im Reiter *Infos* des Tierprofils; Partner sieht Freigaben im Posteingang (`PartnerInboxPage`);
  Kontaktwünsche erscheinen in der bestehenden Hinweis-/„Mit dabei“-Anfragenliste.
- **Audit**: `adminLog` ist für Admin-Aktionen gedacht – hier nicht passend (Familie und Partner handeln selbst). Stattdessen speichern die
  Tabellen `created_at`/`entschieden_at`. Optional nur: Admin-Sperre eines Partners (`partners.gesperrt`) blendet den Ort aus.
- **Demo**: Nur `is_demo=1`; Demo-Sitzungen lesen nur (`denyDemoWrites`).

## Datenmodell (alle Tabellen in `lib/wirWarenHier.js`)
- `wwh_checkins(id, partner_id, family_id, dog_id, status, zeige_mich 0/1 DEFAULT 0, is_demo, created_at, entschieden_at, UNIQUE(partner_id, dog_id))`
  Index `(partner_id, status)`, `(family_id)`.
- `wwh_pins(id, checkin_id → wwh_checkins CASCADE, entry_id → timeline_entries CASCADE, status, created_at, entschieden_at, UNIQUE(checkin_id, entry_id))`
- `wwh_kontakt(id, partner_id, von_family_id, von_dog_id, an_family_id, an_dog_id, status 'offen'|'angenommen'|'abgelehnt', is_demo, created_at, entschieden_at, UNIQUE(von_dog_id, an_dog_id))`

## Endpunkte
Familie (`routes/wirWarenHier.js`, Mount `/api/wir-waren-hier`; `requireAuth`, `requireOwnHome`, Muster `routes/besuche.js`):
- `GET /partner/:partnerId` – Orts-Ansicht: eigene Anmeldungen + freigegebene Tiere/Erinnerungen anderer, die „hier gezeigt“ sind
  (nur Vorname des Tiers, Tierart, Foto; **nie** Familien-/Personennamen, Adressen, Zuhause-Id).
- `POST /checkins` `{ partnerId, dogId }` – anmelden (status `offen`; Partner wird per `notifyPartner` benachrichtigt).
- `PUT /checkins/:id` `{ zeigeMich }` – an/aus (aus = offene Kontaktwünsche an dieses Tier werden `abgelehnt`).
- `DELETE /checkins/:id` – Rückzug (löscht Pins und offene Wünsche; bestehende Besuche bleiben, Beenden über `/api/besuche`).
- `POST /checkins/:id/erinnerungen` `{ entryId }` / `DELETE /checkins/:id/erinnerungen/:pinId` – anheften/lösen.
- `POST /kontakt` `{ checkinId }` (Ziel-Anmeldung) + `{ eigenesDogId }` – Wunsch senden; `GET /kontakt/offen`;
  `POST /kontakt/:id/annehmen` · `/ablehnen` · `DELETE /kontakt/:id` (zurückziehen).
Partner (`routes/partnerArea/wirWarenHier.js`, Mount unter dem bestehenden partnerArea-Router):
- `GET /` Liste offener Anmeldungen/Erinnerungen · `POST /checkins/:id/(freigeben|ablehnen)` · `POST /erinnerungen/:id/(freigeben|ablehnen)` · `DELETE /checkins/:id` (nachträglich entfernen).

## Aufgaben

### Aufgabe 1: Datenmodell und Anmeldung (Server, Kern)
Ziel: Tabellen + Logik für Anmeldung, „zeige mich hier“, Rückzug.
- Neu: `server/lib/wirWarenHier.js`, `server/test/wirWarenHier.test.js`.
- Tests zuerst: Tabellen entstehen idempotent beim `require`; Anmeldung nur für **eigenes** Tier eines Zuhauses (art `zuhause`, nicht privat gesperrt) bei einem sichtbaren Partner
  (`publicPartnerSql` aus `lib/partners.js`, nicht gesperrt, gleiche `is_demo`-Seite); doppelte Anmeldung → 409; fremdes/unbekanntes `dogId` → 404 (kein Unterschied zu „gibt es nicht“);
  `zeigeMich` nur Boolean; Rückzug löscht Pins; Höchstgrenzen (z. B. 20 Anmeldungen je Zuhause).
- Exporte: `createCheckin`, `setZeigeMich`, `withdrawCheckin`, `checkinsOfHome`, `removeDemoWirWarenHier(previousPartnerIds)`.
- Testbefehl: `cd server && node --test test/wirWarenHier.test.js`.

### Aufgabe 2: Freigabe durch den Partner und angeheftete Erinnerungen (Server)
Ziel: Partner gibt Anmeldungen und Pins frei; Familie kann Erinnerungen anheften.
- Neu: `server/lib/wwhPins.js`, `server/routes/partnerArea/wirWarenHier.js`, `server/test/wirWarenHierPartner.test.js`.
- Geändert (nur Einhängen, wenige Zeilen): `server/routes/partnerArea.js` (Router mounten), `server/lib/partnerNotify.js` (neues Ereignis „Neue Anmeldung“ nach Muster der vorhandenen Texte).
- Tests zuerst: Pin nur auf **eigenen**, **nicht privaten** Eintrag des angemeldeten Tiers, nur bei bestätigter Anmeldung; Partner sieht/entscheidet nur Einträge des **eigenen** `partner_id` (fremder Partner → 404);
  Demo-Partner-Sitzung darf nicht schreiben; Eintrag wird privat oder gelöscht → Pin verschwindet (Sichtprüfung bei jeder Ausgabe, nicht nur beim Anheften);
  Ablehnen blendet überall aus; Änderung am Eintragstext setzt den Pin zurück auf `offen` (Muster `reopenConfirmedTags` in `lib/erlebtMit.js`).
- Testbefehl: `cd server && node --test test/wirWarenHierPartner.test.js`.

### Aufgabe 3: Familien-Routen, Ortsansicht, Ratenbegrenzung (Server)
Ziel: Alle Familien-Endpunkte außer Kontakt; sichere Ortsansicht.
- Neu: `server/routes/wirWarenHier.js`, `server/lib/wwhOrtView.js`, `server/test/wirWarenHierRoutes.test.js`.
- Geändert: `server/app.js` (eine `require`- und eine `app.use('/api/wir-waren-hier', …)`-Zeile).
- Tests zuerst: ohne Sitzung 401; Gast-/Besuchs-Sitzung und Demo-Sitzung schreibend 403 (`denyGuestRequest`/`denyDemoWrites`); Ortsansicht gibt nur Tiere mit `status='bestaetigt'` **und** `zeige_mich=1` anderer Familien
  zurück, nur Felder `{ checkinId, tierName, tierart, fotoUrl, erinnerungen:[{titel,datum}] }` (Test prüft per Schlüsselliste, dass kein `family_id`, Zuhause-Name, E-Mail, Adresse darin steht);
  `:id`-Parameter mit `cleanId` (`lib/validate.js`); eigene Anmeldungen anderer Familie ansprechen → 404 (IDOR); Text-/Längenprüfung; Limiter nach Muster `routes/anfragen.js` (`express-rate-limit`, `ipKeyGenerator`) auf POST/PUT/DELETE.
- Testbefehl: `cd server && node --test test/wirWarenHierRoutes.test.js`.

### Aufgabe 4: Kontaktwunsch über den Ort und Besuch bei Zusage (Server)
Ziel: Opt-in-Kontakt, der bei Zusage einen normalen Besuch anlegt.
- Neu: `server/lib/wwhKontakt.js`, `server/test/wirWarenHierKontakt.test.js`; Routen für `/kontakt…` in `server/routes/wirWarenHier.js`.
- Geändert: `server/lib/context.js` nur falls offene Wünsche im „Hinweise“-Zähler erscheinen sollen (Muster `countOpenRequests` aus `lib/erlebtMit.js`; sonst nicht anfassen), `server/lib/push.js` (Ereignis nur falls sauber einhängbar).
- Regeln/Tests zuerst: Wunsch nur, wenn **beide** Tiere am **selben Ort** bestätigt angemeldet sind und das Ziel `zeige_mich=1` hat; nicht an sich selbst (gleiches Zuhause) → 400; Demo ↔ Echt nie;
  Obergrenzen: höchstens 5 offene und 3 neue Wünsche je 24 h je Zuhause, höchstens 10 offene je Ziel-Zuhause (Muster `MAX_OPEN_PER_HOME` in `lib/erlebtMit.js`); abgelehnter Wunsch kann 30 Tage nicht erneut gestellt werden (kein Dauerbitten);
  nur das Ziel-Zuhause kann annehmen/ablehnen, nur die Absenderin zurückziehen (sonst 404); Annehmen läuft in einer Transaktion mit `addVisit` + `acknowledgeGuest`, ist idempotent und prüft Besuch erst bei Zusage erneut (`isVisiting` → kein Doppelbesuch);
  „zeige mich“ aus → offene Wünsche `abgelehnt`; Widerruf einer Zusage = bestehender Besuchs-Abbruch (Test: danach sieht die Anfragende die Beiträge nicht mehr). Antwort enthält nie Namen der Familie, nur Tiername/Tierart/Ort.
- Testbefehl: `cd server && node --test test/wirWarenHierKontakt.test.js` und zur Absicherung `node --test test/besuche.test.js test/erlebtMit.test.js`.

### Aufgabe 5: Demo-Paket (Server)
Ziel: Neue Funktion erscheint im öffentlichen Demo-Pack, Auffrischen nur `is_demo=1`.
- Neu: `server/lib/demoWirWarenHier.js` (Muster `lib/demoVisits.js`), `server/seed/demo-wir-waren-hier.js` (erfundene Tier-/Ortsnamen, keine echten Namen/IPs/Codes), `server/test/demoWirWarenHier.test.js`.
- Geändert: `server/lib/demoPack.js` (je ein Aufruf: Entfernen via `removeDemoWirWarenHier(previousPartnerIds)` in der Transaktion vor dem Löschen der Demo-Partner, Einfügen nach den Demo-Partnern und -Besuchen; Rückgabe in der Statistik ergänzen).
- Tests zuerst: Demo-Pack zweimal erneuern → keine Dubletten, keine Waisen; echte (`is_demo=0`) Zeilen bleiben unberührt (Test legt eine echte Anmeldung an und prüft sie nach dem Erneuern);
  Demo enthält eine freigegebene Anmeldung, eine offene (Partner-Demo sieht sie), eine angeheftete Erinnerung und einen offenen Kontaktwunsch.
- Testbefehl: `cd server && node --test test/demoWirWarenHier.test.js test/demoPartnerContent.test.js test/demoVisits.test.js`.

### Aufgabe 6: Oberfläche (Client)
Ziel: Ruhige deutsche UI ohne neuen Menüpunkt.
- Neu: `client/src/components/wirWarenHier/WirWarenHierSection.jsx` (Abschnitt auf der Partnerseite: „Wir waren hier“, Anmelden, Tier wählen, Schalter „Hier zeigen“), `OrtTierKarte.jsx` (Tier + „Kontakt anfragen“), `ErinnerungAnheften.jsx`, `WirWarenHierPartnerListe.jsx` (Freigaben im Posteingang), `WirWarenHierInfos.jsx` (Block im Reiter Infos), dazu je `*.test.jsx`; `client/src/lib/wirWarenHierText.js` (alle Texte an einer Stelle).
- Geändert: `client/src/api.js` (Methoden `wwh*`), `client/src/pages/PartnerPortalPage.jsx` (Abschnitt nur bei Zuhause-Sitzung, Demo nur lesend), `client/src/pages/PartnerInboxPage.jsx` (Abschnitt „Neue Besuche“), `client/src/components/dog/DogInfos.jsx` (Block), Kontaktwünsche in der vorhandenen Anfragenliste (`client/src/components/erlebtMit/`-Muster); **`dogTabs` bleibt unverändert**.
- Tests zuerst (Vitest/RTL): Abschnitt fehlt ohne Sitzung; Anmelden zeigt „Wartet auf Freigabe durch {Ort}“; Schalter „Hier zeigen“ erklärt in einem Satz, was andere sehen („nur Name und Foto deines Tieres, nur hier“), jederzeit rücknehmbar; Dialog beim Annehmen nennt, was die andere Familie danach sieht; Fehler (429/403) verständlich; Tastatur/Fokus.
- Wörter: „Erinnerung“, „Grüße“, „Mit dabei“; keine Fachwörter (kein „Check-in“, „Opt-in“); Töne ruhig, kurze Sätze; Tokens aus `client/src/styles/palettes.css`; keine neuen Hex-Farben.
- Testbefehle: `cd client && npx vitest run src/components/wirWarenHier src/pages/PartnerPortalPage.test.jsx src/pages/PartnerInboxPage.test.jsx src/pages/DogDetailPage.tabs.test.jsx`, danach einmal `npm test` und `npm run build`.

## Sicherheits-Checkliste (für jede Aufgabe, vor dem Commit; zusätzlich ein `security-reviewer` nach Aufgabe 4)
- [ ] Jeder Familien-Endpunkt: `requireAuth` + `requireOwnHome`; Besuchs-/Gast-Sitzungen schreiben nie; Demo schreibt nie.
- [ ] Eigentum: `dogId`, `entryId`, `checkinId`, `kontaktId` werden immer gegen aktives `family_id`/`req.partner.id` geprüft (JOIN im SQL, nicht „erst laden, dann vergleichen“); Fremdes liefert 404 (kein Unterschied zu „nicht vorhanden“, kein IDOR, keine Id-Enumeration).
- [ ] Eingaben: `cleanId` für alle Ids, Boolean-Schalter strikt, parametrisierte Queries, JSON-Body begrenzt, kein Freitext außer ggf. kurzer Gruß (≤ 200 Zeichen, als Text gerendert, nie `dangerouslySetInnerHTML`).
- [ ] Privatsphäre: Ortsansicht nur nach Freigabe **und** `zeige_mich=1`; keine Familien-/Personennamen, Adressen, Zuhause-Ids, E-Mails in Antworten (Schlüsselliste im Test); nichts öffentlich oder indexierbar (kein Eintrag in `sitemap.js`, `publicAnimals`, `startFeed`, Laufband/Zahlen); Antworten mit `Cache-Control: no-store` (`lib/noStoreResponse.js`).
- [ ] Widerruf: „Hier zeigen“ aus, Rückzug, Wunsch zurückziehen, Besuch beenden – alles sofort wirksam, Sichtbarkeit wird bei **jeder** Ausgabe neu geprüft.
- [ ] Missbrauch: Ratenbegrenzung (IP-Limiter + DB-Obergrenzen je Zuhause), Wartezeit nach Ablehnung, keine Benachrichtigungsflut an Partner (vorhandene Obergrenze `admitToCap` in `lib/partnerNotify.js` nutzen).
- [ ] Partner: sieht nur eigene Orte; gesperrte/inaktive Partner blenden den Ort aus; Löschen einer Familie/eines Partners räumt per CASCADE bzw. `lib/families.js`/Partnerlöschung auf (Test).
- [ ] Demo: nur `is_demo=1` wird erzeugt/gelöscht; Demo und Echt werden nie verbunden (wie `lib/visits.js`).
- [ ] Keine Geheimnisse, keine echten Namen/Server-IP/Codes im Repo (pre-commit-Hook); `server/data.db` nie öffnen.
- [ ] Dateien < 800 Zeilen, Funktionen < 50, node:test höchstens eine `t.test`-Ebene; `db.js`/`routes/dogs.js` wachsen nicht.

## Reihenfolge und Abschluss
Aufgaben 1 → 2 → 3 → 4 → 5 (Server), dann 6 (Client); je ein Sonnet-Implementierer, nacheinander, je ein Commit (`feat: …`, Git-Identität `bavid`, kein Co-Authored-By).
Nach Aufgabe 6: volle Suite `npm test` + `npm run build` einmal, ein `code-reviewer` + ein `security-reviewer`, `handover/HANDOVER.md` aktualisieren. Push nur über safe-push, Prod-Deploy nur mit OK des Betreibers.
