# Phase 5 – Admin, Druckkarten und Präsentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der Betreiber kann Gutscheine als Karten drucken und sieht, was die Karten bewirken. Außerdem kann er
die Plattform bei Tierheimen und Hundeschulen vorführen.
- **Karten:** Kunden-Karten, Partner-Zugangs-Karten und Partner-Stapel, jeweils mit QR-Code.
- **Statistik:** Einlösungen, Mundpropaganda-Ketten, Klicks.
- **Präsentation:** ein Vorführmodus ohne Admin-Bedienelemente.
- **Partner-Werbung:** Partner sehen ihren Kunden-Gutschein-Stapel. Eine Infoseite `/partner-werden` wirbt um neue
  Partner.

**Architecture:**
- **Druckseite:** eine eigene Admin-Seite mit Druck-CSS (A4, Karten 85×55 mm).
- **QR-Codes:** werden im Browser als Inline-SVG erzeugt, mit der Bibliothek `qrcode-generator` (MIT, ohne
  Abhängigkeiten).
- **Ziel des QR-Codes:** `${PUBLIC_URL}/v#CODE`. Ist `PUBLIC_URL` nicht gesetzt, gilt `location.origin`, dazu ein
  Warnhinweis: „Vor dem Druck die Domain setzen“, siehe Phase G.
- **Codes:** Offene Codes liefert der Server nur dem Admin, entschlüsselt aus `code_cipher`. Sie landen nie in
  Logs oder URLs.

**Tech Stack:** wie bisher, neu ist die Client-Abhängigkeit `qrcode-generator`.

**Grundlage:** [Konzept, Phase 5](../specs/2026-09-27-marketing-gutscheine-partner-design.md).

**Regeln:**
- **Git:** Branch `staging`, nicht pushen, kein Trailer, nur eigene Dateien stagen, keine Worktrees.
- **Namen:** keine echten Namen von Menschen oder Tieren aus dem Bestand (Liste beim Koordinator). Der lokale
  pre-commit-Hook prüft das.
- **Demo:** jede Funktion auch in der Demo bzw. Vorschau.

---

### Task 1: Druckdaten und Statistik (Server)

**Files:** `server/routes/admin.js` oder neu `server/routes/adminStats.js`, `server/lib/vouchers.js`,
`server/config.js`, Tests

- **`GET /api/admin/voucher-batches/:id/print`:**
  - liefert `{ batch: { id, label, zweck, partnerTyp, partner: { name, logoUrl, farbe } | null }, codes: [...] }`;
  - `codes` enthält nur offene Gutscheine (nicht eingelöst, nicht widerrufen, nicht abgelaufen), im Klartext
    formatiert (`XXXX-XXXX-XXXX`);
  - Antwort mit `Cache-Control: no-store`;
  - jeder Abruf wird im Admin-Protokoll vermerkt: nur Stapel-ID und Anzahl, keine Codes;
  - ohne `code_cipher` bleibt ein Code draußen, ein Zähler meldet `nichtDruckbar`.
- **`GET /api/admin/voucher-batches/:id/export.csv`:** CSV (Semikolon, UTF-8 mit BOM) mit Hinweis, Status,
  eingelöst am, bei Partnern der Partner. **Keine Codes** in der CSV, dafür gibt es die Druckseite.
- **`GET /api/config`:** liefert `publicUrl` (aus `PUBLIC_URL`), damit der Client die QR-Ziele baut.
- **`GET /api/admin/stats`:**
  - **Einlösungen:**
    - je Stapel: Größe, eingelöst, offen, widerrufen;
    - je Partner: Zahl der Bereiche, die über Partner-Stapel bzw. von Partner-Bereichen weitergegebene Gutscheine
      entstanden sind (`families.partner_id`);
    - je Zweck.
  - **Mundpropaganda:**
    - Ketten, bei denen ein Bereich einen Gutschein weitergibt und daraus ein neuer Bereich entsteht;
    - Tiefe und Anzahl über `vouchers.issued_by_family_id` → `redeemed_by_family_id`;
    - die Top-10-Ketten, nur mit IDs und Bereichsnamen, keine Personen.
  - **Klicks:** je Anzeige/Empfehlung und je Partner-Link, 7 und 30 Tage sowie gesamt, als Tageszeitreihe der
    letzten 30 Tage (`link_clicks`).
  - **Partner:** Anzahl je Status (Entwurf, aktiv, pausiert, gesperrt), Einblicke, Beiträge je Freigabe-Status,
    ungelesene Nachrichten gesamt (nur die Zahl).
  - **Demo:** nur echte Daten; Demo-Bereiche und Demo-Partner nicht mitzählen.
- **Rudel-Liste (`/overview`):** zeigt je Bereich die Herkunft: „über Partner X“, „weitergegeben von Bereich Y“,
  „Admin-Stapel Z“ bzw. „Altbestand“ statt des Freitexts `quelle`, der als Fallback bleibt.
- **Tests:**
  - `print` liefert nur offene Codes, nur für den Admin (sonst 401), mit `no-store`;
  - die CSV enthält keine Codes;
  - `stats` mit konstruierten Ketten, Klicks und ohne Demo;
  - Herkunft in `overview`.

- [ ] Commit: `feat: Druckdaten, CSV-Export und Statistik für den Admin`

### Task 2: Druckseite mit QR-Karten (Client)

**Files:** neu `client/src/pages/AdminPrintPage.jsx` (lazy, Route `/admin/gutscheine/:id/druck`),
`client/src/components/VoucherCard.jsx`, `client/src/lib/qr.js`, `client/src/styles/print.css`, Link aus
`AdminVouchers`, `package.json` (`qrcode-generator`)

- **Drei Kartenmotive:**
  - **Kunden-Karte:** Logo „Familie auf Pfoten“, „Deine Chronik für deine Tiere“, QR-Code, Code in Klarschrift, kurze
    Anleitung „Scannen oder auf familieaufpfoten.de/v eingeben“ (Domain aus `publicUrl`).
  - **Partner-Zugangs-Karte:** „Euer kostenloses Partner-Profil“, Nutzen in drei Stichpunkten (Profil,
    Einblicke, Kontakt), QR-Code, Code.
  - **Partner-Stapel-Karte:** Kunden-Karte mit Partner-Logo und -Farbe und „überreicht von {Partner}“.
- **Layout:**
  - A4-Bogen mit 10 Karten (2×5), Schnittmarken;
  - Druck-CSS blendet die App-Oberfläche aus;
  - Vorder- und Rückseite optional: Rückseite mit kurzem Text zu Datenschutz und Anleitung;
  - Auswahl „nur Vorderseite / Vorder- und Rückseite“.
- **QR:**
  - `lib/qr.js` kapselt `qrcode-generator` und liefert ein SVG-Pfad-Element;
  - Fehlerkorrektur M;
  - Ziel `${publicUrl || location.origin}/v#${code}`;
  - Warnbanner, wenn `publicUrl` fehlt oder eine IP bzw. `localhost` ist.
- **Sicherheit:** Die Codes stehen nur im DOM der Druckseite; kein `localStorage`, keine Logs.
- **Tests:**
  - der QR-Code enthält das richtige Ziel (dekodieren oder die Matrix mit bekanntem Ergebnis vergleichen);
  - drei Motive;
  - 10 Karten pro Bogen, der letzte Bogen teilweise gefüllt;
  - Warnbanner;
  - Druck-CSS vorhanden.

- [ ] Commit: `feat: Druckseite für Gutschein-Karten mit QR-Code`

### Task 3: Statistik-Ansicht und Rudel-Herkunft (Client)

**Files:** neu `client/src/components/AdminStats.jsx` (+ kleine Diagramm-Komponenten ohne Bibliothek: SVG-Balken
bzw. Sparkline), `AdminPage.jsx`, `AdminFamilies…`

- **Karte „Übersicht“ oben im Admin:**
  - Kennzahlen: Bereiche, Partner, eingelöste Gutscheine, Klicks 7 Tage;
  - Tabelle je Stapel mit Balken eingelöst/offen;
  - Partner-Ranking nach neuen Bereichen;
  - Mundpropaganda (Top-Ketten als eingerückte Liste);
  - Klicks: Sparkline 30 Tage und Top-Anzeigen.
- **Rudel-Liste:** zeigt die Herkunft.
- Barrierefrei: Diagramme mit Textalternative (Tabelle oder `aria-label` mit Zahlen), gut in hell und dunkel.
- **Tests:** Rendering der Kennzahlen, Diagramm-Alternativtexte, Herkunft.

- [ ] Commit: `feat: Statistik im Admin – Einlösungen, Mundpropaganda, Klicks`

### Task 4: Partner sehen ihren Kunden-Stapel, Infoseite „Partner werden“

**Files:** Server: `GET /api/partner-area/vouchers` (eigene Partner-Stapel mit offenen und eingelösten Codes; die
offenen Codes nur auf ausdrücklichen Abruf „Zum Drucken anzeigen“, `no-store`). Client: Reiter „Kunden-Gutscheine“
im Partner-Profil mit Druckansicht (Partner-Stapel-Motiv) und `client/src/pages/PartnerInfoPage.jsx` (`/partner-werden`, öffentlich).

- **Partner-Bereich:**
  - Liste der Stapel, die der Admin für diesen Partner angelegt hat, dazu die über „Kunden-Gutschein
    weitergeben“ erzeugten;
  - offen/eingelöst;
  - „Karten drucken“ nutzt die Karten aus Task 2 (Partner-Stapel-Motiv);
  - in der Demo nur lesen, mit Beispiel-Codes aus der Demo.
- **`/partner-werden`:**
  - öffentliche Seite für Hundeschulen, Tierheime, Hundesalons und Betreuung;
  - Nutzen (Profil, Einblicke, „Schreib uns“, Anzeigen, Kundensicht), „So funktioniert’s“ (Partner-Zugang →
    Einrichten → Veröffentlichen), Knopf „Demo als Partner ansehen“;
  - Kontakt: Impressum-E-Mail;
  - Link von der Login-Seite („Für Partner“) und aus der Partnerliste;
  - `noindex` erst nach Phase G aufheben.
- **Tests:** Server-Rechte (nur eigener Partner), Druck-Abruf `no-store`, Seite und Demo-Knopf.

- [ ] Commit(s): `feat: Partner sehen ihre Kunden-Gutscheine, Infoseite Partner werden`

### Task 5: Präsentationsmodus (Client)

**Files:** neu `client/src/pages/AdminPresentPage.jsx` (lazy, `/admin/praesentation`), kleine Server-Ergänzung
falls nötig

- **Start:** Vollbild-Ansicht ohne Admin-Leiste.
- **Kacheln:**
  - „Als Familie ansehen“ (Demo-Zuhause), „Als Rudel ansehen“ (Demo-Rudel);
  - „Als Tierheim ansehen“, „Als Hundeschule ansehen“, „Als Hundesalon ansehen“ (Demo-Partner-Bereiche);
  - „Kundensicht eines Partners“.
- **Ablauf:**
  - jede Kachel startet die passende Demo-Sitzung in einem neuen Tab (`POST /api/demo` mit `as` und `slug`);
  - danach landet man auf der passenden Startseite.
- **Vorschau jedes Partnerportals** (auch Entwurf) über die vorhandene Admin-Vorschau; Auswahl per Liste.
- **Tastaturbedienung, großer Text,** auch am Tablet nutzbar.
- **Tests:** Kacheln rufen Demo richtig auf; Liste der Portale.

- [ ] Commit: `feat: Präsentationsmodus für Vorführungen`

### Task 6: Prüfen und ausliefern (Koordinator)

- [ ] README, Roadmap.
- [ ] Abschluss-Review mit Schwerpunkten:
  - Klartext-Codes (nur Admin bzw. eigener Partner, `no-store`, keine Logs);
  - Statistik ohne Personenbezug;
  - Druck-CSS.
- [ ] Browser-Prüfung: Druckvorschau (Chrome „Drucken → Als PDF“), QR mit dem Handy scannen (Ziel prüfen),
  Präsentationsmodus.
- [ ] Vorschau deployen.
