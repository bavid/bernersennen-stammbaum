# Admin: 5 Reiter mit Unterreitern (2026-10-10)

Ziel: Die 13 Reiter im Admin (Leiste scrollt selbst bei 1440 px seitwärts) und der Sammelreiter „Empfehlungen“
(4 fremde Abschnitte, 4,8 Bildschirme bei 1440) werden zu **5 Hauptreitern** mit **Unterreitern** (zweite TabBar).
Jeder Unterreiter hält ein Thema, Ziel ≤ ~2,5 Bildschirme bei 1440. Karten bleiben unverändert.

## Bestand vorher (Höhe bei 1440 × 900, Bildschirme)

| alter Reiter (`?tab=`) | Abschnitte (Karten) | Höhe |
|---|---|---|
| `uebersicht` Übersicht | Zu tun · Kennzahlen (AdminStats: Kacheln + Code-Stapel, Partner-Ranking, Mundpropaganda, Klicks, Partner-Status) · Erfolg messen (AdminKpi) · Bestand | 2,5 |
| `anfragen` Anfragen | AdminAnfragen (Gutschein, Partner-Zugang) | 1,0 |
| `freigaben` Freigaben | AdminPostApproval | 1,0 |
| `gutscheine` Einladungscodes | AdminVouchers | 2,1 |
| `partner` Partner | AdminPartners (Liste, Freigabe, Sperre, Vertrauen) | 1,4 |
| `empfehlungen` Empfehlungen & Spenden | AdminPromotions · AdminCommunityBanner (Band „Mit dabei“) · AdminSupport (Unterstützen & Spenden) · AdminLandeadressen | 4,8 |
| `familien` Familien | AdminFamilyList | 1,9 |
| `nachrichten` Nachrichten | AdminMessages | 1,0 |
| `hinweise` Hinweise | AdminHinweise | 1,0 |
| `finanzierung` Finanzierung | AdminFinanzierung (Hinweis/Ziel, Quartale, Kosten & Reserve) | 2,5 |
| `einstellungen` Einstellungen | AdminNotify (Telegram) · AdminEinladungskarte (Rückseite) | 2,1 |
| `server` Server | AdminServer | 1,6 |
| `protokoll` Protokoll | AdminLog (Protokoll der Admin-Ansicht) | 1,0 |

Server-Status steht heute nicht in der Übersicht – bleibt unter System.

## Neue Struktur (`?tab=<haupt>&bereich=<unter>`)

| Hauptreiter | Unterreiter (`bereich`) | Inhalt |
|---|---|---|
| `uebersicht` Übersicht | `ueberblick` Auf einen Blick | Zu tun · Kennzahlen (nur Kacheln) · Bestand |
| | `erfolg` Erfolg messen | AdminKpi |
| `familien-partner` Familien & Partner | `familien` Familien | AdminFamilyList |
| | `partner` Partner | AdminPartners |
| | `anfragen` Anfragen | AdminAnfragen (Zähler) |
| | `gutscheine` Einladungscodes | AdminVouchers |
| | `einladungskarte` Einladungskarte | AdminEinladungskarte |
| `inhalte` Inhalte & Freigaben | `freigaben` Freigaben | AdminPostApproval (Zähler) |
| | `nachrichten` Nachrichten | AdminMessages (Zähler) |
| | `hinweise` Hinweise | AdminHinweise |
| `werbung` Werbung & Messen | `empfehlungen` Empfehlungen | AdminPromotions |
| | `band` Band „Mit dabei“ | AdminCommunityBanner |
| | `landeadressen` Landeadressen | AdminLandeadressen |
| | `statistik` Statistik | AdminStats-Blöcke (Code-Stapel, Partner-Ranking, Mundpropaganda, Klicks, Partner-Status) |
| | `spenden` Spenden | AdminSupport |
| | `finanzierung` Finanzierung | AdminFinanzierung |
| `system` System | `server` Server | AdminServer |
| | `benachrichtigungen` Benachrichtigungen | AdminNotify |
| | `protokoll` Protokoll | AdminLog |

Entscheidungen:
- **Finanzierung → Werbung & Messen**: die Karte pflegt die öffentliche Seite „So finanzieren wir uns“ (Spenden-Hinweis,
  Ziel, Quartale, Kosten) – Transparenz nach außen, wie „Spenden“ (AdminSupport). Mit Server/Telegram hat sie nichts zu tun.
- **Protokoll → System**: es protokolliert, wann der Admin in einen Bereich geschaut hat (Rechenschaft), keine Inhalte.
- **Einladungskarte → Familien & Partner**: die Rückseite der Karten, die Partner mit Einladungscodes verteilen (Onboarding).
- **Kennzahlen geteilt**: AdminStats bekommt `teil` (`kennzahlen` = Kacheln für die Übersicht, `details` = Blöcke für
  Statistik, ohne Angabe wie bisher alles). Der Karteninhalt selbst ändert sich nicht.
- Bausteine/Präsentation bleiben als Links im Kopf (eine Stelle, keine Doppelung).
- Zähler: Hauptreiter zeigen die Summe ihrer Unterreiter (Familien & Partner = Anfragen, Inhalte = Freigaben + Nachrichten).

## Alte Links (`?tab=<alt>`) → neues Paar

| alt | neu |
|---|---|
| (ohne) / `uebersicht` | `uebersicht` / `ueberblick` |
| `anfragen` | `familien-partner` / `anfragen` |
| `freigaben` | `inhalte` / `freigaben` |
| `gutscheine` | `familien-partner` / `gutscheine` |
| `partner` | `familien-partner` / `partner` |
| `empfehlungen` | `werbung` / `empfehlungen` |
| `familien` | `familien-partner` / `familien` |
| `nachrichten` | `inhalte` / `nachrichten` |
| `hinweise` | `inhalte` / `hinweise` |
| `finanzierung` | `werbung` / `finanzierung` |
| `einstellungen` | `system` / `benachrichtigungen` |
| `server` | `system` / `server` |
| `protokoll` | `system` / `protokoll` |

Unbekannter `tab` → Übersicht; unbekannter/fremder `bereich` → erster Unterreiter des Hauptreiters. Links in den Code:
nur „Zu tun“ (AdminOverview: `anfragen`, `freigaben`, `nachrichten`) – läuft über dieselbe Zuordnung. AdminViewBanner,
AdminPresentPage, AdminPrintPage, Bausteine verlinken nur `/admin` (ohne Reiter); der Server verlinkt keine Admin-Reiter.

## Umsetzung

1. `lib/adminTabs.js`: `ADMIN_SECTIONS` (Haupt + Unter), `LEGACY_TABS`, `resolveAdminTab(tab, bereich)`,
   `adminTabParams`, Zähler je Haupt-/Unterreiter.
2. `hooks/useAdminTab.js`: `{ tab, bereich }` aus der Adresse; Wechsel ersetzt den Verlaufseintrag; Hauptreiter merkt sich
   den zuletzt gewählten Unterreiter.
3. `pages/AdminPage.jsx` + `components/AdminSection.jsx` (Haupt-Panel mit Unter-TabBar) + `components/adminCards.jsx`.
4. Stil: `.admin-subtabs` (Pillen-Leiste, wie `.segmented`) in `styles/admin.css`.
5. Texte in `t()`, Englisch in `lib/i18n/en/admin.js`.
6. Tests: AdminPage (Struktur, Unterreiter, Tastatur, Zu tun), `lib/adminTabs.test.js` (Zuordnung, Adresse).
