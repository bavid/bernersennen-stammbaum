# Phase N – Anfragen und Benachrichtigungen (Telegram) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- Besucher können auf der Seite einen **Gutschein anfragen** („Ich habe die Seite gesehen und möchte einen
  Gutschein“) – mit gültiger E-Mail als Pflicht.
- Hundeschulen, Tierheime & Co. können einen **Partner-Zugang anfragen**.
- Der Admin bekommt **Telegram-Benachrichtigungen**, je Ereignis ein-/ausschaltbar: Gutschein-Anfrage,
  Partner-Anfrage, neue Registrierung (neuer Bereich), Feedback („Schreib dem Admin“), eingereichter Partner-Beitrag.
- Der Admin sieht und bearbeitet Anfragen im Admin und kann einer Gutschein-Anfrage direkt einen offenen Code
  zuweisen (zum Kopieren – wir versenden keine E-Mails).

**Grundlage:** [Konzept](../specs/2026-09-27-marketing-gutscheine-partner-design.md), Abschnitt „Phase N“.

**Datenschutz-Grundsatz:** Telegram ist ein externer Dienst. Standard: Nachrichten ohne personenbezogene Daten
(„Neue Gutschein-Anfrage – im Admin ansehen“). Ein eigener Schalter „Details mitsenden“ (aus) nimmt Name/E-Mail
bzw. Bereichsname mit. Die Datenschutzseite erklärt beides. Bot-Token und Chat-ID stehen nur in der `.env` auf dem
Server, nie im Repo.

**Regeln:** Branch `staging`, nicht pushen, kein Trailer, nur eigene Dateien stagen, keine Worktrees; keine echten
Namen (pre-commit-Hook); Demo: Formulare sichtbar, in Demo-Sitzungen kein Versand.

---

### Task 1: Anfragen (Server)

- Tabelle `anfragen (id, typ 'gutschein'|'partner', name, email, nachricht, firma, partner_typ, plz, status
  'offen'|'erledigt'|'abgelehnt', notiz, voucher_id, created_at, erledigt_at)`.
- `POST /api/public/anfragen { typ, name?, email, nachricht?, firma?, partnerTyp?, plz?, website }`:
  - Honeypot `website`, eigener Limiter (3/Stunde/IP, IPv6-Maske), Längengrenzen, Steuerzeichen entfernen, kein HTML.
  - **E-Mail Pflicht und gültig:** Format prüfen, dann Domain per DNS (`dns.promises.resolveMx`, sonst `resolve4`/
    `resolve6`, Zeitlimit 3 s). Ohne MX/A/AAAA → 400 „Diese E-Mail-Adresse scheint es nicht zu geben.“ DNS-Fehler
    durch Zeitüberschreitung → annehmen (nicht blockieren), im Test über einen injizierbaren Resolver.
  - Typ `partner`: `firma` Pflicht, `partnerTyp` aus `TYP_VALUES` (Züchter-Schutz auf Firma/Nachricht), `plz`
    optional (geprüft, wenn angegeben).
  - Doppelte offene Anfrage derselben E-Mail und desselben Typs innerhalb 24 h → 200 ohne neue Zeile (kein Spam im
    Admin), Antwort gleich.
  - Antwort 201 `{ ok: true }`, nie ein Echo.
  - Aufbewahrung: erledigte/abgelehnte Anfragen nach 180 Tagen löschen, offene nach 365 Tagen (täglicher Lauf wie bei
    den Partner-Nachrichten).
- Admin: `GET /api/admin/anfragen?status=`, `PUT /api/admin/anfragen/:id { status, notiz }`,
  `POST /api/admin/anfragen/:id/gutschein { batchId }` → nimmt einen offenen, noch nicht zugewiesenen Code aus dem
  Stapel (Kunden-Gutschein bzw. für Partner-Anfragen einen Partner-Zugang), merkt `voucher_id`, setzt `erledigt`,
  liefert den Code einmalig (`no-store`) zum Kopieren; `vouchers` bekommt `zugewiesen_an_anfrage_id`, damit ein Code
  nicht zweimal vergeben wird. `DELETE /api/admin/anfragen/:id`.
- Tests: Validierung, MX-Prüfung mit Stub-Resolver (gültig, ungültig, Zeitüberschreitung), Honeypot, Limiter,
  Duplikat-Schutz, Admin-Liste/Status/Zuweisung (Code nur einmal, `no-store`), Aufbewahrung.

### Task 2: Telegram-Benachrichtigungen (Server)

- `server/lib/notify.js`: `notify(ereignis, daten)` → prüft Einstellungen, baut Text, sendet asynchron (kein Warten im
  Request), höchstens 3 Versuche mit Pause, Fehler nur als Zeile ohne Inhalt geloggt. Versand über den vorhandenen
  SSRF-geschützten HTTP-Client (`lib/http.js`) mit `api.telegram.org` auf der Allowlist; `POST /bot<TOKEN>/sendMessage`
  mit `chat_id`, `text`, `disable_web_page_preview`.
- Konfiguration: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` aus der Umgebung (fehlen sie, ist der Versand aus; der
  Admin sieht „nicht eingerichtet“). Token nie loggen, nie an den Client geben.
- Einstellungen (Tabelle `settings`): `notify_gutschein_anfrage`, `notify_partner_anfrage`, `notify_registrierung`,
  `notify_feedback`, `notify_beitrag`, `notify_details` (alle aus, außer die ersten vier an). Demo-Sitzungen lösen
  nie etwas aus.
- Ereignisse verdrahten: neue Anfrage (Task 1), Einlösen eines Gutscheins (neuer Bereich; Partner-Zugang als eigener
  Text), `POST /api/messages` (Feedback), eingereichter Partner-Beitrag.
- Admin: `GET/PUT /api/admin/notify-settings`, `POST /api/admin/notify-test` (sendet „Testnachricht von Familie auf
  Pfoten“), Status `eingerichtet: bool`.
- Tests: Einstellungen, Text ohne/mit Details, kein Versand ohne Token, kein Versand für Demo, Retry mit Stub,
  Token nie im Log/in Antworten.

### Task 3: Oberfläche (Client)

- Login-Seite und `/partner-werden`: Karte „Noch keinen Gutschein?“ mit Formular (Name optional, E-Mail Pflicht,
  Nachricht optional, Honeypot) bzw. „Partner-Zugang anfragen“ (Firma, Typ, PLZ optional, E-Mail, Nachricht).
  Erfolg: „Danke! Wir melden uns per E-Mail.“ Fehlertexte vom Server, Fokus auf den ersten Fehler.
- Admin: Reiter „Anfragen“ (Zähler offen): Liste mit Typ, Name/Firma, E-Mail (mailto), Nachricht, Datum, Status,
  Notiz; „Gutschein zuweisen“ (Stapel wählen → Code einmal anzeigen mit Kopieren-Knopf und einer vorformulierten
  E-Mail zum Kopieren), „Erledigt“, „Ablehnen“, „Löschen“.
- Admin: Karte „Benachrichtigungen“: Status Telegram, Schalter je Ereignis, „Details mitsenden“, „Testnachricht“.
- Datenschutzseite: Abschnitt „Anfragen“ (was, wofür, wie lange) und „Benachrichtigungen des Betreibers“ (Telegram,
  standardmäßig ohne personenbezogene Daten).
- Tests: Formulare, Admin-Liste und Zuweisung, Benachrichtigungs-Karte, Datenschutz-Text.

### Task 4: Einrichtung und Auslieferung (Koordinator + Betreiber)

- 🧑 Betreiber: Bot bei @BotFather anlegen, Token und eigene Chat-ID ermitteln (Nachricht an den Bot, dann
  `getUpdates`), beide in die `.env` der Vorschau bzw. von Prod eintragen (`manage.ps1` bekommt dafür einen
  Menüpunkt, der die Werte abfragt und per `env_default`/Ersetzen setzt, ohne sie anzuzeigen).
- Review (Sicherheit: Token, SSRF-Allowlist, Personendaten), Browser-Prüfung, Deploy.
