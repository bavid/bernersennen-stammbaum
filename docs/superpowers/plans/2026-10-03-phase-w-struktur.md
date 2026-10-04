# Phase W – Neue Struktur: Start · Tiere · Familien · Entdecken (Plan, 03.10.)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Maßstab: „Susi“, ~40,
> nutzt Facebook – wenig auf einmal, vertraute Muster, eine Stelle je Funktion, Reiter statt langer Seiten.

**Anlass (Betreiber, 03.10.):** „We need a useful structure and not this overload.“ Heute wechselt das Menü je
Bereich (Zuhause 5, Familie 4, Berner-Familie 5, Besuch 2 Einträge), Bereichswechsel ist Handarbeit (Dropdown,
Linkzeile, Besuchsband, „In Meiner Chronik bearbeiten“), und die Familienbande-Seite macht drei Jobs auf einmal
(Neuigkeiten, Tier-Raster, Familien-Verwaltung). Die Startseite des Zuhauses (Wegbegleiter) zeigt keine Neuigkeiten.

## Zielbild

- **Vier feste Menüpunkte in jedem Kontext:** **Start** (Feed: alles Neue, „Für dich“, Termine) · **Tiere**
  (Raster, Reiter Zeitleiste/Stammbaum, Berner zusätzlich Würfe) · **Familien** (meine Familien als Gruppenseiten,
  befreundete Zuhause) · **Entdecken** (inkl. Reiter „Karte“ statt `/umgebung`).
- **Avatar-/„Menü“:** Einstellungen · Einladen · Fotocollage · Hilfe & Kontakt · Abmelden · Impressum/Datenschutz.
  Mobil: Start · Tiere · Familien · Entdecken · Menü.
- **Familie als Gruppenseite** `/familien/:id` mit Reitern **Beiträge · Tiere · Pinnwand · Mitglieder**,
  ⚙ „Familie verwalten“ → Einstellungen › Familien. Besuch: `/familien/:id` nur lesen (Beiträge · Tiere · Zeitleiste).
- **Tierprofil** `/tier/:id` mit kompaktem Kopf und Reitern **Chronik · Infos · Verwandte** (Berner: Stammbaum).
- **Kein manueller Bereichswechsel im Alltag:** `AreaGate` schaltet beim Navigieren automatisch per `/api/view`;
  Schutz gegen zwei Tabs per Header `X-Bereich` (409 bei Abweichung, nie Rechte-Erweiterung).
- **Eine Stelle je Funktion** (Tier anlegen nur unter Tiere, Einladen nur im Menü bzw. Familie › Mitglieder,
  Familienverwaltung nur in Einstellungen; Dropdown, AreaLinks-Zeile und Familien-Modal entfallen).

## Wörter (Auszug)

Wegbegleiter → Reiter „Zeitleiste“ · Familienbande → **Tiere** (Berner: Hunde) · Meine Chronik/Mein Zuhause →
überall **„Mein Zuhause“** · Mitglieder & Rollen → Reiter „Mitglieder“ · Familie einstellen → „Familie verwalten“ ·
Schreib dem Admin → „Hilfe & Kontakt“ · In Familien zeigen → „Wer sieht {Name}?“ · Erlebt mit → „Mit dabei“ ·
Collage → „Fotocollage“ · Eintrag → **„Erinnerung“**, Kommentare → **„Grüße“** (Entscheidung D5, 04.10.).

## Phasen

1. **Ruhige Hülle (Client + X-Bereich-Schutz), M–L:** neue Menü-Sets (`lib/navItems.js`), `AccountMenu` statt
   Dropdown/Kontakt/Logout im Kopf, `AreaGate`, Routen `/start`, `/tiere`, `/familien`, `/familien/:id`,
   `LegacyRedirect` für alte Adressen (`/wegbegleiter`, `/stammbaum`, `/familienbande`, `/pinnwand`, `/mitglieder`)
   mit Erhalt von Query/Hash/State, `StartPage` v1 (Für dich, Jahrestag, Composer, Neuigkeiten des Zuhauses,
   Familien-Karte), `AnimalsPage` (Reiter Alle/Zeitleiste/Stammbaum), `FamiliesPage`, `GroupPage` v1, gemeinsames
   `AnimalCreateModal`. Tierheim/Partner unverändert. Tests inkl. Redirect-Tabelle und Tastatur im Menü.
2. **Seiten mit Reitern, M:** Tierprofil-Reiter, Mitglieder verdichtet, Familienverwaltung nach Einstellungen
   (Modal entfällt), Einladen getrennt („Zu Besuch einladen“ / „Zuhause verschenken“), Entdecken › Karte,
   Wörter-Durchgang beider Auftritte, Besuchsband → Chip.
3. **Ein Start für alles (Server + Client), L, Sicherheits-Review Pflicht:** `server/lib/identityAreas.js`,
   `GET /api/start` (Feed über Zuhause, Familien und Besuche; private Einträge nur aus dem eigenen Zuhause,
   Kommentare je Bereich gezählt, Demo-Trennung, kein Bereichs-Parameter), Foto-Freigabe in `uploadAccess`
   für Haushalts-Sitzungen (nur Tier- und Beitragsfotos der sichtbaren Bereiche), Server-Tests (9 Fälle).
4. **Alle Tiere an einem Ort, M:** `GET /api/tiere` (gleiche Bereiche/Schutz), Filter „Alle · Mein Zuhause ·
   Familie …“, Familie › Tiere vorgefiltert.
5. **Aufräumen, S–M:** alte Komponenten löschen (ContextSwitcher, CompanionsPage, AreaLinks, TreeToggle,
   OverviewPage-Reste, NearbyPage als eigene Seite), Redirects ≥ 6 Monate behalten, Playwright-„Susi“-Ablauf.
   *Stand 04.10.:* entfernt sind ContextSwitcher, HomeSwitchNotice, AreaLinks (samt Freundes-Zeile, `useFriendHomes`,
   `familyStat`), die Zweige für Zuhause/Familie/Besuch in OverviewPage (nur noch Tierheim) und das Anlegen in DogForm (nur
   noch Bearbeiten). TreeToggle (Stammbaum des Tierheims) und NearbyPage (`/umgebung` für Tierheime und Partner) werden
   noch gebraucht; Redirects bleiben.

## Entscheidungen (Vorschlag, Betreiber kann umsteuern)

- **D1** Auftritt folgt dem eigenen Zuhause (nicht der aktiven Familie).
- **D2** Pinnwand des Zuhauses ohne Menüpunkt; Notizen/Termine erscheinen auf Start, Pinnwand bleibt in Familien.
- **D3** Besuche als „Befreundete Zuhause“ unter Familien.
- **D4** Beiträge besuchter Zuhause erscheinen im Start-Feed.
- **D5** ~~Nomen „Beitrag“~~ → entschieden 04.10.: **„Erinnerung“** (Erinnerungen, „Erinnerung festhalten“) und **„Grüße“** statt Kommentare – passend zum Familienalbum.

## Look: „B+ Familienalbum“ (entschieden 04.10.)

Kein weiteres Hunde-Netzwerk, sondern das **Familienalbum eurer Tiere** (Abgrenzung zu Community-Apps: privat,
ein Leben lang, Geschichte zieht vom Tierheim mit, Familie über Haushalte, alle Tierarten, zum Anfassen).
- Papierton, Terrakotta + Salbei + Rosé, Fraunces (Überschriften) + Figtree (Text), **Caveat** nur für kleine
  Momente („Schön, dass ihr da seid“, Kapitel „Herbst 2026“, Bildunterschriften).
- Fotos mit weißem Rand (Polaroid), sanft gedreht; Kapitel nach Jahreszeiten; „Heute vor einem Jahr“ als Karte.
- Tiere als Kreise mit Namen; verstorbene Tiere sanft grau, „In Erinnerung“.
- **Herzen mit Namen statt Zahlen** („Mira und Familie Sonnenhang freuen sich · 3 Grüße“), keine Like-Zähler.
- Entwurf: Leinwand „Familie auf Pfoten – Struktur-Mocks“, Artboards „B+ Familienalbum“ und „Mehrwert“.
- Neues Feature dazu: **Digitaler Bilderrahmen** (Diashow, Rahmen-Link für ein anderes Gerät ohne Anmeldung).

### Umgesetzt (04.10.)

- **Farbwelt „Familienalbum“** als Vorgabe (`styles/palettes.css`): Papier `#fbf5ec`, Karte `#ffffff`, Schrift `#2e241d`,
  leise `#6b5d52`, Terrakotta `#a64b2a` (Hover `#83391e`), Salbei `#7c8f6a` (nur Schmuck; Text in Salbei `#56684a`),
  Rosé `#f3d9cc`, Linien `#ebdccb`; dunkel ein tiefes Braun (`#1e1712`, Karten `#2a211b`), kein Schwarz. Die alte Palette
  „terrakotta“ führt zum Familienalbum (Server, Client, `darstellung-init.js`). Alle Farbwelten AA (`palettes.test.js`, dazu
  Rosé, Kopf der Anmeldung, „Weiß“). Warme, weiche Schatten statt Linien; Karten 18 px; Anmeldung, Partner-Portal-Kopf und
  Unterstützen-Kasten auf Rosé-Papier statt dunkler Fläche (Partner behalten ihre Akzentfarbe im Portal).
- **Schriften selbst gehostet** (`styles/fonts.css`, npm `@fontsource*`, SIL OFL 1.1, Hinweise in
  `client/public/schriften/LIZENZEN.txt` und README): Fraunces (Überschriften), Figtree (Text, als einzige vorgeladen),
  Caveat 600 (Handschrift), Atkinson Hyperlegible („Gut lesbar“) – nur latin/latin-ext, woff2, `font-display: swap`.
- **Bausteine** (`styles/album.css`): `.hand` (Caveat), **Polaroid** (`components/Polaroid.jsx`; Fotos im Feed, in der
  Chronik und bei „Heute vor einem Jahr“ – weißer Rand, sanfter Schatten, abwechselnd schräg, mit „Bewegung reduzieren“
  gerade), **Kapitel nach Jahreszeiten** (`lib/seasons.js`: „Herbst 2026“, „Winter 2026/27“ – Chronik und Start),
  **„Eure Tiere“ als Kreise** auf Start (`components/start/AnimalCircles.jsx`; verstorbene grau, „In Erinnerung“, „Neu“
  öffnet „Neues Tier anlegen“), **„Heute vor einem Jahr“** (`components/start/OnThisDayCard.jsx`,
  `GET /api/timeline/jahrestag?tag=JJJJ-MM-TT` – gleiche Sichtregeln wie `/recent`, höchstens 3, mit Foto zuerst; ohne
  Treffer keine Karte), Begrüßung „Schön, dass ihr da seid“ über dem Namen, Porträt im Tierprofil als Kreis mit Ring.
  „Erinnerung festhalten“ auf Start ist zuerst ein Knopf (die Tiere stehen schon als Kreise darüber).
- **Grüße mit Herz:** Es gibt keine Reaktionen/Likes – das Herz steht vor „3 Grüße“ (Kommentare), Namen gibt es dafür nicht
  (kein neues Backend). Feed-Zeile „erzählt von … · vor 6 Tagen“, das Kapitel nennt die Jahreszeit der Erinnerung.
- **Demo:** eine Erinnerung „Ein Nachmittag am See“ genau ein Jahr vor dem Anlegen der Demo (`seed/demo-household.js`
  `yearsAgo`) – „Heute vor einem Jahr“ erscheint am Tag des Auffrischens.
- **Ein Auftritt für alle:** `themes/berner.js`, das Berner-Wappen, `favicon-berner.svg` und die Auftritt-Wahl sind
  entfernt; Wörter überall Standard (Tiere, Familie, Familienbande, Nachwuchs, Verpaarung). `PUT /api/family` nimmt ein
  `theme` an und ignoriert es, die Spalte `families.theme` bleibt.
  **Achtung Produktion:** Das bestehende Rudel mit Berner-Auftritt („Rudel“, „Hunde“, „Würfe“, „Deckakt“, Dreifarb-Streifen,
  Wappen) sieht beim nächsten Hochstufen nach Produktion den gemeinsamen Auftritt – vorher Bescheid geben.
- **Mini-Designer** (Einstellungen › Darstellung, ersetzt die Paletten-Kacheln): Vorschau-Karte (Polaroid, Kapitel, Knopf,
  Grüße) und Farbwelt (Familienalbum, Waldspaziergang, Strandtag, Lavendelfeld, Regentag), **eigene Akzentfarbe**
  (Farbfeld + 6 Vorschläge; `lib/akzent.js` rechnet je Modus eine lesbare Fassung gegen alle Flächen und den Knopf, sonst
  „Angepasst für gute Lesbarkeit“), Hintergrund (Papier · Weiß · Dunkel · Automatisch), Schrift (Klassisch · Modern ·
  Gut lesbar), Handschrift-Akzente an/aus, Ecken weich/eckig, Schriftgröße, „Zurücksetzen“. Gespeichert über
  `/api/me/darstellung` (`akzent` #rrggbb oder leer, `schriftart`, `handschrift`, `ecken`, `modus` mit `weiss`; Spalten
  legt `server/lib/darstellung.js` selbst an), gemerkt samt gerechneter Farben für `darstellung-init.js` (kein Aufblitzen),
  Demo nur lokal. Das Farbfeld speichert erst, wenn es 0,5 s ruht.
- **Bilderrahmen:** aus einer Familie heraus (Gruppenseite „Bilderrahmen“ → `/bilderrahmen?in=<Id>`, eigene gemerkte
  Auswahl je Familie, ohne private Erinnerungen); Rahmen-Links in den Einstellungen lassen sich „Ändern“ (Name, Tiere,
  Zeitraum, Anzeige – der Link bleibt derselbe).
- **Seitenhöhen** (Demo „Zuhause am Deich“, Bildschirme = Seitenhöhe / Fensterhöhe, vorher → nachher; „nachher“ mit
  frisch aufgefrischter Demo - mit Fotos im Feed, „Heute vor einem Jahr“ und zwei offenen „Für dich“-Anfragen, die am Handy
  allein etwa 0,8 Bildschirme belegen und vorher erledigt waren):

  | Seite | 1440×900 | 375×812 |
  | --- | --- | --- |
  | Start (5 Erinnerungen statt 6) | 1,49 → 2,49 | 2,45 → 3,57 (ohne „Für dich“ ≈ 2,8) |
  | Tierprofil · Chronik | 1,80 → 2,47 | 2,38 → 3,22 |
  | Familie · Erinnerungen | 1,23 → 1,23 | 3,03 → 3,06 |
  | Einstellungen · Darstellung | 1,23 → 1,58 | 1,60 → 2,04 |
- **Review B+ (04.10.):** Fokus deckend in der Akzentfarbe (WCAG 1.4.11, `--focus-color`, Umriss statt Hauch), eigene
  Akzentfarbe auch auf ihrem Hauch lesbar, Start nach dem Tag der Erinnerung sortiert (die Zeile nennt diesen Tag statt des
  Schreibdatums - sonst stand „27. September“ scheinbar unter „Sommer 2026“), erstes Foto als Polaroid in der Karte,
  Fokus im Composer und bei Rahmen-Links, theme-color nach Farbwelt und Modus, Server-Härtung (`canonical` nur für
  Zeichenketten, Spalten-Migration transaktional) und Tests.
- **Offen:** Namen bei den Grüßen („Mira und Familie Sonnenhang freuen sich“) bräuchte die Namen der Grüßenden im Feed;
  „Heute vor einem Jahr“ in der Demo nur am Tag des Auffrischens (tägliches Auffrischen wäre die Lösung); weitere Seiten
  mit Linien-Karten (Admin, Partner-Bereich) schrittweise auf Album-Karten.

## Skizze Start (Desktop)

```
[Logo] Familie auf Pfoten   Start(2)  Tiere  Familien  Entdecken        (L) Zuhause Lindenhof ˅
┌ Was erlebt euer Tier? (Nele) (Flocke) (Mia)  [Erzählen …] ┐   ┌ Bald ─────────────────────┐
┌ Für dich (2) ───────────────────────────────────────────┐   │ Sa 12.10. Geschwistertreffen│
│ Wilma war mit dabei: „Strandtag“      [Übernehmen][Nein] │   │ In 5 Tagen: Nele wird 5     │
│ Neu zu Gast: Zuhause Möwenweg            [Passt][Entfernen]│  └─────────────────────────────┘
┌ (Flocke) Flocke · Familie Sonnenhang · vor 2 Std ───────┐   ┌ Meine Familien ─────────────┐
│ Erster Schnee!  [Foto][Foto]     3 Kommentare            │   │ Familie Sonnenhang   3 neu  │
└──────────────────────────────────────────────────────────┘  └─────────────────────────────┘
```

## Digitaler Bilderrahmen (umgesetzt 04.10.)

**Wunsch (Betreiber):** „digitaler Bilderrahmen – revolving gallery“. Ein Tablet, altes Handy oder der Fernseher zeigt
endlos die Fotos eurer Tiere – auch bei Oma, ohne dass sie sich anmeldet.

- **Diashow** `/bilderrahmen` (im eigenen Zuhause, AreaGate `home`): Vollbild-Knopf, dunkler warmer Grund mit unscharfer
  Kopie des Fotos, auf großen Bildschirmen weißer Polaroid-Rand, Überblenden und sanfter Schwenk/Zoom –
  `prefers-reduced-motion` → nur Überblenden. Wechsel 5/10/30/60 s; Bildunterschrift (Name · Datum, in Handschrift
  „Heute vor 3 Jahren“ / „In Erinnerung“), Uhr + Datum, nachts dunkler (22–7 Uhr), „Heute vor … Jahren“ zuerst, mischen.
  Steuerung auf Tippen/Maus (nach 4 s weg): Zurück · Pause/Weiter · Vor · Vollbild · Einstellungen · Beenden; Tasten
  ←/→, Leertaste, Esc. Screen Wake Lock (neu nach `visibilitychange`), nächstes Foto vorgeladen, kaputte Fotos fallen
  still heraus, Liste alle 30 Minuten neu. Auswahl (Tiere, Zeitraum) und Anzeige merkt sich das Gerät (localStorage).
- **Fotos** `GET /api/bilderrahmen/fotos?tiere=1,2&zeitraum=alle|jahr|monat` → `{ fotos: [{ url, tierId, tierName,
  datum, eintragId, inErinnerung }], tiere }` – genau, was der aktive Bereich sieht (`VISIBLE_DOGS_SQL`/
  `VISIBLE_ENTRY_SQL`, private Erinnerungen nur im eigenen Zuhause), höchstens 300 („Heute vor“ und Tierfotos immer, dann
  die neuesten 200, dazu zufällig ältere), `no-store`. Gast 403, Demo liest.
- **Rahmen-Link für ein anderes Gerät** (Einstellungen › Mein Zuhause, höchstens 5): Name, eigene Tiere, Zeitraum,
  Anzeige, „auch private Erinnerungen“ (Vorgabe aus). Token 256 Bit, gespeichert nur als HMAC (eigener Schlüssel aus
  `CODE_PEPPER`), einmal gezeigt als `/rahmen#TOKEN` + QR-Code; Liste mit „zuletzt aktiv“, umbenennen, beenden (sofort
  ungültig). Erneuert das Zuhause seinen Schlüssel (`auth_epoch`), enden alle Rahmen-Links. Tabelle `rahmen_geraete`
  (`server/lib/rahmenGeraete.js`, legt sich selbst an).
- **Gerät** `/rahmen`: Token aus dem `#` einmal in localStorage, Adresse sofort bereinigt; `GET /api/rahmen/fotos` mit
  Header `X-Rahmen-Token` (öffentlich, eigenes Limit je IP, `no-store`, `noindex`, kein Referrer) – nur eigene Tiere und
  eigene Erinnerungen des Zuhauses, nur Name und Datum. Fotos über signierte Adressen `/rahmen-foto/<datei>?g=&exp=&sig=`
  (HMAC über Datei, Gerät, Ablauf; 90–100 min gültig); jede Auslieferung prüft zusätzlich, ob das Gerät noch gilt und das
  Foto noch zur Auswahl gehört. Beendet/unbekannt → „Dieser Bilderrahmen wurde beendet“.
- **Einstiege:** Konto-Menü „Bilderrahmen“, Karte auf Start (nur mit Fotos), Tierprofil ⋯ „Als Bilderrahmen zeigen“
  (`?tier=`). Datenschutz: Abschnitt „Digitaler Bilderrahmen“.
- **Offen:** Fotos aus „Mit dabei“ (gespiegelte Erinnerungen) in der Diashow. (Erledigt mit B+ Familienalbum: Caveat als
  Handschrift, Diashow aus einer Familie heraus, Auswahl eines Rahmen-Links ändern.)

## Suche (umgesetzt 04.10.)

- **Einstieg:** Lupe „Suchen“ im Kopf (Desktop neben dem Konto-Menü, Handy oben rechts, 44 px) und `Strg/⌘+K` – ein
  Tasten-Listener am Suchknopf, nicht in Feldern und nicht über einem anderen offenen Dialog. Nur für Haushalte und
  klassische Familien-Logins; Tierheime/Partner haben keine Lupe (Server: 404).
- **Dialog** (`components/search/`, `Modal`): Feld als Combobox (`aria-activedescendant`, ↑/↓, Enter öffnet – ohne aktive
  Option die erste –, Esc schließt, Fokus zurück). Ab 2 Zeichen nach 250 ms Pause; Gruppen **Tiere · Erinnerungen ·
  Pinnwand & Termine · Familien & befreundete Zuhause · Partner · Abkürzungen** (lokal über Stichwörter: Einstellungen,
  Bilderrahmen, Einladen, Fotocollage, Hilfe & Kontakt, Familie beitreten), je 5 + „Alle n anzeigen“, Treffer
  hervorgehoben. Davor „Zuletzt gesucht“ (5, nur dieses Gerät, je Zuhause getrennt, „Verlauf löschen“, beim Abmelden
  gelöscht, nie in der Admin-Ansicht) und Tipps; „Keine Treffer für …“. Enter vor den Treffern wartet auf sie (nie ein
  veralteter Treffer); nach einem Fehler „Noch einmal versuchen“. Ziele: `/tier/:id?in=…(#entry-N)`,
  `/familien/:id(?reiter=pinnwand)`, `/pinnwand?in=home` (Zettel des Zuhauses, `AreaRoutes` PinboardRoute), `/p/:slug` –
  das AreaGate wechselt den Bereich; ein Treffer, der auch im aktiven Bereich sichtbar ist, bleibt dort.
- **Server** `POST /api/suche` mit Body `{ q, gruppen? }` (`routes/suche.js`, Entscheidung der Leitung 04.10.: der
  Suchbegriff steht nie in einer Adresse und damit in keinem Zugriffsprotokoll – wie `/api/discover`; jede andere Methode,
  auch `GET ?q=`, → 405). Angemeldet (`requireSession` wie Entdecken – ein lesender POST, die Demo-Schreibsperre greift
  nicht; Admin-Ansicht über `ADMIN_VIEW_READ_ONLY_POSTS`, Gast über `GUEST_WRITES`), unbekannte Angaben, `q`/`gruppen`
  falschen Typs → 400, 60 je Minute und Identität (Demo: je Anschluss), `no-store`, `Sec-Fetch-Site: cross-site` → 403.
  `lib/searchAreas.js`
  listet die Bereiche (höchstens 20) mit den vorhandenen Regeln: eigenes Zuhause (VISIBLE_DOGS/VISIBLE_ENTRY, private
  Erinnerungen, Pinnwand), Familien mit Mitgliedschaft (gleiche Regeln mit der Familie, Demo-Gleichheit), laufende
  Besuche (eigene Tiere des Gastgebers, GUEST_ENTRY_SQL, keine Pinnwand); Besuchs-Sitzung = Zuhause + Gastgeber;
  klassischer Login = nur die Familie. Partner wie „Entdecken“ (öffentlich sichtbar, `partnerDemoValues` der Identität).
  `lib/searchText.js`: Faltung klein/ohne Akzente in zwei Fassungen (ä→ae und ä→a, ß→ss), 2–80 Zeichen (gefaltet ≤ 160),
  je Gruppe 20 (`mehr`), genau → Anfang → irgendwo, dann das Neueste; Erinnerungen/Zettel nur als Auszug (≤ 140 Zeichen
  um den Treffer). Fotos nur für Tiere des aktiven Bereichs.
- **Vergleich ohne LIKE (Sicherheits-Review, MEDIUM):** statt `LIKE` mit maskiertem `%`/`_`/`\` vergleichen die
  SQL-Funktionen `suche_hat`/`suche_rang` (`lib/searchMatch.js`) per `String.includes` auf den gefalteten Texten –
  linear statt Text × Muster, Platzhalter gibt es so gar nicht erst (Tests mit `%`, `_`, `\` und Vollbreite-Formen).
  Jeder Text wird je Anfrage einmal gefaltet; nach 4 Mio. gefalteten Zeichen hört die Suche auf und antwortet mit
  `unvollstaendig: true` (Client: „Nicht alles durchsucht …“) – der eine Node-Prozess bleibt für alle frei.
- **Datenschutz:** Abschnitt „Suche“ (Begriffe weder gespeichert noch protokolliert, Verlauf nur im Browser bis zum
  Abmelden).
- **Offen:** Treffer in Grüßen (Kommentaren) und „Mit dabei“-Spiegelungen; Termine der Partner-Kalender; für sehr große
  Chroniken später FTS5 mit gefalteter Spalte.

## Ein Start für alles (Schritt 3, umgesetzt 04.10.)

- **Server** `GET /api/start?limit=1–20&vor=<Cursor>` (`routes/start.js`, `lib/startFeed.js`) → `{ items, termine, notizen,
  next }`. Nur im eigenen Zuhause (sonst 400), kein Bereichs-Parameter (jede andere Angabe → 400), Besuchs-Sitzung 403 (nicht
  in `lib/guestAccess.js`), Tierheim/Partner 404, Demo liest, `no-store`. Die Bereiche kommen aus `lib/searchAreas.js
  homeAreasOf` (dieselbe Liste wie die Suche, kein eigenes `identityAreas.js`): eigenes Zuhause, Familien mit Mitgliedschaft
  (jetzt mit `canEnter` und gültiger Rolle - gilt auch für die Suche), laufende Besuche; höchstens 20.
- **Regeln je Bereich** (`visibleEntrySql` in `lib/searchAreas.js`): die Regeln des Bereichs und nur dort sichtbare Tiere;
  private Erinnerungen nur aus dem eigenen Zuhause (Familien und Besuche erzwingen `privat = 0`, auch für Erinnerungen der
  Familie selbst). Grüße mit der Kommentar-Regel **dieses** Bereichs gezählt (`commentSql`) - ein Gruß aus einer anderen
  Familie zählt nicht und rückt nichts nach oben. In mehreren Bereichen sichtbar: genau einmal, Zuhause > Familien (nach
  Namen) > Besuche - jede Abfrage schließt aus, was ein früherer Bereich zeigt (auch beim Weiterblättern).
- **Reihenfolge und Blättern:** `activity_at` = späteres von Festhalten und letztem sichtbaren Gruß; Cursor
  `JJJJ-MM-TTTHH:MM:SSZ~e<Id>` (Gleichstand über die Id, nie doppelt oder verloren), je Bereich `limit + 1`, dann gemischt.
  Zettel (mit Antworten, höchstens 5), Termine (höchstens 5, ab heute in Europe/Berlin) und `notizen` nur auf der ersten
  Seite; Besuche ohne Pinnwand. Anriss ≤ 300 Zeichen, ≤ 4 Fotos (`foto_anzahl` zählt alle), nur Upload-Adressen; keine
  internen Ids von Bereichen der Autorinnen, Grüßen oder Antworten.
- **Fotos** (`lib/uploadAccess.js`): eine Haushalts-Sitzung (kein Gast) sieht zusätzlich Tierfotos der sichtbaren Tiere und
  Fotos der Erinnerungen, die Start aus Familien/Besuchen zeigt - nie private, nie uploads-Zeilen/Zuchtbuch/Einblick/Banner,
  anhängen bleibt beim aktiven Bereich. Zuerst die Kandidaten (je ein Durchlauf über Tiere und Erinnerungen), erst dann die
  Bereiche (einmal je Anfrage) - ein ausgedachter Dateiname kostet nichts extra (Sicherheits-Review, MEDIUM). Nach dem
  Verlassen bzw. Beenden sofort 404 (der Browser-Zwischenspeicher hält gesehene Fotos wie bisher bis zu 30 Tage).
- **Client:** Start lädt `api.start()` (`hooks/useStartFeed.js`); Erinnerungen aller Bereiche im Album (Kapitel nach `datum`,
  je Seite sortiert, 5 zuerst, „Weitere Erinnerungen“, darunter „Ältere anzeigen“ mit dem Cursor - nie dazwischen, Fokus auf
  die erste neue), mit kleinem Hinweis „Familie Sonnenhang“ (Salbei) bzw. „Zu Besuch: Zuhause Möwenweg“ (Rosé), Links
  `/tier/:id?in=:bereich#entry-:id`. Zettel nicht als Karten im Album (sie wären immer „von heute“ und stünden vor allen
  Erinnerungen), sondern im Kasten „Bald“: Termine aus Zuhause und Familien (je eine Zeile mit Familie, Link zur Pinnwand),
  darunter „Neu an der Pinnwand“ (2 Zeilen, ohne die Termine) und „Notizen (n)“. Bilderrahmen-Karte nur mit eigenen Fotos.
- **Demo:** Möwenweg hat zusätzlich Socke (nicht in die Familie geteilt, Erinnerung von vorgestern) - so zeigt die Demo alle
  drei Bereiche auf Start (`test/demoStart.test.js`).
- **Seitenhöhen** (Demo „Zuhause am Deich“ frisch aufgefrischt, mit „Heute vor einem Jahr“, 2 Terminen, 2 Zetteln):
  1440×900 **2,30**, 375×812 **3,30** (davon ≈ 0,34 für Termine, Zettel und Bereichs-Hinweise; „Meine Familien“ und
  „Bilderrahmen“ unten am Handy ≈ 0,57 - beide gibt es dort auch im Menü bzw. unten in der Leiste). Alles aufgeklappt (40
  Erinnerungen) 11,4.
- **Offen:** „n neu“ an den Familien-Karten (bräuchte „gelesen“-Stand); Zähl-Abfragen laufen je Bereich über alle sichtbaren
  Erinnerungen (für sehr große Chroniken später eine Spalte `last_activity_at`); Demo-Gleichheit je Freigabe (`dog_shares`)
  wie überall nur je Bereich geprüft.
