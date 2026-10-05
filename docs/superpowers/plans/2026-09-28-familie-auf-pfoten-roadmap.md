# „Familie auf Pfoten" – Umsetzungs-Roadmap & Fortschritt

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement the phase plans linked below task-by-task.

**Grundlage:** [Design-Konzept](../specs/2026-09-27-marketing-gutscheine-partner-design.md) (Stand `187cdcd`).

**Ziel:** Die Familienchronik wird zu „Familie auf Pfoten – Eine tierisch nette Familie": Jeder pflegt „Meine
Chronik" mit seinen Wegbegleitern und teilt Tiere in gemeinsame Familien. Gutscheine statt
Einladungscode, Partner-Portale für Tierheime und Hundeschulen, Tierheim-Chroniken mit Übergabe, Reiter
„Entdecken", Themes (Standard / Berner) und eine Admin-Präsentation. Vorgeführt wird alles auf einer eigenen
**Vorschau-Instanz auf Port 3005**; die Familien-Instanz auf Port 3010 bleibt unverändert, bis der Stand
freigegeben ist.

**Architektur:** Gleiche Code-Basis, zweite Docker-Compose-Instanz auf demselben Server
(`/opt/bernersennen-stammbaum-staging`, Branch `staging`, Container `fap-preview`, Port 3005, `APP_ENV=staging`).
Neue Funktionen werden tierneutral gebaut und kommen immer auch in die Demo-Daten.

**Tech Stack:** Node 24, Express 4, better-sqlite3, React 18, Vite 6, node:test, Vitest, Playwright (E2E-Skripte).

---

## Branches & Umgebungen

| Umgebung | Branch | Ort | Daten |
|---|---|---|---|
| Lokal | `staging` (Arbeitsbranch) | `npm run dev:test` → http://localhost:5173 | `server/.testenv/`, per `npm run testenv:reset` neu |
| Vorschau | `staging` | Server, Port **3005** | nur Seed-Daten, `remote.sh showcase` setzt zurück |
| Produktion | `main` | Server, Port 3010 | echte Rudel – erst nach Freigabe, genau das getestete SHA |

## Vorläufige Entscheidungen zu den offenen Fragen des Konzepts

Für die Vorschau gelten die Vorschläge des Konzepts. Alles ist so gebaut, dass es sich später ändern lässt.

| # | Frage | Vorläufig |
|---|---|---|
| 1 | Crawler-URLs | offen → Phase 4 zurückgestellt, nur OSM-Anbindung vorbereitet |
| 2 | Domain | noch keine → Vorschau unter `https://<Server-IP>:3005`, QR-Ziel über `PUBLIC_URL` konfigurierbar |
| 3 | Länder | nur Deutschland (5-stellige PLZ) |
| 4 | Kontingente | 3 Gutscheine pro Rudel (`RUDEL_VOUCHER_QUOTA`), Partner-Stapel ohne Ablauf |
| 5 | Ausgeber kennt den Code | Hinweis „Schlüssel erneuern" nach dem Einlösen |
| 6 | Wiederherstellung | nur per Code (PUK), keine E-Mail |
| 7 | Anzeigen-Pflege | **geändert 29.09.:** Partner pflegen Beiträge selbst (Kennzeichnung „Anzeige“), Admin gibt frei |
| 8 | Kennzeichnung | pro Eintrag wählbar: „Partner", „Empfehlung", „Anzeige" |
| 9 | GoFundMe | Link + vom Admin gepflegte Transparenzzahlen |
| 10 | Altbestand | alte Passwörter bleiben gültig, kein Stichtag |
| 11 | Karte | Liste mit Entfernung + Maps-/OSM-Links, keine eingebettete Karte |
| 12 | Tierheim „Änderungen sammeln" | beides: Einträge im Tierheim und Neuigkeiten nach der Vermittlung |
| 13 | Chronik beim Umzug | zieht ganz mit, Herkunft bleibt sichtbar |
| 14 | Steckbriefe | standardmäßig `noindex` |
| 17 | Wortschatz Standard-Theme | „Familie" statt „Rudel" |
| 19 | Eigene Farben | nur fertige Themes |
| 20 | Begriffe Phase Z | „Meine Chronik", „Wegbegleiter", „lebt mit" (statt „Adoptiv-…") |
| 21 | Wer pflegt geteilte Tiere | nur der eigene Haushalt; Familie liest und kommentiert; heutige Rudel-Tiere wie bisher alle |
| 22 | Abschied | „In Erinnerung", dezent, optional eigener Text |
| 23 | Ansicht nach Login | zuletzt benutzte (Meine Chronik oder Familie) |
| 24 | Partner veröffentlichen selbst | ja, ohne Admin-Freigabe (Zugang wird persönlich verteilt), Admin kann sperren |
| 25 | Rollen-Namen | Rudelführer/Familienleitung, Stellvertretung, Mitglied, Gast |
| 26 | Tierheim-Status „Pausiert“ | Steckbrief bleibt sichtbar mit Hinweis, nicht in „Entdecken“ |
| 27 | Preis Partner-Profile | kostenlos zum Start |

## Phasen & Fortschritt

Reihenfolge für die Vorschau: **0 → D → Z → 1 → 2 → T → 3 → P1 → P2 → R → 5 → G**, Phase 4 danach (blockiert durch
Frage 1). Zwei Produkte auf einer Plattform: **Chronik** (Kunden-Gutschein) und **Partner-Profil** (Partner-Zugang,
P1/P2). R bringt Rollen in Familien. G (Domain & Go-Live) steht am Ende – erst danach werden Karten gedruckt.
„D" (Design & Themes) kommt vor die Gutscheine, weil der neue Auftritt das Erste ist, was man in der Vorschau sieht.
„Z" (Meine Chronik, Zuhause, Teilen) folgt direkt: Das Einlösen eines Gutscheins legt „Meine Chronik" an, und die
Tierheim-Übergabe (T) baut auf dem Teilen und Umziehen von Tieren auf.

| Phase | Inhalt | Plan | Status |
|---|---|---|---|
| 0 | Umgebungen: Vorschau-Instanz 3005, lokale Testumgebung, `APP_ENV`-Band, Deploy per SHA | [Plan](2026-09-28-phase-0-umgebungen.md) | 🚀 Vorschau läuft (intern), öffentlich nach Proxy-Eintrag |
| D | Design: Name „Familie auf Pfoten", Pfoten-Logo, Themes Standard/Berner, Wortschatz, Theme-Wahl, „lebt mit" | [Plan](2026-09-28-phase-d-design-themes.md) | 🚀 auf der Vorschau |
| Z | Meine Chronik & Teilen: private Chronik je Haushalt, Wegbegleiter-Zeitleiste (Einzug/Abschied/Herkunft), Tiere und Einträge in Familien teilen, „lebt mit" statt „Adoptiv-…", Schnellerfassung | [Plan](2026-09-28-phase-z-meine-chronik.md) | 🚀 auf der Vorschau |
| 1 | Gutscheine & neuer Login: Codes, Einlösen → Meine Chronik, Schlüssel (Login + PUK), Benutzer, Einladung in Familien, Admin-Stapel, `/v#CODE` | [Plan](2026-09-28-phase-1-gutscheine.md) | 🚀 auf der Vorschau |
| 2 | Partner, Portale `/p/:slug`, Partnerübersicht, PLZ/Umkreis (GeoNames + OSM), „In der Nähe“, Impressum/Datenschutz | [Plan](2026-09-28-phase-2-partner.md) | 🚀 auf der Vorschau |
| T | Tierheim-Chroniken: Vermittlungsstatus, Steckbrief `/t/:slug`, Übergabe-Gutschein (Tier zieht mit Chronik um), Mitlesen, Happy-Ends | [Plan](2026-09-29-phase-t-tierheim.md) | 🚀 auf der Vorschau |
| 3 | Reiter „Entdecken": Hundeschulen, „Neuer Begleiter gesucht?", Futter-Empfehlungen, Unterstützen, Klickzählung, Umkreis mit Auffüllen | [Plan](2026-09-29-phase-3-entdecken.md) | 🚀 auf der Vorschau |
| P1 | Partner-Zugang & Profil: Partner-Gutschein → Einrichtung, Profil selbst pflegen, „Bearbeiten \| Kundensicht“ (Live-Vorschau in Beispiel-Kundenoberfläche), Veröffentlichen/Sperre, Einblicke (Fotos + Datum), Hundesalon/Betreuung, Status „Pausiert“ | [Plan](2026-09-29-phase-p-partnerbereich.md) | 🚀 auf der Vorschau |
| P2 | Anzeigen & Kontakt: Beiträge als „Anzeige“ mit Admin-Freigabe, „Schreib uns“ mit Postfach, E-Mail/Kontaktformular-Link, „Salon & Betreuung“, Partnerliste füllt dünnen Umkreis auf | [Plan](2026-09-29-phase-p-partnerbereich.md) | 🚀 auf der Vorschau |
| R | Familien-Verwaltung: Rollen (Rudelführer/Leitung, Stellvertretung, Mitglied, Gast), Mitglieder-Seite, Einladungen mit Rolle, Leitung übergeben, auflösen, „Wer sieht was?“ | [Plan](2026-09-29-phase-r-familienverwaltung.md) | 🚀 auf der Vorschau |
| 5 | Admin: Druckkarten mit QR (Kunden-, Partner-, Partner-Stapel-Karten), Partner sehen ihren Kunden-Stapel, `/partner-werden`, Statistik, Präsentationsmodus | [Plan](2026-09-29-phase-5-admin-praesentation.md) | 🚀 auf der Vorschau |
| U | Übersichtlichkeit & Wording: Zurück von Impressum/Datenschutz, Einstiege „Für Tierhalter / Für Partner“ mit Partner-Demo, „Familienbande“/„Nachwuchs“ im Standard-Auftritt, ruhigeres UI (Filter-Chips, Reiter, Raster) | [Plan](2026-09-29-phase-u-uebersicht-wording.md) | 🚀 auf der Vorschau |
| N | Anfragen & Benachrichtigungen: Gutschein-/Partner-Anfrage mit gültiger E-Mail, Admin-Liste mit Code-Zuweisung, Telegram je Ereignis schaltbar | [Plan](2026-09-29-phase-n-anfragen-benachrichtigungen.md) | 🚀 auf der Vorschau (inkl. Hinweis-Banner, Task 5) |
| V | Freunde & Partner: eine Karte je Partner in Entdecken (Anzeigen/Einblicke anpinnen, Reihenfolge), PLZ dezent, Zuhause besuchen (Code 7 Tage) + Kommentare, „Erlebt mit“ mit Bestätigung, Familienbande mit Familien statt Generationen, Partner-Kalender mit Serien und öffentlichen Terminen, Telegram für Partner, Visitenkarten-Designer, Collage-Vorlagen/Sticker, mehr Demo-Fotos | [Plan](2026-09-30-phase-v-freunde-partner-kalender.md) | 🚀 auf der Vorschau (03.10., inkl. UI-Audit und neuer Familienbande) |
| W | Neue Struktur: Start · Tiere · Familien · Entdecken + Menü, Gruppenseiten, Tierprofil-Reiter, Start-Feed über alle Bereiche, alle Tiere an einem Ort, Look B+ Familienalbum, Mini-Designer, Suche, Hinweise-Glocke, Bilderrahmen, neue Masken | [Plan](2026-10-03-phase-w-struktur.md) | 🚀 auf der Vorschau (05.10., Schritte 1–4 + UI-Audit; Schritt 5 Aufräumen teilweise) |
| A | Als App aufs Handy: installierbare Web-App (Manifest, Service Worker mit Offline-Seite, „Neue Version · Neu laden“), Install-Hinweis auf Login-Seite und Einstellungen › App, Anleitung je Gerät auf `/app`, Einstellungen › App mit Benachrichtigungen aufs Handy (Web Push, VAPID), „Standort merken“ (nur PLZ, am Gerät) und „Unsere Einstellungen zurücksetzen“; Store-Apps später | – | ✅ fertig (lokal getestet) |
| O | DevOps & Sicherheit: Hetzner-Aufteilung, Forgejo-CI, Open-Source-Scans, restic-Backups, WireGuard | [Plan](2026-10-04-devops-sicherheit.md) | ☐ offen – Freigaben des Betreibers nötig |
| M | „Mein Revier“: öffentliche Profile (Opt-in, PLZ + Haken), Sichtbarkeit „öffentlich“ je Eintrag, Radar in der Nähe, Folgen, „Mein Profil für andere“ | Konzept (Plan folgt) | ☐ offen (Entscheidungen 03.10. im Konzept) |
| G | Eigene Domain & Go-Live: Domain/DNS/Caddy (Betreiber), `PUBLIC_URL`, HSTS, robots.txt, Prod-Übernahme mit Freigabe, danach Karten drucken | [Plan](2026-09-29-phase-g-domain-golive.md) | ⏳ Code fertig (PUBLIC_URL, HSTS, robots/sitemap, Admin-Reiter Server, tägliche DB-Sicherung) – Domain/DNS/Proxy/Prod beim Betreiber |
| 4 | Import, Crawler, Website-Prüfung, Prüfliste | zurückgestellt | ⏸ blockiert (Frage 1) |

Legende: ☐ offen · ⏳ in Arbeit · ✅ fertig (lokal getestet) · 🚀 auf der Vorschau (3005) · ⏸ blockiert

## Definition of Done je Phase

- Server-Tests (`npm --prefix server test`) und Client-Tests (`npm --prefix client test`) grün, neue Logik mit Tests.
- Browser-Test (Playwright-Skript) für die neuen Abläufe grün, Handy und dunkles Design geprüft.
- Neue Funktion steckt in den Demo-/Vorschau-Daten.
- Code-Review ohne offene kritische Punkte.
- Commit auf `staging`, Vorschau auf 3005 aktualisiert, Status hier nachgetragen.

## Fortschritts-Log

| Datum | Phase | Stand | Notiz |
|---|---|---|---|
| 2026-09-28 | – | `187cdcd` | Konzept nach `main` übernommen, Branch `staging` angelegt, Roadmap erstellt |
| 2026-09-28 | 0 | `b1f9e7a` | Tasks 1–6: Compose-Parameter, `APP_ENV`, Vorschau-Band, Testdaten mit Prod-Schutz, `npm run dev:test`, `remote.sh` mit REVISION, Instanz-Schutz, Backup vor Deploy |
| 2026-09-28 | 0 | `08df576` | Tasks 7–8: `manage.ps1 -Target staging`, Vorschau zurücksetzen [11], Vorschau → Prod übernehmen [12], README. Vorschau-Instanz `fap-preview` auf dem Server eingerichtet und mit Beispieldaten gefüllt, Prod unberührt |
| 2026-09-28 | 0 | `63d70a0` | Abschluss-Review: Cookies je Instanz getrennt (`staging_session`), Instanz-Prüfung für alle `remote.sh`-Befehle, Promote nur mit dem SHA, der auf der Vorschau läuft, getrennte Backups |
| 2026-09-28 | D | `af7c514` | Themes Standard/Berner (`families.theme`, bestehende Rudel → Berner), Pfoten-Logo mit Herz-Ballen, Wortschatz je Theme, „lebt mit“ statt „Adoptiv-…“, Einstellungen mit Live-Vorschau; Demo der Vorschau heißt „Familie Sonnenhang“ (Standard), Test-Rudel bleibt Berner |
| 2026-09-28 | Z | `5396ecf` | Meine Chronik (Zuhause), Familien beitreten/gründen/verlassen, Bereich wechseln, Tiere teilen, private Einträge, Einzug/Abschied/Herkunft, Wegbegleiter-Zeitleiste, Schnellerfassung inkl. „+ Mitbewohner“, Fotos nur für Berechtigte, Demo „Zuhause am Deich“ |
| 2026-09-28 | 1 | `a72ae84` | Gutscheine statt Einladungscode: Einlösen → Meine Chronik, Schlüssel = Login + PUK, Benutzer optional, Weitergabe-Gutscheine (Familien-Einladung = Mitgliedschaft), Admin-Stapel, `/v#CODE`, Schlüssel erneuern/Benutzer nur mit Bestätigung, `CODE_PEPPER` im Deploy |
| 2026-09-29 | 2 | `56ed1ec` | Partner mit Portal `/p/:slug` (Logo, Akzentfarbe, Gutschein einlösen, Demo), Partnerliste `/partner` (PLZ/Umkreis, GeoNames), „In der Nähe“ `/umgebung` (OSM über den Server, gecacht, SSRF-geschützt, ohne Züchter), Admin-Pflege, Partner-Gutscheine, Impressum/Datenschutz; Demo-Partner |
| 2026-09-28 | Z | – | Konzept ergänzt: private Chronik, Wegbegleiter, Teilen in Familien, Zusammenleben statt Abstammung |
| 2026-09-29 | T | `c7315cd` | Tasks 1–6: Tierheim-Bereich (art='tierheim'), Vermittlungsstatus/Kategorien/Steckbrief `/t/:slug`, Übergabe-Gutschein (Tier zieht mit Chronik um), Mitlesen-Einwilligung, Demo-Tierheim „Tierheim Sonnenhang" (4 Tiere, 3 Steckbriefe, `/api/demo {as:'tierheim'}`), Happy-Ends auf dem Partner-Portal |
| 2026-09-29 | T | `a0048ad` | Abschluss-Review behoben (Status-Filter, Bestätigung bei Statuswechsel, Einwilligungstexte, Admin-UI für Tierheim-Zugänge, Demo-Sperren) – auf der Vorschau |
| 2026-09-29 | 3 | `829d188` | Tasks 1–2: Admin-Pflege Empfehlungen/Spenden, `POST /api/discover`, anonyme Klickzählung `/r/…`, Umkreis mit Auffüllen (< 5 → nächste 20) – Server auf der Vorschau |
| 2026-09-29 | P/R/G | – | Konzept erweitert: zwei Produkte (Chronik / Partner-Profil), Partner-Zugang per Gutschein, Kundensicht, Einblicke, Rollen in Familien, Domain & Go-Live; Pläne P (P1/P2), R, G geschrieben |
| 2026-09-29 | 3 | `5808229` | Tasks 3–6: Demo-Inhalte, Reiter „Entdecken“ (5er-Navigation), Admin für Empfehlungen/Spenden/Klicks, Datenschutz-Absatz, Empfehlungen auch in „Neue Begleiter“/„Unterstützen“ – auf der Vorschau |
| 2026-09-29 | P1 | `5808229` | Tasks 1–2: Partner-Bereiche für alle Typen (`art=partner`), Hundesalon/Betreuung, Status „Pausiert“, Admin-Sperre, Partner-Zugang per Gutschein mit Selbst-Einrichtung |
| 2026-09-29 | P1 | `0a266d6` | Tasks 3–7: Profil selbst pflegen/veröffentlichen, Einblicke (nur JPG/PNG, EXIF entfernt), Kundensicht (Beispiel-Kundenoberfläche), Demo-Partner (Pfotenglück, Hundesalon Wuschelglück, pausiertes Tier „Lotte“), Admin: Partner-Zugänge, Sperre, Einblicke ausblenden; Admin-/Partner-Seiten werden nachgeladen |
| 2026-09-29 | P2 | `0a266d6` | Beiträge als „Anzeige“ mit Freigabe, „Schreib uns“ mit Postfach (180 Tage, täglicher Lösch-Lauf), „Salon & Betreuung“, Partnerliste mit „Weiter weg“ – auf der Vorschau |
| 2026-09-29 | R | `7c55ef7` | Rollen (Leitung/Stellvertretung/Mitglied/Gast) mit Rechteprüfung, Mitglieder-Seite, Einladungen mit Rolle, Leitung übergeben, Familie auflösen, Tier übernehmen, Demo mit allen Rollen – auf der Vorschau |
| 2026-09-29 | 5 | `7c55ef7` | Tasks 1–3: Druckdaten/CSV/Statistik (Server), Druckseite mit QR-Karten (3 Motive, A4), Statistik-Karte und Herkunft im Admin; Vorschau öffentlich unter :3005 mit Zertifikat |
| 2026-09-29 | 5 | – | Tasks 4–5b: Partner sehen/drucken ihre Kunden-Gutscheine, `/partner-werden`, Präsentationsmodus, Admin-Ansicht (nur lesen, Protokoll), eingelöste Gutscheine mit Datum in der Liste – auf der Vorschau |
| 2026-09-29 | U/N | `706aefd` | Zurück-Navigation, Einstiege Tierhalter/Partner, Demo als Tierheim, Familienbande/Nachwuchs, Portal als Landingpage mit „Teilen“, Entdecken und Admin in Reitern, kompakte PLZ, ein Badge, echte Demo-Fotos (Unsplash); Gutschein-/Partner-Anfragen mit geprüfter E-Mail, Telegram im Admin-Portal – auf der Vorschau |
