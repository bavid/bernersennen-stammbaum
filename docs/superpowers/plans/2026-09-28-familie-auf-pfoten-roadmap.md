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
| 7 | Anzeigen-Pflege | nur Admin |
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

## Phasen & Fortschritt

Reihenfolge für die Vorschau: **0 → D → Z → 1 → 2 → T → 3 → 5**, Phase 4 danach (blockiert durch Frage 1).
„D" (Design & Themes) kommt vor die Gutscheine, weil der neue Auftritt das Erste ist, was man in der Vorschau sieht.
„Z" (Meine Chronik, Zuhause, Teilen) folgt direkt: Das Einlösen eines Gutscheins legt „Meine Chronik" an, und die
Tierheim-Übergabe (T) baut auf dem Teilen und Umziehen von Tieren auf.

| Phase | Inhalt | Plan | Status |
|---|---|---|---|
| 0 | Umgebungen: Vorschau-Instanz 3005, lokale Testumgebung, `APP_ENV`-Band, Deploy per SHA | [Plan](2026-09-28-phase-0-umgebungen.md) | 🚀 Vorschau läuft (intern), öffentlich nach Proxy-Eintrag |
| D | Design: Name „Familie auf Pfoten", Pfoten-Logo, Themes Standard/Berner, Wortschatz, Theme-Wahl, „lebt mit" | [Plan](2026-09-28-phase-d-design-themes.md) | ⏳ in Arbeit |
| Z | Meine Chronik & Teilen: private Chronik je Haushalt, Wegbegleiter-Zeitleiste (Einzug/Abschied/Herkunft), Tiere und Einträge in Familien teilen, „lebt mit" statt „Adoptiv-…" | wird vor Beginn geschrieben | ☐ offen |
| 1 | Gutscheine & neuer Login: Codes, Einlösen, Rudel-Schlüssel, Benutzer, PUK, `/v#CODE`, Dev-Panel | wird vor Beginn geschrieben | ☐ offen |
| 2 | Partner, Portale `/p/:slug`, Partnerübersicht, PLZ/Umkreis, Impressum/Datenschutz | wird vor Beginn geschrieben | ☐ offen |
| T | Tierheim-Chroniken: Vermittlungsstatus, Steckbrief `/t/:slug`, Übergabe-Gutschein, Mitlesen | wird vor Beginn geschrieben | ☐ offen |
| 3 | Reiter „Entdecken": Hundeschulen, „Neuer Begleiter gesucht?", Futter-Empfehlungen, Unterstützen, Klickzählung | wird vor Beginn geschrieben | ☐ offen |
| 5 | Admin: Gutschein-Stapel + Druckkarten mit QR, Partner/Anzeigen/Spenden pflegen, Statistik, Präsentationsmodus | wird vor Beginn geschrieben | ☐ offen |
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
| 2026-09-28 | Z | – | Konzept ergänzt: private Chronik, Wegbegleiter, Teilen in Familien, Zusammenleben statt Abstammung |
