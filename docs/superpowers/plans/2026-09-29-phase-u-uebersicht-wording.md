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

### Task 4: Prüfen und ausliefern (Koordinator)

- Browser-Prüfung auf der Vorschau (Handy/Desktop, hell/dunkel), README/Roadmap, Deploy.
