# Spenden live (2026-10-11)

Wunsch des Betreibers: „live donation tracking“. Kein Zahlungsanbieter angebunden – der Admin erfasst Spenden, sobald sie
ankommen; ein Webhook ist vorbereitet.

## Modell

- Tabelle `spenden_eingaenge` (`server/lib/spenden.js`): eine Zeile je Spende, Cent, Datum, Quelle
  (`gofundme|paypal|ueberweisung|bar|sonstiges`), optional Name (≤ 40) und Nachricht (≤ 140, kein `< >`), `oeffentlich`
  (Vorgabe 1), `is_demo`, `extern_ref` (Webhook-Kennung, eindeutig).
- **Quartale:** Für jedes Quartal mit mindestens einer echten erfassten Spende ist deren Summe die Spenden-Einnahme des
  Quartals (`mitLiveSpenden`); der Handwert in `finanzierung_quartale` gilt dann nicht mehr. Quartale ohne Einträge behalten
  den Handwert. Fehlt die Quartalszeile, entsteht sie in der Rechnung mit 0 für alles andere. Eine Quelle je Quartal, nichts
  doppelt. Dasselbe gilt für die Spendensumme im Laufband (`lib/community.js`).
- **Demo:** zählt nie in Quartale, Rechnung oder Laufband. Die Live-Anzeige zeigt Demo-Spenden nur, solange es keine
  echten gibt und die Demo-Regel des Laufbands es erlaubt (`community_demo_partner_erlaubt`: dev/staging an, Produktion
  aus) – dann mit `demo: true` und dem Chip „Beispielzahlen“.

## Kosten-Kategorien und Anschub (Nachtrag des Betreibers)

- Laufende Posten haben eine Kategorie: Server & Technik · Druck & Material (Flyer, Karten) · Sonstiges (alte Zeilen:
  Technik).
- **Anschub (Vorleistung)**, Tabelle `finanzierung_vorleistungen` (`lib/finanzierungVorleistung.js`): einmalige,
  privat vorgestreckte Kosten (Betrag, Kategorie, Datum). Öffentlich: „Anschub (Druck & Material): 3.000 € – davon
  gedeckt: x €“.
- **Reihenfolge je Quartal** (`lib/finanzierungVerteilung.js`): Spenden decken 1. die Kosten des Quartals, 2. den offenen
  Anschub (fällig ab dem Quartal seines Datums, älteste zuerst), 3. erst der Rest ist Überschuss → Rücklage-Anteil
  (20/10/5/0 %) und Weitergabe. Der Anschub zählt in „Kosten bisher“/Saldo, nicht in die Jahreskosten.

## Schnittstellen

- `GET /api/finanzierung/live` (30 s cachebar): `summeMonat, summeJahr, summeGesamt, kostenMonat, deckungProzent,
  letzte[≤10] { betragCents, datum, erfasst, name, nachricht, quelle }, vorleistung, demo, stand`. Name/Nachricht nur
  bei `oeffentlich`.
- `GET /api/finanzierung/live/stream`: Server-Sent Events (`event: stand`), höchstens 100 Verbindungen (sonst 503),
  Herzschlag 25 s. Client: EventSource, sonst/bei Abbruch Nachfragen alle 60 s.
- Admin (requireAdmin, no-store, Protokoll ohne Inhalte): `GET/POST/PUT/DELETE /api/admin/spenden`,
  `POST/PUT/DELETE /api/admin/finanzierung/vorleistungen`.
- Webhook `POST /api/finanzierung/webhook/:quelle`: **404, solange `SPENDEN_WEBHOOK_SECRET` (≥ 16 Zeichen) fehlt.** Mit
  Secret: Kopf `X-Spenden-Signatur: sha256=<hex HMAC-SHA256 des rohen Bodys>`, Body
  `{ id, betragCents, datum?, anzeigename?, nachricht?, oeffentlich? }`, gleiche `id` nur einmal (200 `doppelt: true`).
  Ein Adapter je Anbieter übersetzt später dessen Format.

## Oberfläche

- `/finanzierung`: Block „Spenden live“ (SpendenLive.jsx) unter dem Grundsatz; Live-Region sagt nur eine geänderte
  Monatssumme an. „Stand“ zeigt Kategorien und Anschub.
- Admin: „Werbung & Messen › Spenden“ → Karte „Spenden erfassen“; „Finanzierung“ → Kategorie im Kosten-Formular und Karte
  „Anschub (Vorleistung)“.

## Offen

- Adapter für GoFundMe/PayPal, sobald ein Anbieter feststeht.
