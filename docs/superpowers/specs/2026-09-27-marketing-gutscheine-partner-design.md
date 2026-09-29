# Marketing: Gutscheine, Partner, Umkreissuche, „Entdecken" — Design-Konzept

Datum: 2026-09-27
Status: **Entwurf zur Diskussion** — noch kein Code. Umgesetzt wird phasenweise, jede Phase erst nach Freigabe.

## Ziel

**Name: „Familie auf Pfoten" – Slogan: „Eine tierisch nette Familie".** Das Standard-Farbschema bleibt wie es ist.
Der Berner-Auftritt wird zu einem wählbaren Theme (siehe „Design: Name, Farbschema, Themes").

Die Familienchronik soll über **Mundpropaganda** wachsen. Dafür gibt es **Einmal-Gutscheine**, die man auf der
Seite einlöst. Verteilt werden sie über **Tierheime, Vermittlungsstellen und Hundeschulen**, gedruckt als Karten
mit QR-Code. **Nie über Züchter.**

Partner bekommen eigene Portalseiten. Nutzer finden Partner in ihrer Nähe, über PLZ oder freigegebenen Standort.
Ein neuer Reiter zeigt gekennzeichnete Werbung und Empfehlungen, etwa „Hundeschule gesucht?", „Neuer Begleiter
gesucht?" und Futter, das Hundetrainer empfehlen, außerdem Spendenmöglichkeiten.

Finanziert wird das Ganze **rein über GoFundMe**. Es gibt keine Zahlungen in der App. Die Spenden decken die
Betriebskosten, der Rest geht nachvollziehbar an Tierheime.

Für Präsentationen bei Partnern steht jederzeit eine **Admin-Präsentationsansicht** bereit.

**Tierheime nutzen die App auch selbst:** Sie legen Chroniken für ihre Tiere an, sammeln Neuigkeiten und machen
damit Werbung für die Vermittlung. Wird ein Tier vermittelt, zieht seine Chronik mit ins neue Zuhause, und zwar
über einen Gutschein. Jede Vermittlung bringt so ein neues Rudel (siehe Phase T).

**Langfristig für alle Tiere, nicht nur für Hunde.** Die App kennt schon Hund, Katze und „anderes Tier". Alles
Neue wird von Anfang an tierneutral gebaut, damit es später ohne Umbau für alle Tierarten funktioniert (siehe
„Ausblick: alle Tiere").

## Ideensammlung (Ausgangspunkt, sinngemäß)

- Marketing über Einmal-Gutscheine, verteilt an Tierheime, Hundeschulen usw.
- Partnerschaften mit Tierheimen und Hundeschulen. Dafür kundenspezifische Werbung und eigene Portale, etwa eins
  für „Tierheim 1" und eins für eine Hundeschule. Dazu eine Partnerübersicht bzw. Tierheime in der Nähe.
  Die PLZ bei der Anmeldung ist optional, ohne PLZ bekommt man alles vorgeschlagen.
- Finanzierung über GoFundMe, sonst nichts. Ein eigener Reiter für „Werbung" bzw. Spendenadressen.
- „Hundeschule gesucht? Hier klicken" führt zu den Partnern. „Neuer Begleiter gesucht?" führt zu Tierheimen.
  **Nie auf Züchter verlinken, nur auf Vermittlungsstellen.**
- Werbung für Hundefutter, möglichst was Hundetrainer wirklich empfehlen.
- Ein Web-Crawler als API. Es gibt 2 konkrete Beispiele.
- Standort freigeben und im Umkreis suchen, über einen Kartendienst. Die Webseiten der Treffer werden geprüft.
- Der Gutschein ist „PIN und PUK" in einem. E-Mail ist optional. Wer ein eigenes Passwort will, braucht einen
  Benutzernamen.
- Alles lokal und getrennt. Die Testumgebung muss leicht durchklickbar sein, aber nur lokal. Deployt wird erst,
  wenn der Deploy-Prozess eindeutig ist, und zuerst unter einer **anderen URL**. Danach erst Prod.
  Eine eigene Domain wird gekauft.
- *(Zusatz)* Tierheime können die App nutzen, um Chroniken für ihre Hunde aufzubauen, Änderungen zu sammeln und
  Werbung zu machen.
- *(Zusatz)* Nicht nur für Hunde, sondern irgendwann für alle Tiere.
- *(Zusatz)* Das Standard-Farbschema ist genau richtig und soll so bleiben.
- *(Zusatz)* Namensideen: „FamilieAufPfoten", „EineTierischNetteFamilie", „Fellnasen Familie".
- *(Zusatz)* Der Zuschnitt auf Berner kann ein Theme sein. Das Design soll anpassbar werden (Theming).
- *(Zusatz 28.09.)* Die Tiere einer Familie müssen nicht blutsverwandt sein. Mehr Chronik im Sinne von „von 2010
  bis 2025 haben mich diese Hunde begleitet", weniger „Nachwuchs, Nachwuchs". Statt „verpaart" und „Adoptiv-…"
  zählt das Zusammenleben. Dadurch kommt der Tierheim-Gedanke stärker zur Geltung.
- *(Zusatz 28.09.)* Wie eine „MyPetChronik": Jeder pflegt seine Chronik privat. Über die Familie bzw. das Rudel
  entsteht eine gemeinsame Ansicht aller. Tiere und Einträge lassen sich zwischen privat und geteilt hin- und
  herschieben (siehe Phase Z).

## Ausgangslage im Code (Stand `1f7b91c`)

- **Ein Rudel hat ein gemeinsames Passwort.** Beim Login wird es per bcrypt gegen **alle** Rudel geprüft
  (`server/routes/auth.js:32-38`). Das kostet bei vielen Rudeln Zeit. Außerdem müssen Passwörter eindeutig sein,
  deshalb meldet die Registrierung „Passwort belegt" (`auth.js:56-61`). Damit verrät sie, dass ein anderes Rudel
  dieses Passwort benutzt.
- **Registrierung** läuft über `POST /api/families` mit einem globalen `FAMILY_INVITE_CODE` (`server/config.js:38`)
  und dem Freitextfeld `quelle` („Wie hast du von uns erfahren?").
- **Session:** ein JWT `{familyId}` im Cookie, gültig 30 Tage (`server/middleware/auth.js`). Die Demo ist
  schreibgeschützt (`is_demo`), der Admin hat einen eigenen Login (`server/routes/admin.js`).
- **Nicht vorhanden:** Partner, Geodaten, externe Dienste, Staging. Die CSP erlaubt nur `'self'`
  (`server/app.js:25-44`).
- **Deploy:** eine Docker-Compose-Instanz auf einem Ubuntu-Server hinter einem gemeinsamen Caddy
  (`deploy/remote.sh`, `manage.ps1`). Containername und Image-Tag sind fest verdrahtet (`docker-compose.yml`).

## Entscheidungen

| Thema | Entscheidung |
|---|---|
| Login | **Gutschein = Rudel-Schlüssel.** Der eingelöste Code ist ab dann Login (PIN) und Wiederherstellung (PUK). Ein eigenes Passwort gibt es nur zusammen mit einem Benutzernamen. E-Mail ist immer optional. Alte Rudel-Passwörter funktionieren weiter. |
| Registrierung | **Nur noch mit Gutschein.** Das ersetzt `FAMILY_INVITE_CODE`. Jedes Rudel bekommt ein paar Gutscheine zum Weitergeben, Partner bekommen eigene Kontingente. Woher ein Rudel kam, wird automatisch erfasst statt über das Freitextfeld `quelle`. |
| GoFundMe | Die Spenden gehen an den Betreiber: erst die Kosten decken, der Rest geht an Tierheime. Ein Transparenzblock zeigt Eingang, Kosten und Weitergabe. Partner erscheinen im Umkreis, alternativ gibt es immer die Liste „Alle Partner". Bei Bedarf bekommen sie eine eigene Seite mit Werbung. |
| Kartendienst | **Erst nur OpenStreetMap** (Overpass-API, Lizenz ODbL, Speichern mit Quellenangabe erlaubt). Google Places kommt später höchstens als optionaler Zusatz dazu. Die Treffer werden dann bei jeder Suche neu geholt und nie gespeichert (siehe unten). |
| Ergebnisanzeige | **Liste mit Entfernung.** Pro Eintrag gibt es einen Link „In Google Maps öffnen" (einfacher Maps-Link, kein API-Schlüssel, keine Kosten), alternativ einen OpenStreetMap-Link bzw. die Koordinaten. Keine eingebettete Karte, deshalb bleibt die CSP bei `'self'`. |
| „Neuer Begleiter gesucht?" | Zeigt **nur Partner und vom Admin geprüfte Einträge.** Automatisch Gefundenes landet zuerst in der Prüfliste. |
| Crawler | Quellen: Tierheim-Verzeichnis, Vermittlungstiere, Hundeschulen, Futter-Empfehlungen. Die 2 konkreten Beispiel-URLs fehlen noch. |
| Tierarten | **Langfristig alle Tiere.** Neues wird tierneutral gebaut: Datenmodell, Texte, „Neuer Begleiter gesucht?" und Steckbriefe. Spezifisch für Hunde bleiben vorerst nur die Hundeschulen. |
| Umgebungen | Lokale Testumgebung → Staging unter eigener URL → Prod. Nach Prod geht genau der Stand (SHA), der auf Staging getestet wurde. |
| Name | **„Familie auf Pfoten"**, Slogan **„Eine tierisch nette Familie"**. Domain-Kandidat `familieaufpfoten.de`, dazu `familie-auf-pfoten.de` als Weiterleitung für Tippfehler. Als Alternative vorgemerkt: „Fellnasen-Familie" (`fellnasenfamilie.de`). Das Wort „Fellnasen" wird in den Texten verwendet. |
| Farbschema | Die heutigen Farben (`client/src/styles/tokens.css`) sind der **Standard und werden nicht verändert.** Themes legen sich nur darüber. |
| Themes | **Jedes Rudel wählt sein Theme selbst**, zum Beispiel „Standard" oder „Berner". **Partner-Portale** bekommen eigene Akzentfarbe und Logo. Es gibt keine Theme-Einstellung pro Server-Instanz. |
| Chronik-Modell *(28.09.)* | **Privat zuerst, gemeinsam per Teilen.** Jeder Haushalt hat „Meine Chronik". Familien bzw. Rudel sind gemeinsame Ansichten, in die Haushalte einzelne Tiere und Einträge teilen. Heutige Rudel laufen unverändert weiter (Phase Z). |
| Verwandtschaft *(28.09.)* | **Zusammenleben vor Abstammung.** Tiere einer Familie müssen nicht verwandt sein. „Lebt mit" ersetzt „Adoptiv-…". Einzug und Abschied sind Meilensteine wie die Geburt. Abstammung und Würfe bleiben als Zusatz. |

### Warum erst mal kein Google?

Die Google Places API erlaubt eine Live-Suche im Umkreis, aber mit Einschränkungen:

- Dauerhaft speichern darf man nur die `place_id`. Koordinaten dürfen höchstens 30 Tage im Zwischenspeicher liegen.
- Die Anzeige braucht das Google-Logo bzw. die Google-Quellenangabe. Auf einer Nicht-Google-Karte dürfen die
  Daten nicht erscheinen.
- Aus Google-Daten darf deshalb **kein eigenes Verzeichnis** entstehen. Sie dürfen auch nicht durch unsere
  Webseiten-Prüfung laufen.
- Es braucht ein Google-Konto mit Zahlungsdaten. Oberhalb des Freikontingents wird pro Anfrage abgerechnet, und
  Felder wie Webseite oder Telefonnummer kosten mehr.

OpenStreetMap ist kostenlos und braucht keinen Schlüssel. Die Daten dürfen wir mit Quellenangabe speichern und
weiterverarbeiten. Die passenden Einträge gibt es dort schon: `amenity=animal_shelter` für Tierheime,
`amenity=animal_training` + `animal_training=dog` für Hundeschulen. Viele davon haben ein Feld `website`, das
unser Crawler prüfen kann.

Ein **Link** „In Google Maps öffnen" (`https://www.google.com/maps/search/?api=1&query=LAT,LON`) ist dagegen
unproblematisch. Das ist ein normaler Link und keine API-Nutzung.

---

## Phase 0 — Umgebungen (lokal → Staging → Prod)

### Lokale Testumgebung

- Gestartet wird sie mit `npm run dev:test` (zusätzlich `start-test.bat` für Windows). Das startet
  `scripts/testenv.js`, ein Node-Skript, damit es auch unter Windows läuft. Es setzt:
  - `DATA_DIR=server/.testenv`, also eine eigene Datenbank und eigene Fotos (Ordner in `.gitignore`)
  - `DEV_TOOLS=1`, `APP_ENV=dev`, `CODE_PEPPER=dev`
  - einen Test-Admin (`admin` / `test-admin`)
- `npm run testenv:seed` bzw. `testenv:reset` rufen `server/scripts/testenv-seed.js` auf. Das Skript nutzt
  `createDemoPack` und `createImageCopier` aus `server/lib/demoPack.js`. Dazu kommen fiktive Partner: ein Tierheim,
  eine Vermittlungsstelle, 2 Hundeschulen und ein Futteranbieter. Außerdem Portale, Anzeigen und 2 Gutschein-Stapel.
  Das Skript gibt die Codes und Portal-URLs direkt aus.
- **Dev-Panel** zum Durchklicken:
  - Server: `server/dev/routes.js` (`/api/dev/*`: Codes auflisten, als Rudel X einloggen, zurücksetzen).
    `app.js` lädt die Datei nur, wenn `!isProduction && DEV_TOOLS` gilt. `.dockerignore` schließt `server/dev`
    aus dem Image aus.
  - Client: `client/src/dev/DevPanel.jsx`, nur hinter `import.meta.env.DEV`. Vite entfernt es aus dem
    Prod-Build.

### Staging als zweite Compose-Instanz

- `docker-compose.yml` wird parametrisiert:
  - `container_name: ${CONTAINER_NAME:-bernersennen-stammbaum}`
  - `image: bernersennen-stammbaum:${IMAGE_TAG:-latest}`
  - `COMPOSE_PROJECT_NAME` in der `.env` jeder Instanz
- Heute sind Containername und Image-Tag fest verdrahtet. Staging würde sonst das Prod-Image überschreiben.
  `remote.sh admin` startet ohne `--build`, dann liefe in Prod womöglich das Image, das Staging gebaut hat.
- `deploy/remote.sh`:
  - `ensure_env` setzt zusätzlich `APP_ENV`, `COMPOSE_PROJECT_NAME`, `CONTAINER_NAME`, `IMAGE_TAG` und
    `CODE_PEPPER`.
  - Neue Variable `REVISION`: deployt ein exaktes Commit-SHA statt „neuester Stand".
  - Vor jedem `deploy` läuft ein Backup, denn Migrationen lassen sich nicht zurückdrehen.
  - `backup` sichert zusätzlich `.env`. Ohne `CODE_PEPPER` sind alle Codes wertlos.
  - Der Befehl `invite` entfällt.
- `manage.ps1` bekommt einen Schalter `-Target staging|prod`. Er liest `.deploy.staging.env` bzw. `.deploy.env`
  und zeigt das Ziel farbig im Kopf an. Neue Aktion **„Staging → Prod übernehmen"**: Sie deployt Prod mit
  `REVISION=<SHA von Staging>`.
- Staging-Werte:
  - Verzeichnis `/opt/bernersennen-stammbaum-staging`, Branch `staging`, Port 3011
  - Adresse `staging.<domain>` mit Basic-Auth. Der Caddy-Eintrag gehört ins Proxy-Repo „server".
  - `X-Robots-Tag: noindex`
  - **nur Seed-Daten, nie eine Kopie der Prod-Daten**
- `APP_ENV` wird über `/api/config` ausgeliefert. Der Client zeigt auf Staging und lokal ein Band „Testsystem".

**Ablauf:** Feature-Branch → lokale Testumgebung → Branch `staging` → durchklicken → dasselbe SHA nach `main`/Prod.

**Fertig, wenn:**
- beide Instanzen parallel laufen, mit getrennten Daten;
- der Prod-Build nachweislich keinen Dev-Code enthält (Build-Check);
- „übernehmen" genau das getestete SHA deployt.

---

## Phase Z — Meine Chronik, Zuhause und Teilen (Zusatz 28.09.)

**Idee:** Weg vom reinen Stammbaum („Nachwuchs, Nachwuchs, Nachwuchs"), hin zur **Lebenschronik der eigenen Tiere**:
„Von 2010 bis 2025 haben mich diese Tiere begleitet." Eine Familie entsteht durch **Zusammenleben**, nicht durch
Abstammung. Die Tiere müssen nicht blutsverwandt und nicht verpaart sein. Abstammung bleibt als Zusatz für alle, die
sie kennen (Berner-Theme, Würfe), ist aber nicht mehr der Kern.

Jeder pflegt **seine eigene Chronik privat** und sieht zugleich, was die anderen in der gemeinsamen Familie machen.
Die gemeinsame Ansicht entsteht, indem mehrere private Chroniken ihre Tiere dort **zusammenführen**. Tiere und
Einträge lassen sich jederzeit zwischen „nur für mich" und „mit der Familie geteilt" hin- und herschieben.

Der Tierheim-Gedanke wird damit stärker: Ein Tier aus dem Tierheim ist ganz selbstverständlich Teil der Familie.
Sein **Einzugstag** zählt genauso wie ein Geburtstag, und seine Herkunft bleibt sichtbar.

### Begriffe (Vorschlag)

| Begriff | Bedeutung |
|---|---|
| **Meine Chronik** | Der private Bereich eines Haushalts. Technisch ein Eintrag in `families` mit `art='zuhause'`. Nur der Haushalt sieht ihn. |
| **Familie** (Standard-Theme) bzw. **Rudel** (Berner-Theme) | Der gemeinsame Bereich mehrerer Haushalte. Technisch `families.art='rudel'`, wie alle heutigen Rudel. |
| **Wegbegleiter** | Alle Tiere, die bei einem Haushalt gelebt haben oder leben, mit „bei uns seit … bis …". |
| **lebt mit** | Die Verbindung zwischen Tieren ohne gemeinsame Abstammung. Ersetzt überall „Adoptiv-…" (Karten, Formulare, Texte). Aus „Adoptiv-Katze von Hermes" wird „lebt mit Hermes". |
| **Einzug / Abschied** | Die Tage, an denen ein Tier dazukam bzw. gegangen ist (verstorben, abgegeben, umgezogen). |

### Was Nutzer sehen

- **Wegbegleiter-Zeitleiste** als Startansicht von „Meine Chronik": Jahre auf der Achse, je Tier ein Balken von
  Einzug bis Abschied. Überlappende Balken zeigen, wer mit wem zusammengelebt hat. Ein Klick öffnet die Tierseite.
  Verstorbene Tiere bleiben mit sanfter Kennzeichnung („In Erinnerung") sichtbar.
- **Herkunft** je Tier: „Woher kam Luna?" mit Tierheim/Tierschutz, von privat, Züchter, eigener Nachwuchs, Fundtier,
  anderes, dazu ein Freitext, z. B. „Tierheim Sonnenhang". In Phase T wird das beim Übergabe-Gutschein automatisch
  gesetzt.
- **Automatische Meilensteine** in der Chronik: Einzug („Luna zieht ein") und Abschied, wie heute Geburt und Würfe.
  Dazu ein Hinweis vor dem Jahrestag: „Morgen ist Luna 5 Jahre bei euch", so wie der Wurf-Geburtstag.
- **Teilen je Tier:** „In Familie zeigen" mit einer Liste der Familien, in denen der Haushalt Mitglied ist.
  Ausschalten nimmt das Tier wieder heraus. In der Chronik bleibt alles erhalten.
- **Teilen je Eintrag:** Ein Schloss am Eintrag schaltet zwischen „nur für mich" und „mit der Familie geteilt".
  Standard ist „geteilt", sobald das Tier geteilt ist. Private Einträge erscheinen nie in der Familienansicht.
- **Ansicht wechseln:** Oben ein Umschalter „Meine Chronik ▾ / Familie Sonnenhang". Die Familienansicht zeigt den
  heutigen Stammbaum, die Pinnwand, „Neu im Rudel" usw., aber mit allen Tieren, die die Haushalte dort teilen.
- **Umziehen:** Ein Tier, das heute direkt im gemeinsamen Rudel liegt, lässt sich in „Meine Chronik" holen und
  bleibt dabei geteilt. Umgekehrt geht es auch. So wandern bestehende Rudel ohne Stichtag nach und nach um.
- **Familienansicht nach Haushalten:** Optional gruppiert der Stammbaum die Tiere nach Zuhause
  („Zuhause am Deich: Hermes, Minka"). Verbindungen über „lebt mit" und Abstammung bleiben, wie sie sind.

### Rechte

| Wer | Darf |
|---|---|
| Haushalt (Besitzer des Tiers) | alles: Tier und Einträge pflegen, teilen, Teilen beenden, umziehen |
| Familie, in die das Tier geteilt ist | lesen (nur geteilte Einträge), kommentieren, in Würfen und im Stammbaum verbinden |
| Tiere, die direkt im Rudel liegen (heutiger Stand) | wie heute: alle im Rudel dürfen pflegen |
| Alle anderen | nichts (404, wie heute) |

### Datenmodell (Skizze)

```
families          += art CHECK IN ('rudel','zuhause','tierheim') DEFAULT 'rudel'
family_members(member_family_id, group_family_id, since, role)   -- Haushalt ist Mitglied einer Familie
dog_shares(dog_id, family_id, since, story_consent INT DEFAULT 0, revoked_at)   -- aus Phase T, jetzt früher
dogs              += bei_uns_seit, bei_uns_bis, abschied_grund, herkunft_art, herkunft_text
timeline_entries  += geteilt INT NOT NULL DEFAULT 1
dog_transfers(id, dog_id, from_family_id, to_family_id, voucher_id NULL, transferred_at)   -- aus Phase T
```

- **Ein Tier gehört genau einem Bereich** (`dogs.family_id`). Geteilt wird per `dog_shares`, nie per Kopie.
- **Die Familienansicht** lädt `dogs WHERE family_id = :rudel OR id IN (aktive dog_shares für :rudel)` und von
  geteilten Tieren nur Einträge mit `geteilt=1`.
- **Schreibende Routen** bleiben streng beim Besitzer. Nur `loadOwnDog` bzw. ein neues `loadVisibleDog` für
  lesende Routen und Kommentare kennen Freigaben. Dafür kommen eigene Tests dazu: Fremde sehen weiterhin nur 404,
  private Einträge tauchen in keiner Liste und keinem Zähler auf, Fotos privater Einträge sind nicht abrufbar.
- **Eltern über Haushaltsgrenzen:** Ein Eltern-Verweis darf auf ein Tier zeigen, das in einer gemeinsamen Familie
  sichtbar ist (Wurfgeschwister in verschiedenen Haushalten). Endet die Freigabe, zeigt die App den Namen als Text.
- **Beitreten:** Ein Haushalt tritt einer Familie mit deren Schlüssel bzw. Passwort bei (`family_members`). Ab
  Phase 1 geht das auch per Einladungs-Gutschein, der beim Einlösen gleich die Mitgliedschaft anlegt.
- **Mitlesen des Tierheims** (Phase T) ist damit nur noch ein Sonderfall von `dog_shares` mit einer Familie der Art
  `tierheim`.

### Auswirkungen auf andere Phasen

- **Phase D:** Wortschatz „lebt mit" statt „Adoptiv-…". Neue Texte für „Meine Chronik" und „Wegbegleiter".
- **Phase 1:** Wer einen Gutschein einlöst, legt zuerst **„Meine Chronik"** an. Eine Familie gründen oder ihr
  beitreten kommt danach bzw. über einen Einladungs-Gutschein (`vouchers.join_family_id`). Die Weitergabe-Gutscheine
  eines Rudels werden damit zu Einladungen in genau diese Familie.
- **Phase T:** Die Übergabe zieht das Tier in „Meine Chronik" der neuen Halter, mit Herkunft „Tierheim X" und
  Einzugstag. Das Tierheim liest nur mit, wenn die Halter es freigeben (`dog_shares`).
- **Präsentation (Phase 5):** Die Geschichte für Tierheime lautet: „Das Tier bekommt eine Chronik, die sein Leben
  lang mitwächst."

### Demo

- **„Meine Chronik" der Demo** mit Wegbegleitern von 2008 bis heute: ein verstorbener Hund („In Erinnerung"), eine
  Katze von privat, ein Tierheimhund mit Einzugstag und ein Kaninchen, zusätzlich zwei private Einträge.
- Der Demo-Haushalt ist Mitglied der Demo-Familie „Rudel vom Sonnenhang". Zwei seiner Tiere sind dort geteilt.
  So lassen sich beide Ansichten und der Umschalter vorführen.

**Fertig, wenn:**
- ein Haushalt seine Tiere privat mit Einzug, Abschied und Herkunft pflegen und als Zeitleiste sehen kann;
- er Tiere und einzelne Einträge in eine Familie teilen und wieder herausnehmen kann;
- die Familienansicht die geteilten Tiere aller Haushalte zeigt, private Einträge nie;
- bestehende Rudel unverändert weiterlaufen und Tiere in „Meine Chronik" umziehen können;
- nirgends mehr „Adoptiv-…" steht.

---

## Phase 1 — Gutscheine und neuer Login

### Schema (`server/db.js`, per `CREATE TABLE IF NOT EXISTS` bzw. `addColumnIfMissing`)

```
partners(...)          -- schon hier anlegen, weil Gutscheine darauf verweisen (Spalten siehe Phase 2)
voucher_batches(id, label, kind CHECK IN ('partner','rudel','admin','demo'), partner_id, size, created_at)
vouchers(id, batch_id, code_hash TEXT UNIQUE NOT NULL, code_cipher, code_hint, partner_id,
         issued_by_family_id, redeemed_by_family_id, redeemed_at, expires_at, revoked_at, created_at)
users(id, family_id, username TEXT COLLATE NOCASE UNIQUE NOT NULL, password_hash, email,
      session_epoch, last_login_at, created_at)
families += access_key_hash, legacy_password INT DEFAULT 1, auth_epoch INT DEFAULT 0, plz, voucher_id
CREATE UNIQUE INDEX idx_families_access_key ON families(access_key_hash) WHERE access_key_hash IS NOT NULL
```

- SQLite kann per `ALTER TABLE` keine UNIQUE-Spalte ergänzen. Deshalb gibt es einen partiellen Unique-Index.
- `families.password_hash` ist `NOT NULL`. Neue Rudel bekommen `password_hash='!'` und `legacy_password=0`. Dieser
  Wert kann nie passen, weil bcrypt nur 60 Zeichen lange Hashes akzeptiert. Bestehende Rudel behalten
  `legacy_password=1`.

### Code-Format (`server/lib/codes.js`)

- 12 Zeichen in Crockford-Base32 (ohne I, L, O, U) aus `crypto.randomInt`, also etwa 60 Bit.
  Angezeigt als `XXXX-XXXX-XXXX`.
- `normalizeCode` ist beim Eintippen nachsichtig: Großschreibung, Leerzeichen und Bindestriche werden entfernt,
  O wird zu 0, I und L werden zu 1.
- Abgleich über **HMAC-SHA256 mit `CODE_PEPPER`** in einer indizierten Spalte, statt einer bcrypt-Schleife.
  Das geht, weil die Codes zufällig und lang sind.
- Noch nicht eingelöste Codes liegen zusätzlich verschlüsselt vor (AES-GCM, Schlüssel aus dem Pepper abgeleitet).
  So kann ein Rudel seine Weitergabe-Codes erneut anzeigen und der Admin Karten nachdrucken. Nach dem Einlösen
  wird diese Kopie gelöscht.
- `CODE_PEPPER` ist in Produktion Pflicht, genau wie `JWT_SECRET`.

### API

| Endpunkt | Zweck |
|---|---|
| `POST /api/vouchers/check {code}` | Status des Codes plus Partner-Branding. Bewusst POST, damit der Code nicht im Log landet. |
| `POST /api/vouchers/redeem {code, name, plz?, username?, password?, email?, website}` | Einlösen in einer Transaktion (Details unten) |
| `GET /api/vouchers/mine` | Eigene Weitergabe-Gutscheine. Ersetzt `GET /api/invite`. Die Demo bekommt feste Schein-Codes. |
| `POST /api/login {secret}` | Sieht die Eingabe wie ein Code aus, wird direkt über den Hash gesucht. Sonst läuft die bcrypt-Schleife, aber nur über Rudel mit `legacy_password=1`; diese Menge wächst nicht mehr. Ist der Code ein noch nicht eingelöster Gutschein, antwortet der Server `409 {redeem:true}` und der Client wechselt zum Einlöse-Formular. |
| `POST /api/login {username, password}` | Login mit Benutzername und eigenem Passwort |
| `POST /api/recover {code, username, newPassword}` | Code als PUK: Passwort zurücksetzen, alte Sessions des Users enden |
| `POST /api/family/key` | Rudel-Schlüssel erzeugen oder erneuern. Er wird einmal angezeigt, alle Sessions enden. Das ist auch der Umstiegsweg für alte Rudel: Nach einem Login mit altem Passwort erscheint ein Hinweis, danach lässt sich das alte Passwort abschalten. |
| `POST /api/users` | Ein Rudel legt Benutzername, Passwort und E-Mail (optional) an |

Einlösen (`POST /api/vouchers/redeem`) in einer Transaktion:

1. `UPDATE vouchers … WHERE redeemed_at IS NULL`. Nur wenn dabei genau eine Zeile geändert wird, geht es weiter.
   Das schützt davor, einen Code doppelt einzulösen.
2. Das Rudel wird angelegt, mit dem Code als Schlüssel.
3. Ein User wird angelegt, falls Benutzername und Passwort mitkommen.
4. Das Rudel bekommt eigene Weitergabe-Gutscheine (`RUDEL_VOUCHER_QUOTA`, Standard 3).
5. Die Session startet über `setSessionCookie`.

- **Session:** Das JWT wird zu `{familyId, userId?, e}`. `requireAuth` lädt das Rudel ohnehin bei jeder Anfrage,
  die Prüfung der Epoche kostet also nichts extra.
- **Entfällt:**
  - `POST /api/families`
  - `FAMILY_INVITE_CODE` in `config.js`, `.env.example`, `remote.sh`, `manage.ps1`, `AdminPage` und `admin.js`
  - das doppelte `safeEqual` in `routes/auth.js`
  - die Meldung „Passwort belegt"
  - das Freitextfeld `quelle`. Die Spalte bleibt für Altdaten.
- **Missbrauchsschutz:**
  - `authLimiter` wandert nach `server/middleware/abuse.js`.
  - Neuer `codeLimiter` pro IP für check, redeem, recover und login.
  - Ein globaler Zähler für Fehlversuche mit Codes.
  - `rejectHoneypot` beim Einlösen.

### Client

- `LoginPage.jsx`:
  - ein Feld „Rudel-Schlüssel oder Passwort"
  - ein Link „Mit Benutzername anmelden"
  - „Schlüssel vergessen?" öffnet die Wiederherstellung per PUK
  - der Modus „Neues Rudel" wird zu **„Gutschein einlösen"**, mit Rudelname, optional PLZ, Benutzer und E-Mail
- Öffentliche Route **`/v#CODE`** als Ziel der QR-Codes:
  - Der Code steht hinter `#`. So landet er nie in Server-Logs oder im Referer.
  - Die Seite entfernt ihn per `history.replaceState` aus der Adresszeile.
  - Wer schon eingeloggt ist, bekommt „Abmelden und einlösen" angeboten.
- `InviteDialog.jsx` zeigt die eigenen Gutscheine: kopieren, teilen, Status eingelöst oder offen.
- In den Rudel-Einstellungen: Schlüssel erneuern, Benutzer verwalten, PLZ.
- `App.jsx` bekommt einen frühen Zweig für öffentliche Routen (`/v`, `/p/:slug`, `/partner`, `/impressum`,
  `/datenschutz`), analog zu `/admin` (`App.jsx:113`).

### Tests

- `createFamily()` in `server/test/helpers.js` wird von 15 Testdateien genutzt. Der Helper erzeugt künftig einen
  Gutschein über `lib/vouchers` und löst ihn ein. So bleiben alle bestehenden Tests lauffähig.
- Die Einladungscode-Tests in `security.test.js` werden umgeschrieben.
- Neu ist `vouchers.test.js` mit diesen Fällen:
  - Format und Normalisierung
  - nur einmal einlösbar, auch bei gleichzeitigen Anfragen
  - abgelaufen oder widerrufen
  - PUK-Wiederherstellung
  - Sessions enden nach Schlüsselwechsel
  - alte Passwörter funktionieren weiter
  - die Demo kann weder einlösen noch Gutscheine ausgeben
- `deleteFamily` in `server/lib/families.js` wird erweitert. Wegen `foreign_keys=ON` muss es zusätzlich `users`
  löschen und nicht eingelöste Gutscheine des Rudels entfernen. Bei den übrigen Gutscheinen wird der Rudel-Bezug
  auf NULL gesetzt, damit die Statistik erhalten bleibt.

### Risiken

- **Geht `CODE_PEPPER` verloren, sind alle Codes wertlos.** Deshalb kommt `.env` ins Backup.
- Wer eine Karte ausgibt, zum Beispiel ein Tierheim, kennt deren Code. Nach dem Einlösen empfiehlt die App daher,
  den Schlüssel zu erneuern (siehe offene Fragen).
- Bei der Registrierung lässt sich ausprobieren, ob ein Benutzername schon vergeben ist. Dagegen hilft das
  Rate-Limit.

**Fertig, wenn:**
- man sich nur noch mit Gutschein registrieren kann;
- der Code als Login und als PUK funktioniert;
- alte Passwörter weiter funktionieren;
- die Meldung „Passwort belegt" verschwunden ist.

---

## Phase 2 — Partner, Portale, Umkreissuche

### Tabelle `partners`

```
partners(id, slug UNIQUE, name,
  typ CHECK IN ('tierheim','vermittlung','hundeschule','futter','sonstige'),
  ist_partner INT,          -- 1 = Partnerschaft mit Portal, 0 = reiner Verzeichniseintrag
  status CHECK IN ('entwurf','aktiv','pausiert'),
  plz, ort, lat, lon, website, spenden_url, vermittlung_url, kontakt_json,
  logo_file, portal_titel, portal_text, farbe,
  quelle CHECK IN ('manuell','osm','sitecheck'), osm_ref, is_demo, created_at)
```

- Die Tabelle kennt **keinen Typ „Züchter"**. Das ist technisch ausgeschlossen.
- `server/lib/breederGuard.js` prüft jeden Schreibvorgang und jeden Import auf Züchter-Begriffe, etwa Zucht,
  Züchter, Zwinger, Deckrüde, „Welpen abzugeben" und Kennel.

### Standort

- **PLZ-Daten:** `server/geo/plz-de.json`, einmalig erzeugt von `server/scripts/build-plz.js` aus GeoNames
  (CC BY 4.0). Das Verzeichnis `server/data/` steht in `.gitignore`, deshalb liegt die Datei unter `server/geo/`.
- **Berechnung:** `server/lib/geo.js` wandelt PLZ in Koordinaten um, berechnet Entfernungen (Haversine) und rundet.
- **Auswahl im Client:** `client/src/components/LocationPicker.jsx` bietet ein **PLZ-Feld** oder den Knopf
  **„Standort verwenden"**.
  - Der Standort kommt über `navigator.geolocation`, erst nach Klick. Das funktioniert nur über HTTPS oder
    localhost, also nicht über `http://IP:PORT`.
  - Die Koordinaten werden im Browser und nochmals auf dem Server auf 0,01° gerundet, das sind etwa 1 km.
  - Sie gehen im POST-Body an den Server, nicht in der URL, und werden **nie gespeichert oder geloggt**.
  - Der Radius ist wählbar: 5, 10, 25, 50 oder 100 km.
  - Am Rudel gespeichert wird höchstens die PLZ, und nur wenn der Nutzer das will.

### Suche (`server/lib/places/`)

- **`index.js`:**
  - führt die eigene `partners`-Tabelle und die Anbieter zusammen;
  - entfernt Dubletten (gleiche OSM-ID, oder gleicher Name im Umkreis von 150 m);
  - wendet `breederGuard` an;
  - sortiert nach Entfernung, echte Partner zuerst mit Badge „Partner".
- **`providers/overpass.js`** ist die Hauptquelle, OpenStreetMap unter ODbL:

  ```
  nwr["amenity"="animal_shelter"](around:R,LAT,LON);
  nwr["amenity"="animal_training"]["animal_training"~"dog"](around:R,LAT,LON);
  out center tags;
  ```

  Ausgelesen werden Name, Webseite, Telefon, E-Mail, Adresse und die Vermittlungs-Tags. Einträge mit
  Zucht-Tags (`animal_breeding`) werden verworfen.
- **`providers/google.js`** ist nur vorbereitet und aus. Aktiv würde er erst mit `GOOGLE_PLACES_API_KEY`: nur
  Live-Abfragen, nur Minimalfelder, nie im Cache.
- **`cache.js`** speichert OSM-Ergebnisse in der SQLite-Tabelle `places_cache`, 7 Tage lang. Schlüssel sind die
  Art, das auf 0,05° gerundete Zentrum und der Radius.
- **`server/lib/http.js`** ist der einzige Weg nach außen:
  - eigener User-Agent `FamilienchronikBot/1.0 (+https://<domain>/bot)`
  - Timeout und 1 MB Größenlimit
  - nur http(s)
  - keine privaten oder Loopback-Adressen, auch nicht nach Weiterleitungen (SSRF-Schutz)
  - Host-Allowlist für die Anbieter
- **Limits:** `placesLimiter` pro IP, eine Tagesobergrenze für Anfragen an die Anbieter, und für Google später ein
  Monatszähler als Kostenbremse.

### Endpunkte

| Endpunkt | Zweck |
|---|---|
| `GET /api/public/partners?plz=&radius=` | Aktive Partner. Ohne PLZ kommen **alle** Partner. |
| `GET /api/public/partners/:slug` | Portal eines Partners. Mit Admin-Cookie auch als Vorschau für Entwürfe. |
| `POST /api/places/search` | Umkreissuche. Braucht eine Rudel- oder Admin-Session. Die neue Middleware `requireSession` lässt auch die Demo lesen, denn `requireAuth` blockt dort jedes Nicht-GET. |
| `/partner-media/` | Öffentliche Partner-Logos (`DATA_DIR/partner-media`). `/uploads` verlangt einen Login. |

### Client

- `PartnerPortalPage.jsx` unter `/p/:slug` zeigt:
  - Branding (Logo, Akzentfarbe) und Begrüßung („Willkommen von Tierheim X")
  - Gutschein einlösen direkt auf der Seite
  - Knopf „Demo ansehen"
  - eigene Anzeigen des Partners
  - Spendenlink
- `PartnersPage.jsx` (`/partner`) ist die Übersicht aller Partner, wahlweise nach Entfernung gefiltert.
- Ergebnisliste: Name, Typ, Entfernung, Badge „Partner" bzw. „geprüft". Links:
  - **„In Google Maps öffnen"** (`https://www.google.com/maps/search/?api=1&query=LAT,LON`)
  - **„OpenStreetMap"** (`https://www.openstreetmap.org/?mlat=LAT&mlon=LON#map=16/LAT/LON`)
  - wahlweise die Koordinaten zum Kopieren
- Keine eingebettete Karte, die CSP bleibt `'self'`. Eine Karte lässt sich später nachrüsten: Leaflet über npm,
  `img-src` um die Kachel-Server ergänzen, `referrerPolicy` für die Kacheln setzen.

### Demo

- Fiktive Demo-Partner mit `is_demo=1`, zum Beispiel „Tierheim Sonnenhang" und „Hundeschule Pfotenglück".
- Suchen aus der Demo liefern feste Ergebnisse und fragen nie einen echten Anbieter.

**Fertig, wenn:**
- ein Portal ohne Login funktioniert;
- eine Einlösung über ein Portal dem Partner zugeordnet wird;
- PLZ oder Standort Ergebnisse nach Entfernung sortiert liefern;
- ohne Standort „Alle Partner" erscheint;
- der Browser nur mit dem eigenen Server spricht.

---

## Phase T — Tierheim-Chroniken (Zusatz)

**Idee:** Tierheime nutzen die App selbst. Sie bauen für jedes Tier eine Chronik auf, sammeln Neuigkeiten und
machen damit Werbung für die Vermittlung. Die Chronik zieht mit dem Tier ins neue Zuhause um. Für uns ist das der
stärkste Grund, warum ein Tierheim Partner wird, und gleichzeitig der natürlichste Weg, Gutscheine zu verteilen:
**jede Vermittlung bringt ein neues Rudel.**

### Ablauf

1. **Tierheim-Konto:** Der Admin legt beim Partner-Onboarding ein Rudel der Art `tierheim` an, verknüpft mit dem
   Partner. Mitarbeitende und Ehrenamtliche bekommen je einen Benutzer (Tabelle `users` aus Phase 1). So sieht man,
   wer welchen Eintrag geschrieben hat.
2. **Chronik im Tierheim:** Für jedes Tier gibt es eine Chronik mit Ankunft, Tierarzt, Verhalten, Training,
   Gassi-Berichten und Fotos. Das nutzt die bestehende Timeline (`timeline_entries`) und die Tierart (`dogs.tierart`),
   also auch für Katzen und andere Tiere. Neu ist eine optionale Kategorie pro Eintrag, damit sich Änderungen
   filtern lassen, zum Beispiel „alle Tierarzt-Einträge".
3. **Werbung für das Tier:**
   - Ein Tier in Vermittlung bekommt einen öffentlichen **Steckbrief** unter `/t/:slug`. Er zeigt ausgewählte
     Fotos und Einträge, die als öffentlich markiert sind, und einen Kontakt-Knopf, der zum Tierheim führt. Die
     Vermittlung selbst läuft nie über die App.
   - Diese Steckbriefe erscheinen im Partnerportal (`/p/:slug`) und unter **„Neuer Begleiter gesucht?"**. Weil die
     Daten direkt vom Tierheim kommen, entfällt dafür weitgehend der Crawler für Vermittlungstiere.
   - Teilen: ein Link für Social Media und die eigene Webseite des Tierheims, dazu ein druckbarer Steckbrief als
     Aushang. Der nutzt den bestehenden Collage-Generator (`client/src/pages/CollagePage.jsx`, `PrintSheet`).
4. **Übergabe bei Vermittlung:**
   - Das Tierheim klickt „Vermittelt" und bekommt einen **Übergabe-Gutschein** für genau dieses Tier.
   - Die neuen Halter lösen ihn ein. Sie legen damit ein neues Rudel an oder hängen das Tier an ihr bestehendes
     Rudel. Das Tier zieht samt Chronik um.
   - Die Einträge des Tierheims behalten ihre Herkunft („Tierheim X, 12.03.2026").
5. **Neuigkeiten nach der Vermittlung:**
   - Die neuen Halter können freiwillig einstellen, dass **„das Tierheim mitlesen darf"**. Das lässt sich jederzeit
     widerrufen.
   - Das Tierheim sieht dann neue Einträge seiner vermittelten Tiere in einer Übersicht („Wie geht's unseren
     Ehemaligen?"). Das ersetzt nebenbei manche Nachkontrolle.
   - Mit einer zusätzlichen, eigenen Einwilligung darf das Tierheim einzelne Einträge als **Happy-End-Geschichte**
     öffentlich zeigen, als Werbung für das Tierheim.

### Datenmodell (Skizze)

> **Seit Phase Z:** `families.art`, `dog_shares` und `dog_transfers` entstehen schon dort. Phase T ergänzt nur
> `art='tierheim'`, `partner_id`, Vermittlungsstatus, Steckbrief und Übergabe-Gutschein. Die Übergabe zieht das
> Tier in „Meine Chronik" der neuen Halter, mit Herkunft „Tierheim X" und Einzugstag.

```
families        += art CHECK IN ('rudel','tierheim') DEFAULT 'rudel', partner_id
dogs            += vermittlung_status CHECK IN ('in_vermittlung','reserviert','vermittelt') NULL,
                   public_slug UNIQUE (partieller Index), herkunft_family_id
timeline_entries += kategorie NULL, is_public INT DEFAULT 0, herkunft_family_id
dog_transfers(id, dog_id, from_family_id, to_family_id, voucher_id, transferred_at)
dog_shares(dog_id, family_id, since, story_consent INT DEFAULT 0, revoked_at)   -- „Tierheim darf mitlesen"
voucher_batches.kind += 'uebergabe'; vouchers += dog_id NULL
```

- **Umzug:** `dogs.family_id` und die `family_id` der Timeline-Einträge des Tiers wechseln zum neuen Rudel.
  `herkunft_family_id` hält fest, wer den Eintrag geschrieben hat. Das geschieht in einer Transaktion zusammen mit
  dem Einlösen.
- **Andere Tiere:** Verbindungen zu anderen Tieren (`dog_links`, Eltern-Verweise) bleiben beim Tierheim und werden
  beim Umzug gelöst. Heute ist alles strikt pro Rudel getrennt (`loadOwnDog` in `server/routes/dogs.js`).
- **Mitlesen:** Das ist der **erste lesende Zugriff über Rudel-Grenzen hinweg**. Er wird bewusst eng gehalten:
  - eigene Endpunkte, zum Beispiel `GET /api/shelter/ehemalige`
  - nur lesend
  - nur für Tiere mit aktivem `dog_shares`
  - Die bestehenden Routen bleiben unverändert streng.
- **Öffentliche Steckbriefe:** Sie brauchen öffentliche Fotos. Heute verlangt `/uploads` einen Login. Die App
  liefert deshalb nur Fotos aus, die an einem öffentlichen Eintrag hängen, über eine eigene Route (zum Beispiel
  `/public-media/:id`) und nie das ganze Verzeichnis.

### Recht und Datenschutz

- Für die Inhalte der Steckbriefe ist das Tierheim verantwortlich: Bildrechte und korrekte Angaben. Das regelt eine
  kurze Nutzungsvereinbarung für Partner.
- Mitlesen und Happy-End-Geschichten brauchen je eine eigene, widerrufbare Einwilligung der neuen Halter
  (DSGVO Art. 6 Abs. 1 lit. a).
- Personenbezogene Daten der Halter erscheinen nie öffentlich, nur Tiername und Einträge, die sie freigegeben haben.
- Steckbriefe sind in der Standardeinstellung `noindex`. Das Tierheim entscheidet, ob Suchmaschinen sie finden
  dürfen.

### Demo und Präsentation

- Ein Demo-Tierheim „Tierheim Sonnenhang" mit 3–4 Tieren in Vermittlung, einem vermittelten Tier samt
  Happy-End-Geschichte und einem Übergabe-Gutschein in der Testumgebung.
- Der Präsentationsmodus (Phase 5) kann „als Tierheim X" vorführen. Das ist das Kernstück der Partner-Präsentation.

**Fertig, wenn:**
- ein Tierheim Tiere mit Chronik pflegen und einen öffentlichen Steckbrief freischalten kann;
- ein Übergabe-Gutschein das Tier samt Chronik in ein neues oder bestehendes Rudel umziehen lässt;
- das Tierheim Neuigkeiten nur mit Einwilligung sieht und diese Einwilligung widerrufbar ist.

---

## Phase 3 — Reiter „Entdecken"

- **Navigation:** neuer Eintrag `/entdecken` in `NAV_ITEMS` (`client/src/App.jsx:19`) mit Kompass-Icon in
  `client/src/components/Icon.jsx`. Das ergibt 5 Einträge, die mobile Leiste unten muss geprüft werden
  (`client/src/styles/layout.css` ~153).
- **`DiscoverPage.jsx` hat vier Abschnitte:**
  1. **„Hundeschule gesucht? Hier klicken"**: Partner-Hundeschulen im Umkreis, sonst alle.
  2. **„Neuer Begleiter gesucht?"**: nur `tierheim` und `vermittlung`, nur Partner und vom Admin geprüfte
     Einträge. **Nie Züchter.** Dazu die Steckbriefe von Tieren in Vermittlung aus Partner-Tierheimen im Umkreis
     (Phase T).
  3. **„Futter-Empfehlungen"**: was Hundetrainer empfehlen, mit „empfohlen von …" und je nach Geschäftsmodell
     als „Anzeige" gekennzeichnet.
  4. **„Unterstützen"**:
     - Link zur GoFundMe-Kampagne
     - Transparenzblock „Kosten gedeckt: X € · an Tierheime weitergegeben: Y €"
     - Spendenlinks der Partner-Tierheime
- **Schema:**

  ```
  promotions(id, partner_id, bereich, kennzeichnung CHECK IN ('Anzeige','Empfehlung','Partner'),
             empfohlen_von, titel, text, url, bild_file, aktiv, start, ende, sort, is_demo)
  link_clicks(target_type, target_id, tag, anzahl)
  donation_reports(id, zeitraum, eingang_cents, kosten_cents, weitergeleitet_cents, empfaenger, nachweis_url)
  settings(key, value)      -- z. B. gofundme_url
  ```

- **API:** `GET /api/discover` braucht einen Login, die Demo darf es auch.
- **Klickzählung über `GET /r/:id`:**
  - Die Route steht in `app.js` **vor** `serveClient`, weil dort ein Catch-all hängt. Dazu kommt ein Proxy-Eintrag
    in `vite.config.js`.
  - Sie erhöht einen Zähler pro Tag und leitet weiter.
  - Weitergeleitet wird **nur auf gespeicherte URLs**, es gibt also keine offene Weiterleitung.
  - Bots werden ignoriert.
  - Keine Cookies, keine IP-Adressen. Damit ist kein Consent-Banner nötig (TDDDG §25).
- **Kennzeichnung und Recht:**
  - Alles Bezahlte oder mit Provision wird als **„Anzeige"** gekennzeichnet (UWG §5a Abs. 4, DDG §6).
  - „Empfehlung von …" nur, wenn keine Gegenleistung fließt.
  - Anzeigen-Links bekommen `rel="sponsored noopener noreferrer"`.
  - Futtertexte ohne Gesundheitsversprechen (VO (EG) 767/2009).
  - GoFundMe ist ein reiner externer Link. Spendenquittungen gibt es nicht, weil es eine private Kampagne ist.
- **Demo-Daten:** `server/seed/demo-data.js` bekommt `PARTNERS`, `PROMOTIONS` und `DONATION_REPORT`. Laut
  Konvention muss jedes neue Feature in den Demo-Daten auftauchen. `replaceDemoPack` ersetzt diese Daten mit.

---

## Zwei Produkte auf einer Plattform (Zusatz 29.09.)

„Familie auf Pfoten“ besteht aus zwei Produkten, die sich gegenseitig tragen:

| | **Chronik** (für Tierhalter) | **Partner-Profil** (für Hundeschulen, Tierheime, Hundesalons, Betreuung …) |
|---|---|---|
| Zweck | private Chronik der eigenen Tiere, Familien/Rudel teilen | öffentliches Bewerbungs- und Werbeprofil, Einblicke, Anzeigen, Kontakt |
| Einstieg | **Kunden-Gutschein** → „Meine Chronik“ | **Partner-Zugang** (Gutschein vom Admin, von Hand verteilt) → Partner-Bereich |
| Sichtbarkeit | privat bzw. nur für die eigene Familie | öffentlich (Portal, Entdecken, Partnerliste) |
| Karten | Kunden-Karten, auch über Partner-Stapel verteilt | Partner-Karten „Euer kostenloses Partnerprofil“ |

- **Getrennte Bereiche:** Partner-Bereiche sind vom privaten Teil getrennt. Wer als Partner auch privat eine Chronik
  führen will, braucht dafür einen **Kunden-Gutschein**. Aus einem Partner-Bereich heraus kann man keiner Familie
  beitreten und keine gründen.
- **Werbung für die Chronik:** Partner verteilen weiter Kunden-Gutscheine (Partner-Stapel) an ihre Kundschaft. So
  wirbt jedes Partner-Profil auch für die Chronik.

---

## Phase P — Partner-Zugang, Partner-Bereich und Kontakt (Zusatz 29.09., erweitert)

**Idee:**
- **Selbst pflegen:** Partner pflegen ihren öffentlichen Auftritt selbst und sehen jederzeit, wie er für Kunden
  aussieht.
- **Beiträge:** Sie zeigen Einblicke in ihre Arbeit (Fotos mit Datum) und stellen Beiträge ein, die im Umkreis der
  Nutzer als **„Anzeige“** erscheinen.
- **Kontakt:** Sie sind direkt erreichbar über eine hinterlegte E-Mail, einen Link zu ihrem eigenen Kontaktformular
  oder unser Formular **„Schreib uns“**.

Die Phase wird in zwei Schritten ausgeliefert: **P1** (Zugang, Profil, Kundensicht, Einblicke) und **P2**
(Anzeigen mit Freigabe, Kontakt, Postfach).

### P1 — Partner-Zugang und Profil

- **Partner-Zugang (Gutschein):**
  - Der Admin erzeugt Stapel mit dem Zweck **„Partner-Zugang“**. Optional gibt er einen Typ vor oder bindet den
    Zugang an einen schon angelegten Partner. Der Betreiber verteilt die Karten von Hand.
  - Einlösen über `/v#CODE` wie bei Kunden-Gutscheinen. Der Server erkennt den Zweck und startet die
    **Einrichtung**: Name, Typ und PLZ.
  - Daraus entstehen ein Partner-Datensatz (Status „Entwurf“) und ein Partner-Bereich. Tierheime und
    Vermittlungsstellen bekommen einen Tierheim-Bereich mit Tieren. Der Code wird zum Schlüssel, genau wie beim
    Kunden-Gutschein.
  - Der Admin kann Partner-Bereiche auch weiterhin direkt anlegen, etwa mit „Bereich anlegen“ in der Partnerliste.
  - **Typen:** Tierheim, Vermittlung, Hundeschule, **Hundesalon**, **Betreuung** (Hundesitter, Tagesstätte,
    Pension), Futter, Sonstiges. Züchter gibt es nie, der Züchter-Schutz gilt für alle Texte.
- **Umschalter „Bearbeiten | Kundensicht“:** Er ist in jedem Partner-Bereich immer sichtbar.
  - **Bearbeiten:**
    - öffentliche Profilangaben: Name, Titel, Text, Farbe, Logo, Website, Spenden- und Vermittlungs-Link,
      Kontakt, PLZ;
    - Einblicke;
    - bei Tierheimen die Tiere mit Status, also „Verfügbar“ (in Vermittlung), „Reserviert“, **„Pausiert“**
      (on hold, vorübergehend nicht vermittelbar) und „Vermittelt“.
  - **Kundensicht (Live-Vorschau):**
    - die **Beispiel-Oberfläche eines Kunden** (Demo-Haushalt) mit dem Reiter „Entdecken“, in dem die eigene
      Karte und die eigenen Beiträge erscheinen;
    - dazu das eigene Portal und die Steckbriefe, genau so, wie andere sie sehen.
    - Das geht auch, solange das Profil noch **nicht veröffentlicht** ist. Ein Band zeigt dann „Vorschau – so
      sehen Kunden euer Profil“.
- **Veröffentlichen:**
  - Der Partner schaltet sein Profil selbst auf „aktiv“ oder pausiert es. Ein Zugang wird persönlich übergeben,
    deshalb braucht es dafür **keine Admin-Freigabe**.
  - Der Admin kann ein Profil jederzeit **sperren**. Solange es gesperrt ist, kann der Partner es nicht
    reaktivieren.
  - Der Slug bleibt nach der ersten Veröffentlichung fest, weil Links und QR-Codes ihn enthalten. Den Typ ändert
    nach der Einrichtung nur der Admin.
- **Einblicke** („was wir mit unseren Fellnasen machen“):
  - **Inhalt:** Foto, Datum und kurzer Text, zum Beispiel ein frisch gestylter Pudel, die Welpengruppe oder ein
    Ausflug.
  - **Wo sie erscheinen:** auf dem Portal als Galerie, neueste zuerst. Das neueste Foto ist das Vorschaubild auf der
    Karte in „Entdecken“ und in der Partnerliste.
  - **Keine Freigabe durch den Admin**, er kann einzelne Einblicke aber ausblenden.
  - **Einwilligung:** Pflicht-Häkchen „Die Halterinnen und Halter der gezeigten Tiere sind einverstanden.“ Dazu der
    Hinweis, keine Personen und keine Nachnamen oder Adressen zu zeigen.
  - **Fotos:** Metadaten werden entfernt (EXIF bzw. PNG), die Bilder liegen unter `/public-media`.
  - **Grenze:** höchstens 60 Einblicke. Beim Überschreiten fragt die App, ob die ältesten gelöscht werden sollen.
- **Zugänge im Partner-Bereich:** weitere Logins für Mitarbeitende, wie „Zugang“ in der Chronik. Den Schlüssel
  erneuern mit Bestätigung.
- **Hinweis im Partner-Bereich:** „Privat eine eigene Chronik führen? Dafür gibt es Kunden-Gutscheine.“
- **Demo:**
  - Die „Hundeschule Pfotenglück“ bekommt einen Demo-Partner-Bereich mit Einblicken.
  - Dazu kommt der Demo-„Hundesalon Wuschelglück“ mit Einblicken.
  - „Demo als Partner ansehen“ zeigt Bearbeiten und Kundensicht im Nur-Lesen-Modus.

### P2 — Anzeigen, Kontakt und Postfach

- **Beiträge („Werbung“):**
  - Partner legen Beiträge an, zum Beispiel Kurse, Aktionen, Tage der offenen Tür oder Angebote.
  - Die **Kennzeichnung ist immer „Anzeige“**.
  - Der Bereich richtet sich nach dem Partner-Typ.
  - Neue und geänderte Beiträge sind **„eingereicht“**. Der Admin gibt sie frei oder lehnt sie mit Begründung ab.
  - Der Partner sieht Status und Klickzahlen.
  - Freigegebene Beiträge erscheinen in „Entdecken“ und auf dem Portal.
- **Anzeige im Umkreis:**
  - PLZ und Standort sind optional.
  - Gibt es im Umkreis **weniger als 5 Treffer**, werden die nächsten weiteren nach Entfernung angehängt
    („weiter weg“). Ohne PLZ erscheinen alle.
  - Das gilt für „Entdecken“ und für die Partnerliste.
  - Hundesalons und Betreuung bekommen in „Entdecken“ ein eigenes Kapitel **„Salon & Betreuung“**.
- **Kontakt:**
  - Auf dem Portal und auf Steckbriefen gibt es „Schreib uns“.
  - **Formular:** Name (optional), E-Mail oder Telefon (eins von beiden ist Pflicht) und die Nachricht. Vom
    Steckbrief aus kommt der Bezug automatisch mit („Anfrage zu Pepper“).
  - **Postfach statt E-Mail:** Die Nachrichten landen im Postfach des Partner-Bereichs. Wir versenden **keine
    E-Mails**.
  - **Weitere Wege:** ein `mailto:`-Link und ein Link zum eigenen Kontaktformular des Partners. Eingebettet wird
    nichts, die CSP bleibt `'self'`.
- **Missbrauchsschutz:** Rate-Limit pro IP, Honeypot, Längengrenzen. Nachrichten werden nach 180 Tagen gelöscht.
  Die Datenschutzseite erklärt das.
- **Demo:**
  - Pfotenglück bekommt zwei Beiträge (einer freigegeben, einer eingereicht) und zwei Beispiel-Nachrichten.
  - Das Demo-Tierheim bekommt eine Anfrage zu einem Steckbrief.

**Entscheidung 7 (Anzeigen-Pflege) geändert:** Partner pflegen ihre Beiträge selbst, der Admin gibt frei.

---

## Phase R — Familien-Verwaltung und Rollen (Zusatz 29.09.)

**Idee:** Eine Familie (im Berner-Theme „Rudel“) hat eine Leitung, die alles verwalten darf. Darunter gibt es
abgestufte Rollen. Neue Mitglieder kommen weiter über Einladungs-Gutscheine dazu. Die Rolle steht schon im
Gutschein.

### Drei Ebenen, klar getrennt

| Ebene | Wer sieht es | Beispiel |
|---|---|---|
| **Privat** | nur der eigene Haushalt | „Meine Chronik“, private Einträge, nicht geteilte Tiere |
| **Familie** | Mitglieder der Familie, je nach Rolle | geteilte Tiere, Pinnwand, Stammbaum, Würfe |
| **Öffentlich** | alle | nur Partner-Portale, Steckbriefe, Happy-Ends (mit Einwilligung) |

Eine Familie ist nie öffentlich. Die Mitglieder-Seite zeigt diese Übersicht, damit klar ist, wer was sieht.

### Rollen

| Recht | Leitung („Rudelführer“) | Stellvertretung | Mitglied | Gast |
|---|---|---|---|---|
| Familie ansehen, kommentieren | ✓ | ✓ | ✓ | ✓ |
| eigene Tiere und Einträge teilen | ✓ | ✓ | ✓ | – |
| Würfe und Stammbaum-Verknüpfungen pflegen | ✓ | ✓ | ✓ | – |
| Einladen (Gutscheine erzeugen, Kontingent) | ✓ | ✓ | – | – |
| Beiträge anderer in der Familie ausblenden | ✓ | ✓ | – | – |
| Mitglieder entfernen, Rollen ändern | ✓ | – | – | – |
| Name, Theme, Familien-Schlüssel | ✓ | – | – | – |
| Familie auflösen, Leitung übergeben | ✓ | – | – | – |

- **Rollen je Theme:**
  - Berner-Theme: „Rudelführer“, „Stellvertretung“, „Mitglied“, „Gast“.
  - Standard-Theme: „Familienleitung“, „Stellvertretung“, „Mitglied“, „Gast“.
- **Leitung:**
  - Es gibt immer mindestens eine Leitung. Die letzte Leitung kann nur gehen, wenn sie die Leitung übergibt oder
    die Familie auflöst.
  - Mehrere Leitungen sind erlaubt.
- **Einladungen:**
  - Ein Einladungs-Gutschein trägt die Rolle. Standard ist „Mitglied“.
  - Die Stellvertretung darf höchstens „Mitglied“ oder „Gast“ einladen.
  - Offene Einladungen sieht man auf der Mitglieder-Seite und kann sie dort widerrufen.
- **Entfernen:**
  - Entfernt die Leitung ein Mitglied, verschwinden dessen geteilte Tiere aus der Familie. In seiner eigenen
    Chronik bleiben sie erhalten.
  - Kommentare bleiben stehen, als Name erscheint dann „ehemaliges Mitglied“.
- **Bestandsfamilien:**
  - Der gemeinsame Familien-Schlüssel (alte Rudel-Logins) hat Leitungsrechte, wie bisher.
  - Das älteste Mitglied jeder Familie wird bei der Umstellung zur Leitung.
- **Demo:** In der Demo-Familie sind alle vier Rollen besetzt. Die Mitglieder-Seite ist in der Demo nur lesbar.

---

## Phase U — Übersichtlichkeit, Wording und Einstiege (Zusatz 29.09., nach dem ersten Test)

- **Zurück-Navigation:** Impressum, Datenschutz und alle öffentlichen Seiten bekommen einen schlanken Kopf mit Logo
  und „Zurück“.
- **Klare Einstiege:** Die Startseite zeigt zwei Wege: „Für Tierhalter“ (Gutschein, Anmelden, Demo) und „Für
  Hundeschulen, Tierheime & Co.“ (Demo als Partner, Partner werden). Die Partner-Demo ist die Werbung: Partner sehen
  erst alles an, bevor sie einsteigen. In der Partner-Demo führt ein kurzer Hinweis zu Profil, Kundensicht und
  Beiträgen/Tieren.
- **Wording im Standard-Auftritt:** „Familienbande“ statt „Stammbaum“, „Nachwuchs“ statt „Würfe“; Nachwuchs steht
  nicht in der unteren Leiste, sondern erscheint auf „Familienbande“ nur, wenn es Würfe gibt. Der Berner-Auftritt
  bleibt unverändert.
- **Einfach und ruhig:** klares Raster, weniger Badges, Entdecken mit Filter-Chips statt langer Kapitel, Admin in
  Reitern, Partner-Profil mit höchstens vier Reitern. Das Grundprinzip bleibt.

---

## Phase N — Anfragen und Benachrichtigungen (Zusatz 29.09.)

- **Gutschein anfragen:** Besucher ohne Gutschein hinterlassen eine Anfrage; eine gültige E-Mail ist Pflicht (Format
  und Domain per DNS geprüft). Der Admin weist im Admin einen offenen Code zu und schickt ihn selbst per E-Mail –
  wir versenden keine E-Mails.
- **Partner-Zugang anfragen:** Hundeschulen, Tierheime & Co. fragen über `/partner-werden` an (Firma, Typ, PLZ,
  E-Mail).
- **Telegram für den Admin:** je Ereignis ein-/ausschaltbar – Gutschein-Anfrage, Partner-Anfrage, neue Registrierung,
  Feedback, eingereichter Beitrag. Standard ohne personenbezogene Daten, „Details mitsenden“ ist ein eigener
  Schalter. Bot-Token und Chat-ID nur in der Server-`.env`.
- **Aufbewahrung:** erledigte Anfragen 180 Tage, offene 365 Tage.

---

## Phase M — „Mein Revier“: öffentliche Profile und Radar in der Nähe (Zusatz 29.09.)

**Idee:** Wer möchte, schaltet sein Profil öffentlich. Andere Tierhalter in der Nähe sehen es im Radar „Mein
Revier“, können öffentlichen Erinnerungen folgen und so die Tiere aus der Nachbarschaft kennenlernen. Das ist eine
bewusste Ausnahme vom Grundsatz „Eine Familie ist nie öffentlich“: nur mit ausdrücklichem Opt-in.

- **Öffentliches Profil (Opt-in):**
  - Schalter „Profil öffentlich zeigen“ im eigenen Zuhause bzw. in einer Familie (dort nur die Leitung).
  - Pflicht: PLZ und das Häkchen „Ich möchte, dass andere mein Profil sehen können“.
  - Optional: Anzeigename (statt des Bereichsnamens), kurzer Text, Profilbild.
  - Standort nur als PLZ, im Radar nur als Entfernungsstufe („unter 5 km“, „5–10 km“ …), nie genauer.
  - Jederzeit wieder ausschaltbar; dann sofort unsichtbar.
- **Was öffentlich ist:**
  - Je Tier ein eigener Schalter „im öffentlichen Profil zeigen“ (Standard: aus; „alle zeigen“ als Abkürzung).
  - Einträge bekommen eine dritte Sichtbarkeit: **privat** (nur Zuhause) · **Familie** (wie bisher) ·
    **öffentlich**. Nur ausdrücklich öffentliche Einträge erscheinen im Profil und im Radar.
  - Keine Personen-Namen nötig, keine Adresse, keine Kontaktdaten.
- **„Mein Revier“ (Radar):**
  - Liste öffentlicher Profile im Umkreis (5/10/25 km) mit Tieren und der neuesten öffentlichen Erinnerung,
    sortiert nach Entfernungsstufe; Filter nach Tierart.
  - **Folgen:** öffentlichen Profilen folgen; ein Bereich „Aus deinem Revier“ zeigt neue öffentliche Erinnerungen der
    gefolgten Profile. Folgen ist für den anderen sichtbar nur als Zahl, nicht als Liste (Vorschlag).
- **„Mein Profil für andere“:** Knopf im eigenen Bereich, zeigt das öffentliche Profil genau so, wie andere es
  sehen (wie die Kundensicht der Partner) – auch vor dem Einschalten.
- **Schutz:** melden/ausblenden je Profil, Admin kann sperren, Rate-Limits, `noindex`, keine Direktnachrichten im
  ersten Schritt, Demo-Profile auf der Vorschau.
- **Offene Fragen:** Kommentare unter öffentlichen Erinnerungen erlauben? Nachrichten zwischen Tierhaltern? Sollen
  öffentliche Profile für nicht angemeldete Besucher sichtbar sein oder nur für angemeldete Nutzer (Vorschlag: nur
  für Angemeldete)?

---

## Phase G — Eigene Domain und Go-Live (Zusatz 29.09.)

**Idee:** Wenn Vorschau und Phasen stehen, zieht alles unter eine eigene Domain. Erst danach werden Karten
gedruckt, weil die QR-Codes die Domain enthalten.

- **Vorbereitung (Betreiber):**
  - Markenrecherche (Frage 18).
  - Domain prüfen und kaufen, zum Beispiel `familieaufpfoten.de` und `familie-auf-pfoten.de` als Weiterleitung.
  - DNS-Einträge (A, AAAA) auf den Server setzen.
- **Proxy:**
  - Caddy-Block je Domain mit automatischem Let's-Encrypt-Zertifikat, dafür müssen Port 80 und 443 frei sein.
  - Die Vorschau zieht nach `vorschau.<domain>`, optional mit Basic-Auth.
  - **Proxy und Firewall ändert nur der Betreiber** oder es geschieht mit seiner ausdrücklichen Freigabe.
- **App:**
  - `PUBLIC_URL` bzw. `DEPLOY_DOMAIN` setzen (QR-Ziele, Links, Portal-URLs).
  - HSTS und strenge Cookies prüfen.
  - Alte Adresse `IP:3010` leitet auf die Domain weiter.
  - `robots.txt` (Steckbriefe `noindex`, Portale indexierbar).
- **Recht:**
  - echte Impressum-Angaben (`IMPRESSUM_*`) und eine Kontakt-E-Mail unter der Domain;
  - die Datenschutzseite prüft der Betreiber.
- **Go-Live:**
  - Backup von Prod.
  - `CODE_PEPPER` und Admin-Passwort auf Prod setzen.
  - Den auf der Vorschau getesteten Stand nach Prod übernehmen (`manage.ps1` → [12]), nur mit Freigabe.
  - Rauchtest.
- **Danach:**
  - Karten drucken (Phase 5): Kunden-Karten, Partner-Karten, Partner-Stapel.
  - Vorschau als Präsentations-Instanz behalten.

---

## Phase 4 — Import, Crawler und Website-Prüfung

### Quellen (`server/crawler/sources/*.js`)

- Jede Quelle ist ein Adapter, der eine Liste von Orten liefert.
- `osm.js` importiert regionenweise über Overpass, zum Beispiel ein ganzes Bundesland.
- Für die **2 konkreten Beispiel-URLs** des Nutzers gibt es Platzhalter-Adapter. Vor dem Bau werden jeweils
  robots.txt und AGB geprüft sowie das Datenbankherstellerrecht (§87b UrhG). Wenn möglich fragen wir zuerst beim
  Betreiber nach einem Export oder einer Erlaubnis.
- Abgedeckte Arten: Tierheim-Verzeichnis, Vermittlungstiere (**nur verlinken**, keine Fotos oder Texte
  übernehmen), Hundeschulen, Futter-Empfehlungen.
- Vermittlungstiere von **Partner**-Tierheimen kommen direkt aus deren Chroniken (Phase T). Der Crawler ergänzt nur
  Tierheime, die noch keine Partner sind, und verlinkt dort bloß.

### Tabellen

```
import_candidates(id, source, external_id, typ, name, plz, lat, lon, website, raw_json,
                  status CHECK IN ('neu','geprüft','übernommen','verworfen'), created_at,
                  UNIQUE (source, external_id))
site_checks(id, candidate_id, checked_at,
            verdict CHECK IN ('tierheim','hundeschule','zuechter_verdacht','unklar','nicht_erreichbar'),
            evidence_json, spenden_url, vermittlung_url, kontakt_json)
```

### Website-Prüfung (`server/crawler/siteCheck.js`)

Das ist das „Checken ihrer Seiten".

- **Warteschlange:** OSM-Orte mit Webseite, aus Importen und aus Live-Suchen.
- **Läuft nie in einer Nutzeranfrage.** Gestartet wird sie per `npm run sitecheck` oder als Worker im Prozess,
  und nur wenn `SITECHECK_ENABLED` gesetzt ist.
- **Höflich:**
  - robots.txt wird beachtet (Cache pro Host), eigener User-Agent
  - höchstens 2 Anfragen gleichzeitig, mindestens 3 s Abstand pro Host
  - höchstens 5 Seiten pro Website: Startseite sowie Seiten zu Spenden, Vermittlung, Tieren, Kontakt und Impressum
- **Einstufung:** Stichwort-Punkte plus schema.org-Daten. **Jedes Züchter-Signal sticht alles andere.**
- **Extrahiert** werden Spendenlink, Vermittlungsseite und Kontakt.
- **Gespeichert** werden nur Fakten, Links und kurze Belegstellen (höchstens 200 Zeichen). Keine Fotos, keine
  übernommenen Texte.

### Sichtbarkeit

- `zuechter_verdacht` blendet den Eintrag sofort überall aus.
- „Neuer Begleiter gesucht?" zeigt nur Partner und Einträge, die der Admin übernommen hat.
- Die allgemeine Umkreisliste darf OSM-Treffer mit dem Hinweis „ungeprüft" zeigen.

### Admin-Prüfliste

- Pro Eintrag: **Übernehmen** (wird als Verzeichniseintrag zu `partners`), **Verwerfen** oder **Erneut prüfen**.
- Google-Treffer kommen nie in diese Kette.

### Tests

Anbieter und Website-Prüfung bekommen ein injiziertes `fetch`. Tests gehen also nie ins Netz.

---

## Phase 5 — Admin und Präsentation

- **Reiter im `AdminPage`:** Übersicht, Gutscheine, Partner, Anzeigen, Prüfliste, Spenden, Präsentation. Die
  Routen liegen in der neuen Datei `server/routes/adminMarketing.js`.
- **Partner verwalten** (anlegen, bearbeiten, löschen), inklusive Logo-Upload. Die Multer-Konfiguration und die
  MIME-Whitelist kommen aus `server/routes/uploads.js`.
- **Gutschein-Stapel:**
  - anlegen, pro Partner oder frei
  - als CSV exportieren
  - widerrufen
- **Druckseite** `/admin/gutscheine/:id/druck`:
  - Karten im Visitenkartenformat 85×55 mm, mit Druck-CSS
  - QR-Code als Inline-SVG über eine kleine Bibliothek ohne weitere Abhängigkeiten (z. B. `qrcode-generator`)
  - Ziel des QR-Codes ist `https://<domain>/v#CODE`, deshalb **muss die Domain vor dem Druck feststehen**
- **Statistik:**
  - Einlösungen pro Partner und Stapel, samt Mundpropaganda-Ketten (Rudel → Gutschein → neues Rudel)
  - Klicks pro Anzeige und Tag
  - gefundene gegenüber übernommenen Einträgen
- **Präsentationsmodus:**
  - Vorschau jedes Partnerportals, auch von Entwürfen
  - „Demo als Partner X", auch „als Tierheim X" mit Chroniken, Steckbriefen und Übergabe (Phase T)
  - Vollbild ohne Admin-Bedienelemente, zum Vorführen bei Tierheimen und Hundeschulen
- **Rudel-Liste:** zeigt die Herkunft (Partner bzw. Gutschein-Kette) statt des alten Freitexts `quelle`.
- **Karten (Zusatz 29.09.):**
  - drei Kartenmotive: Kunden-Karte („Deine Chronik“), Partner-Karte („Euer kostenloses Partnerprofil“) und
    Partner-Stapel-Karte (mit Partner-Logo);
  - Partner sehen ihren Kunden-Gutschein-Stapel im Partner-Bereich (offen/eingelöst) und können ihn nachdrucken;
  - Infoseite `/partner-werden` für Partner-Karten und Gespräche.
- **Druck erst nach Phase G:** Die Druckseite ist vorher fertig, aber gedruckt wird erst mit der Domain.
- **Admin-Ansicht (Zusatz 29.09.):** Der Haupt-Admin kann jederzeit jeden Bereich öffnen – Zuhause, Familie,
  Tierheim, Partner – als **Nur-Lesen-Ansicht** mit sichtbarem Band „Admin-Ansicht“. Jeder Aufruf wird
  protokolliert (Bereich, Zeitpunkt; keine Inhalte). Schreibende Aktionen sind in dieser Ansicht gesperrt.
- **Eingelöste Gutscheine** stehen in der Stapel-Liste mit Status, Einlösedatum und dem entstandenen Bereich.

---

## Ausblick: alle Tiere

Ziel ist, die App **irgendwann für alle Tiere** anzubieten, nicht nur für Hunde. Das ist keine eigene Phase jetzt.
Es ist eine Leitlinie: Alles aus den Phasen 1–5 und T wird so gebaut, dass der spätere Schritt nur noch Tierarten,
Texte und Branding betrifft, aber keinen Umbau.

**Schon vorhanden:**
- `dogs.tierart` mit `hund`, `katze` und `anderes` (die genaue Art steht als Freitext in `rasse`, zum Beispiel
  „Kaninchen").
- Passende Beschriftungen je Tierart (Rüde/Hündin, Kater/Katze, männlich/weiblich) in
  `client/src/lib/timeline.js`.
- Eltern müssen dieselbe Tierart haben (`server/routes/dogs.js`).

**Leitlinien ab sofort:**
- **Tierneutral bauen:**
  - Texte sprechen von „Tier" bzw. nutzen die vorhandenen Helfer `speciesNoun`, `sexLabel` und `animalKind`.
  - Steckbriefe, Übergabe, „Neuer Begleiter gesucht?" und Partnerportale funktionieren für jede Tierart.
  - Filter nach Tierart kommen gleich mit.
- **Tierheime (Phase T)** dürfen von Anfang an alle Tierarten pflegen, die die App kennt, weil Tierheime immer
  auch Katzen und Kleintiere vermitteln.
- **Hundespezifisch bleibt vorerst nur „Hundeschule gesucht?".** Die Tabelle `partners` ist aber schon so angelegt,
  dass später weitere Trainings-Partner dazukommen können (zum Beispiel Katzen-Verhaltensberatung,
  Reitschule/Pferdetraining). Futter-Empfehlungen bekommen ein Feld `tierart`.
- **Umkreissuche:** `amenity=animal_shelter` deckt in OSM schon alle Tierarten ab. Für Training gibt es
  `animal_training=<Tierart>`.

**Später, beim eigentlichen Schritt „alle Tiere":**
- **Tierarten erweitern:** Kleintiere, Vögel, Pferde, Reptilien usw. Dazu passende Geschlechtsbezeichnungen, und
  „Würfe" allgemein als Nachwuchs.
- **Branding:** Heute ist die App auf Berner Sennenhunde zugeschnitten:
  - Logo `BernerMark` in 5 Komponenten
  - Meta-Beschreibung in `client/index.html` („…eures Berner-Sennenhund-Rudels…")
  - Login-Texte („Klickt einen Hund an")
  - der Begriff **„Rudel"** in rund 20 Client-Dateien

  **Der Name steht: „Familie auf Pfoten".** Alles Berner-Spezifische wandert in ein eigenes **Berner-Theme**,
  siehe den nächsten Abschnitt.
- **Domain:** Sie sollte **von Anfang an tierneutral** gewählt werden, also nicht „berner…", weil die QR-Codes auf
  gedruckten Karten sie dauerhaft enthalten. Kandidat ist `familieaufpfoten.de`. Den Berner-Auftritt gibt es
  weiter, als Theme.

---

## Design: Name, Farbschema, Themes

**Name:** „Familie auf Pfoten". **Slogan:** „Eine tierisch nette Familie".

**Farbschema:** Das heutige Farbschema bleibt **genau so** der Standard. `client/src/styles/tokens.css` wird nicht
angefasst. Themes legen sich nur darüber und ändern nie den Standard.

### Themes

| | Standard | Berner |
|---|---|---|
| Farben | wie heute | wie heute |
| Logo | neutrales Pfoten-Logo (`PawMark`, neu) | `BernerMark` (wie heute) |
| Deko | ohne Dreifarb-Streifen | Dreifarb-Streifen (`tricolor`) |
| Texte | tierneutral, z. B. „Klickt ein Tier an", mit Name und Slogan | die heutigen Berner-Texte, z. B. „Klickt einen Hund an" |
| Gruppe heißt | Vorschlag: „Familie" | „Rudel" |
| Wer bekommt es | **neue Rudel** | **alle bestehenden Rudel und die Demo „Rudel vom Sonnenhang"**, automatisch bei der Migration, damit sich für heutige Nutzer nichts ändert |

- **Wahl:** Jedes Rudel wählt sein Theme in den **Rudel-Einstellungen**, mit Vorschau. Vor dem Login gilt
  „Standard", auf einem Partner-Portal das Partner-Theme.
- **Partner-Portale:** Die Partnerfarbe (`partners.farbe`) und das Logo überschreiben auf `/p/:slug` **nur die
  Akzent-Tokens** `--rust`, `--rust-deep`, `--rust-wash` und `--on-rust`. Der Server prüft das Hex-Format und den
  Kontrast nach WCAG AA (mindestens 4,5:1). Fällt die Prüfung durch, gilt der Standard. Die Grundfarben bleiben
  immer gleich.
- **Später:** weitere Themes (zum Beispiel Katze), ein Dunkelmodus über denselben Mechanismus, ein Wortschatz je
  Tierart.

### Namens-Alternative: Fellnasen-Familie

- **Dafür:** Das Wort ist herzlich, jeder versteht es sofort, und in Tierheim-Kreisen ist es üblich.
- **Dagegen:**
  - Es ist schon vielfach vergeben: Instagram @fellnasenfamilie und @fellnasen.familie, die Facebook-Seite
    „Fellnasen sind Familie" sowie Vereinsnamen wie „Fellnasen Stuttgart e.V." und „Ein Herz für Fellnasen in Not
    e.V.". Wer von der App hört und danach sucht, landet leicht woanders.
  - „Fellnase" ist ein beschreibendes Allerweltswort und deshalb als Marke kaum schützbar.
  - Es gibt mehrere Schreibweisen: „Fellnasen Familie", „Fellnasen-Familie", „Fellnasenfamilie".
  - Tiere ohne Fell sind ausgeschlossen. Das gilt bei „Pfoten" allerdings ähnlich.
- **Deshalb bleibt „Familie auf Pfoten" der Name.** Bei Bedarf wird `fellnasenfamilie.de` zusätzlich gesichert und
  auf `familieaufpfoten.de` weitergeleitet.

### Tonalität: „Fellnasen" im Text

Das gilt für das Standard-Theme. Das Berner-Theme behält seine heutigen Texte.

- **„Fellnasen suchen ein Zuhause"**: Überschrift für die Tiere in Vermittlung bzw. die Steckbriefe unter „Neuer
  Begleiter gesucht?" (Phase T und Phase 3).
- **„Wie geht's den anderen Fellnasen?"**: Hero-Text auf der Login- bzw. Startseite, angelehnt an das heutige
  „Wie geht's den anderen?".
- Der Slogan **„Eine tierisch nette Familie"** bleibt.
- Tiere ohne Fell (Vögel, Reptilien, Fische) werden je nach Tierart neutral angesprochen. Dafür gibt es schon die
  Helfer `speciesNoun` und `animalKind` in `client/src/lib/timeline.js`.

### Technik

- `client/src/themes/` enthält `index.js`, `standard.js` und `berner.js`. Jedes Theme beschreibt:
  - `id` und Anzeigename
  - die Logo-Komponente
  - Texte und Wortschatz (etwa „Rudel" oder „Familie", Hero-Texte auf der Login-Seite)
  - Deko-Schalter (Dreifarb-Streifen)
  - optionale Token-Overrides
- Ein `ThemeProvider` (React-Context) setzt `<html data-theme="…">`.
- Overrides liegen in `client/src/styles/themes/*.css` unter `[data-theme="…"]`. `tokens.css` bleibt der
  unveränderte Standard in `:root`.
- `<ThemeMark>` ersetzt die 5 direkten `BernerMark`-Aufrufe (`App.jsx`, `LoginPage.jsx`, `OverviewPage.jsx`,
  `AdminPage.jsx`, `components/collage/CollagePageView.jsx`).
- Der Dreifarb-Streifen (`App.jsx`, `LoginPage.jsx`, `layout.css`, `login.css`, `collage.css`) erscheint nur, wenn
  das Theme ihn vorsieht.
- Server:
  - Neue Spalte `families.theme` per `addColumnIfMissing`. Bestehende Zeilen bekommen `berner`, neue Rudel
    `standard`.
  - `PUT /api/family` nimmt zusätzlich `theme` an und prüft es gegen die Liste der erlaubten Themes.
  - `GET /api/me` liefert das Theme mit.
- `client/index.html` bekommt einen neutralen Titel und eine neutrale Meta-Beschreibung („Familie auf Pfoten – eine
  tierisch nette Familie").

### Einordnung

- Die **Theme-Grundlage** (Provider, `data-theme`, Akzent-Overrides) kommt mit **Phase 2**, weil die
  Partner-Portale sie brauchen.
- **Berner-Theme herauslösen und umbenennen** in „Familie auf Pfoten" geschieht **vor dem Kartendruck
  (Phase 5)** und vor dem Start unter der neuen Domain. Name und Domain stehen auf den gedruckten Karten.

---

## Querschnitt

### Recht

- **Neue öffentliche Seiten:** `/impressum` (DDG §5) und `/datenschutz`.
- **Datenschutzerklärung** deckt ab:
  - E-Mail und PLZ
  - Standortabfrage: vom Browser erfragt, gerundet, nicht gespeichert
  - Serverabfragen bei OSM: Dort sehen sie unsere Server-IP und die gerundeten Koordinaten, nicht die IP des Nutzers
  - Klickzählung
  - GoFundMe als externe Seite
- **Quellenangaben** im Footer und an den Ergebnislisten: „© OpenStreetMap-Mitwirkende (ODbL)", GeoNames (CC BY).
  Falls Google später dazukommt, auch das Google-Logo.

### Sicherheit

- Codes werden nur gehasht gespeichert, bis zum Einlösen zusätzlich verschlüsselt.
- In URLs stehen Codes nur hinter `#`.
- Weitere Maßnahmen:
  - Rate-Limits
  - SSRF-Schutz bei ausgehenden Anfragen
  - keine offenen Weiterleitungen
  - Sessions lassen sich zentral beenden
  - `.env` gehört ins Backup

### Doku

- README: Gutscheine statt Einladungscode, Testumgebung, Staging und Übernahme nach Prod. Aus „keine externen
  Dienste" wird eine Liste der optionalen externen Dienste.
- `.env.example` bekommt `CODE_PEPPER`, `APP_ENV`, `RUDEL_VOUCHER_QUOTA`, `PLACES_PROVIDERS`,
  `GOOGLE_PLACES_API_KEY`, `SITECHECK_ENABLED` und die Budget-Grenzen.

### Reihenfolge

Die Phasen bauen aufeinander auf: 0 → 1 → 2 → **T** → 3, danach 4 und 5 parallel. Phase 0 kommt zuerst, damit ab
Phase 1 alles lokal durchklickbar ist und nichts ungetestet nach Prod geht. Phase T braucht Gutscheine und Benutzer
(Phase 1) sowie Partner (Phase 2). Sie kommt vor „Entdecken", weil sie das stärkste Argument im Gespräch mit
Tierheimen ist und „Neuer Begleiter gesucht?" mit echten Tieren füllt.

Die **Theme-Grundlage** kommt mit Phase 2. **Umbenennung in „Familie auf Pfoten" und Berner-Theme** kommen vor
Phase 5 (Kartendruck) und vor dem Start in Prod unter der neuen Domain.

**Aktualisiert 29.09.:** Für die Vorschau gilt **0 → D → Z → 1 → 2 → T → 3 → P1 → P2 → R → 5 → G**, Phase 4
danach. P1 und P2 bilden das Partner-Produkt, R die Familien-Verwaltung. G (Domain und Go-Live) steht am Ende,
danach werden Karten gedruckt.

**Aktualisiert 28.09.:** Für die Vorschau gilt **0 → D → Z → 1 → 2 → T → 3 → 5**, Phase 4 danach.
- Design und Themes (D) kommen nach vorn, weil der neue Auftritt das Erste ist, was man in der Vorschau sieht.
- **Phase Z** (Meine Chronik, Zuhause, Teilen) kommt vor die Gutscheine. Das Einlösen soll direkt „Meine Chronik"
  anlegen, und Phase T baut auf `dog_shares` und `dog_transfers` auf.

---

## Offene Fragen

1. **Crawler-Beispiele:** Welche 2 konkreten URLs? Was sagen deren Nutzungsbedingungen bzw. robots.txt?
2. **Domain:** Kandidat ist `familieaufpfoten.de`, dazu `familie-auf-pfoten.de` als Weiterleitung. Ist sie noch
   frei? Sie muss vor dem Kartendruck gekauft sein, weil die QR-Codes sie enthalten. Ist
   `staging.familieaufpfoten.de` mit Basic-Auth recht? Optional kommen `fellnasenfamilie.de` bzw.
   `fellnasen-familie.de` als Schutz- und Weiterleitungsdomains dazu. Stand 27.09.2026 haben `familieaufpfoten.de`
   und `fellnasenfamilie.de` keinen DNS-Eintrag. Das spricht dafür, dass sie frei sind, ist aber kein Beweis. Die
   verbindliche Prüfung läuft über die DENIC-Domainabfrage.
3. **Länder:** Nur Deutschland, oder auch Schweiz und Österreich? Deren 4-stellige PLZ überschneiden sich, dann
   braucht es ein Länderfeld.
4. **Kontingente:** Wie viele Gutscheine pro Rudel? Wann wird aufgefüllt? Laufen Partner-Stapel ab?
5. **Ausgeber kennt den Code:** Das Tierheim, das eine Karte übergibt, kennt deren Code. Reicht der Hinweis
   „Schlüssel erneuern" nach dem Einlösen, oder braucht die Karte eine getrennte PUK, etwa zum Freirubbeln?
6. **Wiederherstellung per E-Mail** braucht einen Mail-Dienst (SMTP), also einen externen Dienst. Erst mal nur
   die PUK?
7. ~~**Anzeigen-Pflege:**~~ **Entschieden (29.09.):** Partner pflegen ihre Beiträge selbst im Partner-Bereich, der Admin gibt sie frei (siehe Phase P).
8. **Preismodell für Anzeigen:** Kostenlos für Partner, gegen Spende, oder bezahlt? Davon hängt ab, ob etwas als
   „Anzeige" oder „Empfehlung" gekennzeichnet wird.
9. **GoFundMe:** Ist die Weitergabe an Tierheime steuerlich und nach den AGB geprüft? Wie oft werden die
   Transparenzzahlen veröffentlicht?
10. **Altbestand:** Sollen alte Rudel bis zu einem Stichtag auf einen Rudel-Schlüssel umstellen?
11. **Karte:** Bleibt es bei der Liste mit Maps-Links, oder soll später eine eingebettete Karte (Leaflet mit
    OSM-Kacheln) dazukommen?
12. **Tierheim – „Änderungen sammeln":** Gemeint sind (a) Einträge von Mitarbeitenden und Ehrenamtlichen, solange
    das Tier im Tierheim ist, (b) Neuigkeiten der neuen Halter nach der Vermittlung, oder beides? Das Konzept sieht
    beides vor.
13. **Tierheim – Chronik beim Umzug:** Zieht die ganze Chronik mit ins neue Zuhause (Vorschlag), oder behält das
    Tierheim eine eigene Kopie?
14. **Tierheim – Steckbriefe:** Sollen Steckbriefe von Suchmaschinen gefunden werden dürfen (mehr Reichweite),
    oder nur per Link erreichbar sein (Vorschlag als Standard)?
15. ~~**Tierheim – andere Tiere:**~~ **Entschieden:** langfristig alle Tiere. Tierheime pflegen von Anfang an
    alle Tierarten, die die App kennt (siehe „Ausblick: alle Tiere").
16. ~~**Name und Branding für „alle Tiere":**~~ **Entschieden:** Der Name ist „Familie auf Pfoten", der Slogan
    „Eine tierisch nette Familie". Das Standard-Farbschema bleibt, Berner wird ein Theme, jedes Rudel wählt selbst,
    Partner-Portale bekommen eigene Akzentfarben (siehe „Design: Name, Farbschema, Themes").
17. **Wortschatz im Standard-Theme:** Heißt die Gruppe dort „Familie" (Vorschlag, passt zum Namen) statt „Rudel"?
18. **Markenrecherche:** Vor dem Domainkauf „Familie auf Pfoten" beim DPMA bzw. EUIPO prüfen. Es gibt die bekannte
    Tierschutzmarke VIER PFOTEN und eine Facebook-Seite „Familie mit vier Pfoten". Die Namen sind verschieden, aber
    eine kurze Prüfung schadet nicht. „Eine tierisch nette Familie" ist ein Buchtitel, als Slogan ist das
    unkritisch. „Fellnasen" ist ein beschreibendes Wort und als Marke kaum schützbar. Das ist ein Grund mehr, es
    nur im Text zu verwenden.
19. **Eigene Farben:** Sollen Rudel später einzelne Farben selbst anpassen dürfen, oder nur fertige Themes wählen
    (Vorschlag, damit Kontrast und Lesbarkeit gesichert bleiben)?
20. **Begriffe in Phase Z:** Passen „Meine Chronik", „Wegbegleiter" und „lebt mit"? Alternativen wären „Mein
    Zuhause", „Familienmitglieder" und „gehört zur Familie".
21. **Wer pflegt geteilte Tiere?** Vorschlag: nur der eigene Haushalt, die Familie liest und kommentiert. Heutige
    Rudel-Tiere darf wie bisher das ganze Rudel pflegen.
22. **Abschied:** Wie sollen verstorbene Tiere erscheinen? Vorschlag: „In Erinnerung" mit dezenter Kennzeichnung
    und einem optionalen eigenen Abschiedstext.
23. **Standard-Ansicht nach dem Login:** „Meine Chronik" oder die zuletzt benutzte Familie? Vorschlag: die zuletzt
    benutzte.
24. **Partner veröffentlichen selbst:** Vorschlag: Ja, ohne Freigabe durch den Admin, weil Partner-Zugänge
    persönlich verteilt werden. Der Admin kann jederzeit sperren. Oder soll der Admin jedes neue Profil freigeben?
25. **Rollen-Namen:** Passen „Rudelführer“ bzw. „Familienleitung“, „Stellvertretung“, „Mitglied“ und „Gast“?
26. **„Pausiert“ bei Tierheim-Tieren:** Vorschlag: Der Steckbrief bleibt mit dem Hinweis „gerade nicht
    vermittelbar“ sichtbar. Oder soll er ausgeblendet werden?
27. **Preis für Partner-Profile:** kostenlos (Vorschlag für den Start), später gegen Spende oder Beitrag?
