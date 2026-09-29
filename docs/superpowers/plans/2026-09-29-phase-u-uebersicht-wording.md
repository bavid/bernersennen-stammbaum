# Phase U – Übersichtlichkeit, Wording und Einstiege Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rückmeldung des Betreibers nach dem ersten Test der Vorschau (29.09.):
- Von Impressum und Datenschutz kommt man nicht zurück.
- Den Partner-Bereich (Profil, Tiere, Anzeigen) hat er nicht gefunden – Partner sollen vor dem eigenen Einstieg eine
  Demo sehen können, als Werbung.
- „Stammbaum“ klingt nach Zucht und passt nicht zu Tierheimen.
- Anzeigen und Seiten sind inzwischen unübersichtlich; alles soll einfach, ruhig und sauber ausgerichtet sein. Das
  Grundprinzip bleibt.

**Grundlage:** [Konzept](../specs/2026-09-27-marketing-gutscheine-partner-design.md), Abschnitt „Phase U“.

**Regeln:** Branch `staging`, nicht pushen, kein Trailer, nur eigene Dateien stagen, keine Worktrees; keine echten
Namen (pre-commit-Hook); jede Funktion auch in der Demo.

---

### Task 1: Zurück von Impressum/Datenschutz, klare Einstiege auf der Startseite (Client)

- **Rechtliche Seiten und alle öffentlichen Seiten** (`/impressum`, `/datenschutz`, `/partner`, `/partner-werden`,
  `/p/:slug`, `/t/:slug`): einheitlicher schlanker Kopf mit Logo (Link zur Startseite) und „Zurück“ (Browser-Verlauf,
  sonst Startseite bzw. eingeloggt die Startroute des Bereichs).
- **Login-Seite** mit zwei klaren Einstiegen nebeneinander (am Handy untereinander):
  - „Für Tierhalter“: Gutschein einlösen, Anmelden, „Demo ansehen“.
  - „Für Hundeschulen, Tierheime & Co.“: „Demo als Partner ansehen“ (Hundeschule), „Mehr erfahren“ (→
    `/partner-werden`), „Partner-Zugang einlösen“ (Hinweis: Gutschein-Feld oben).
- **`/partner-werden`**: Demo-Knöpfe ganz oben, groß („So sieht euer Partner-Bereich aus“), darunter die Vorteile.
- **Partner-Demo-Rundgang:** In einer Demo-Partner-Sitzung zeigt ein kleines, schließbares Hinweisfeld oben die
  drei Wege: „Profil bearbeiten“, „Kundensicht“, „Beiträge/Tiere“. Einmal geschlossen, bleibt es zu
  (`localStorage`, mit try/catch).
- Tests für jede Seite: Zurück-Link vorhanden und funktioniert; Einstiege auf der Login-Seite; Demo-Hinweis.

### Task 2: Wording im Standard-Auftritt (Client, etwas Server)

- Neue Theme-Wörter (in allen Themes, Key-Parität): `treeLabel` (Standard „Familienbande“, Berner „Stammbaum“),
  `littersLabel` (Standard „Nachwuchs“, Berner „Würfe“), dazu die Überschriften/Hinweise, in denen „Stammbaum“ bzw.
  „Würfe“ vorkommt (Grep über `client/src`: Seiten-Titel, Leeres-Zustand-Texte, Werkzeugleiste, Vorschau-Rahmen,
  Präsentations-Kacheln, Hilfetexte).
- Weitere Zucht-Wörter im Standard-Auftritt prüfen und neutral fassen (z. B. „Deckakt“ → „Verpaarung“), Berner
  bleibt unverändert.
- **Nachwuchs im Standard-Auftritt:** nicht mehr in der unteren Leiste. Auf „Familienbande“ erscheint ein Abschnitt
  bzw. Reiter „Nachwuchs“ nur, wenn es Würfe oder eingetragene Verpaarungen gibt; die Route `/wuerfe` bleibt
  erreichbar. Im Berner-Auftritt bleibt „Würfe“ in der Leiste.
- Die Route `/stammbaum` bleibt (Links, Lesezeichen); optional Alias `/familienbande`.
- Server: Texte in Demo-Seeds und Meldungen, die „Stammbaum“ für Standard-Bereiche nennen, anpassen, falls vorhanden.
- Tests: Theme-Parität, Leiste je Auftritt, Nachwuchs-Abschnitt nur mit Daten, Texte.

### Task 3: Übersichtlichkeit – Bestandsaufnahme und Vereinfachung (Client)

- **Bestandsaufnahme mit Screenshots** (Handy 375 px und Desktop, hell/dunkel) der Seiten: Entdecken, Partner-Portal,
  Steckbrief, Partner-Profil (Angaben, Einblicke, Beiträge, Kunden-Gutscheine), Kundensicht, Postfach, Admin.
  Befunde als kurze Liste in `docs/superpowers/plans/2026-09-29-phase-u-befunde.md` (was stört, konkrete Änderung).
- **Leitlinien für die Umsetzung:**
  - ein klares Raster (gleiche Innenabstände je Kartenart, einheitliche Kartenbreiten, Ausrichtung an einer linken
    Kante), eine Überschriften-Hierarchie je Seite;
  - höchstens ein Badge je Karte (Kennzeichnung „Anzeige“ bleibt immer sichtbar), Nebeninfos als ruhige Meta-Zeile;
  - Entdecken: oben eine Leiste mit Filter-Chips („Alle“, „Hundeschulen“, „Salon & Betreuung“, „Neue Begleiter“,
    „Futter“, „Unterstützen“) statt fünf langer Kapitel untereinander; „Alle“ zeigt je Kapitel höchstens drei Einträge
    und „Alle anzeigen“;
  - Partner-Profil: Reiter auf höchstens vier sichtbare reduzieren (weitere unter „Mehr“), primäre Aktion je Reiter
    oben rechts;
  - Admin: Karten in Reiter gliedern (Übersicht, Freigaben, Gutscheine, Partner, Empfehlungen & Spenden, Familien,
    Protokoll), Zähler an den Reitern;
  - Formulare: Labels oben, Hilfetext darunter, Aktionen rechtsbündig, eine Primäraktion.
- Umsetzung in kleinen Commits je Seite, mit vorher/nachher-Screenshots im Bericht. Bestehende Tests grün halten,
  neue Tests für die Filter-Chips und die Reiter.

### Task 3 – Rückmeldung nach dem zweiten Test (29.09.), verbindlich

- **Partner-Portal als eigene Plattform:** `/p/:slug` ist öffentlich und soll Hundeschulen, Salons & Co. als
  vorzeigbare Mini-Website dienen, auf die sie von ihrer eigenen Website, Instagram oder Visitenkarten verlinken –
  jeder Besuch bringt potenzielle Kundschaft zu uns.
  - Aufbau wie eine ruhige Landingpage: großer Kopf mit Logo, Name, Ort, Kurztext und Kontakt-Knopf; danach
    „Angebote & Aktuelles“, Einblicke (Galerie), bei Tierheimen die Tiere, Happy Ends, Kontakt.
  - **Eigene Beiträge auf dem eigenen Portal ohne „Anzeige“-Badge** (es ist ihre Seite); die Kennzeichnung „Anzeige“
    gilt nur, wenn Beiträge in „Entdecken“ neben anderen erscheinen. Keine fremden Anzeigen auf Partner-Portalen.
  - Dezenter Fuß „Mit Familie auf Pfoten – eine Chronik für deine Tiere“ mit Link zur Startseite bzw. „Gutschein
    anfragen“.
  - Im Partner-Profil ein Reiter bzw. Bereich **„Teilen“**: Portal-Link zum Kopieren, QR-Code als SVG/PNG zum
    Herunterladen, ein kleiner HTML-Knopf zum Einbinden auf der eigenen Website („Uns findet ihr auch auf Familie auf
    Pfoten“), Text-Vorschlag für Social Media.
- **Badges:** „Partner“ und „geprüft“ zusammenführen – öffentlich höchstens ein ruhiges Merkmal (z. B. kleines
  Pfoten-Häkchen „Partner“), keine zwei konkurrierenden Pillen.
- **PLZ-Eingabe** kompakt: eine Zeile (PLZ-Feld ca. 7 Zeichen breit, Umkreis-Auswahl, Suchen-Knopf), am Handy
  ebenfalls schmal; der Standort-Knopf als kleiner Text-Link.
- **Entdecken mit Reitern** statt langer Liste: Reiter „Alle | Hundeschulen | Salon & Betreuung | Neue Begleiter |
  Futter | Unterstützen“ (am Handy horizontal scrollbar, Zähler je Reiter); „Alle“ zeigt je Bereich höchstens drei
  Einträge plus „Alle anzeigen“ (wechselt den Reiter). Reiter in der URL (`?bereich=`).
- Danach Gesamtdurchsicht und Refactoring aller Seiten nach den Leitlinien oben (Raster, Abstände, ein Badge je
  Karte, Formulare), mit Screenshots vorher/nachher.

### Task 3b: Echte Demo-Fotos statt Comic-Bilder (Wunsch 29.09.)

- Die generierten Comic-Bilder der Demo wirken wie Werbung. Ersetzen durch echte Fotos: spielende Hunde, Welpen,
  Katzen, Training in der Hundeschule, Hundesalon, Tierheim-Alltag.
- **Quelle und Lizenz:** Unsplash bzw. Pexels (freie, auch gewerbliche Nutzung ohne Anfrage). Nur Tiere, keine
  erkennbaren Personen, keine Marken. `server/seed/images/QUELLEN.md` listet je Bild Fotograf, Link, Lizenz.
- **Aufbereitung:** höchstens 1600 px, ca. 200–300 KB, EXIF entfernt; gleiche Dateinamen oder angepasste
  Seed-Verweise.
- Nur Demo-Daten (`is_demo = 1`) betroffen; danach Vorschau zurücksetzen.

### Task 4: Prüfen und ausliefern (Koordinator)

- Browser-Prüfung auf der Vorschau (Handy/Desktop, hell/dunkel), README/Roadmap, Deploy.
