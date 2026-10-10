# Phase M „Mein Revier“ – Schritt 1 (Plan, 11.10.2026)

Grundlage: `docs/superpowers/specs/2026-09-27-marketing-gutscheine-partner-design.md` (Abschnitt „Phase M“) und die
Entscheidungen des Betreibers vom 11.10.2026. Schritt 1: öffentliches Profil (Opt-in), Radar, Folgen mit dem Bereich
„Aus deinem Revier“, „ausblenden“ je Profil und eine Admin-Sperre. Kommentare, Melden und Admin-Moderation im Detail
folgen in Schritt 2.

## Grundsätze

- **Nur angemeldet:** jede Revier-Antwort verlangt eine Sitzung, deren Identität ein eigenes Zuhause ist (`art = 'zuhause'`).
  Besucher ohne Anmeldung, Partner-/Tierheim-Bereiche und Besuchs-Sitzungen (Gast) bekommen nichts.
  `Cache-Control: no-store` und `X-Robots-Tag: noindex` auf jeder Antwort; nichts davon steht in der Sitemap.
- **Instanz „rudel“** (`INSTANZ_MODUS=rudel`): `/api/revier` antwortet 404 wie ein unbekannter Pfad; der Client blendet
  den Reiter aus.
- **Opt-in:** sichtbar ist ein Profil nur mit `aktiv = 1`, gültiger PLZ, Zustimmung (`zustimmung_at`), ohne Admin-Sperre
  und nur für Sitzungen derselben Welt (Demo ↔ echt nie gemischt). Die Bedingung steckt in JEDER Abfrage
  (`lib/revier.js PROFIL_SICHTBAR_SQL`) – Ausschalten wirkt sofort überall (Radar, Profil, Feed, Fotos, Bild).
- **Standort:** gespeichert wird nur die PLZ. Nach außen gehen ausschließlich Entfernungsstufen
  (`unter5`, `5-10`, `10-25`, `25-50`; weiter weg erscheint gar nicht) und – nur mit „Ort zusätzlich zeigen“ – der
  Ortsname aus den GeoNames-Daten (`lib/geo.js lookupPlz`). Nie PLZ, Koordinaten, Kilometer oder Bereichs-Ids.
- **Ids:** Profile werden über einen zufälligen `slug` angesprochen; Bilder über `/api/revier/p/:slug/bild`
  (nicht `/api/profil/:id/bild`, das die Bereichs-Id trüge). Tier-Ids werden nach außen nicht genannt.
- **Gesundheit nie öffentlich:** Erinnerungen mit einer Gesundheits-Angabe (`gesundheit_eintraege`) oder der Kategorie
  `tierarzt` lassen sich nicht öffentlich schalten und werden beim Lesen zusätzlich ausgefiltert.
- **Eigentum über JOIN:** öffentliche Tiere nur mit `dogs.family_id = Profil-Bereich`, Erinnerungen nur mit
  `timeline_entries.family_id = Profil-Bereich`, `privat = 0`, Tier im Profil. Zieht ein Tier um, ist es sofort weg.

## Datenmodell (`server/lib/revier.js` legt die Tabellen selbst an – `db.js` wächst nicht)

| Tabelle | Spalten |
|---|---|
| `revier_profile` | `family_id` PK → families (CASCADE), `slug` UNIQUE, `aktiv`, `plz`, `zustimmung_at`, `anzeigename`, `text`, `ort_zeigen`, `follower_oeffentlich`, `gesperrt`, `created_at`, `updated_at` |
| `revier_tiere` | `dog_id` PK → dogs (CASCADE) – „im öffentlichen Profil zeigen“ |
| `revier_eintraege` | `entry_id` PK → timeline_entries (CASCADE) – dritte Sichtbarkeit „öffentlich“ |
| `revier_follows` | `id` PK, `follower_id` → families, `profil_id` → families (beide CASCADE), UNIQUE(follower, profil) |
| `revier_ausgeblendet` | `viewer_id`, `profil_id` (PK beide, CASCADE) – „für mich ausblenden“ |

Profil-Bereich: das eigene Zuhause (oder eine Familie, dort nur die Leitung – Server bereit, Client in Schritt 1 nur im
Zuhause unter Einstellungen › Wer sieht was).

## Endpunkte (`server/routes/revier.js`, eingehängt unter `/api/revier`; Admin in `server/routes/adminRevier.js`)

| Methode/Pfad | Zweck | Schutz |
|---|---|---|
| `GET /einstellungen` | eigenes Profil (inkl. eigener PLZ), Tiere mit Schalter, Zahl der Follower | Leitung, eigener Bereich |
| `PUT /einstellungen` | aktiv/plz/zustimmung/name/text/ortZeigen/followerOeffentlich; aktiv nur mit PLZ + Zustimmung | + Schreibsperre Demo/Admin-Ansicht, Schreib-Limit |
| `PUT /tiere` | `{ ids }` – Menge der öffentlichen Tiere (nur eigene, JOIN) | wie oben |
| `GET /eintraege` | Ids der eigenen als öffentlich markierten Erinnerungen | Leitung |
| `PUT /eintraege/:id` | `{ oeffentlich }` – nicht privat, nie Gesundheit | wie oben |
| `GET /vorschau` | „Mein Profil für andere“ – genau die öffentliche Form, auch vor dem Einschalten | Leitung |
| `GET /follower`, `DELETE /follower/:id` | eigene Follower sehen/entfernen | Leitung |
| `POST /radar` | `{ plz?, umkreis (5/10/25/50), tierart? }` – PLZ nur im Body; ohne PLZ die des eigenen Profils | Revier-Limit je Zuhause |
| `GET /p/:slug` (`?vor=`) | Profil mit Tieren, Erinnerungen (Seiten zu 10), Followern (Liste nur bei „öffentlich“) | sichtbar |
| `GET /p/:slug/bild` | Profilbild (bereich_profil.bild_file) | sichtbar |
| `POST/DELETE /p/:slug/folgen` | folgen/entfolgen | Folge-Limit, nicht das eigene |
| `POST/DELETE /p/:slug/ausblenden`, `GET /ausgeblendet` | für mich ausblenden/zurückholen | Folge-Limit |
| `GET /feed` (`?vor=`) | „Aus deinem Revier“: neueste öffentliche Erinnerungen gefolgter Profile | sichtbar |
| `GET /folge` | Profile, denen ich folge | – |
| `GET /api/admin/revier`, `PUT /api/admin/revier/:slug` | Liste, `{ gesperrt }` als Not-Aus | requireAdmin |

Fotos: `lib/uploadAccess.js canSeeUpload` lässt zusätzlich Tierfotos öffentlicher Tiere und Fotos öffentlicher
Erinnerungen sichtbarer Profile durch (`lib/revier.js isRevierPhoto`) – nur für Haushalts-Sitzungen derselben Welt.

## Client

- `Entdecken` bekommt den Reiter „Mein Revier“ (kein neuer Menüpunkt; nicht in der Kundensicht, nicht im Rudel-Modus):
  Unterreiter „In der Nähe“ (Radar mit Umkreis- und Tierart-Chips), „Aus deinem Revier“ (Feed, „Mehr zeigen“) und
  „Ich folge“. Profilseite `/revier/:slug` (angemeldet, `noindex`).
- Einstellungen › Wer sieht was: neue Ansicht „Öffentlich“ (Profil-Schalter, PLZ + Häkchen, Name, Text,
  Ort-Schalter, Follower öffentlich/privat und Liste mit „Entfernen“, Tier-Schalter + „Alle zeigen“, Knopf
  „Mein Profil für andere“). Unter „Erinnerungen“ eine dritte Stufe „Öffentlich“ samt Knopf.
- Admin › Inhalte & Freigaben › „Öffentliche Profile“: Liste mit „Ausschalten/Wieder zulassen“.
- Englisch in `client/src/lib/i18n/en/revier.js`.

## Demo

`lib/demoRevier.js` (in `replaceDemoPack`): fünf Demo-Zuhause rund um die Demo-PLZ (Hamburg-Vier- und Marschlande) mit
öffentlichem Profil, öffentlichen Tieren und Erinnerungen, dazu das Profil von „Zuhause am Deich“ und Folgen in beide
Richtungen. Nur `is_demo = 1`, idempotent (die alten Demo-Familien räumt `deleteFamily` samt CASCADE weg).

## Tests (zuerst geschrieben)

Server `test/revier.test.js`: nur angemeldet (401), Partner/Gast 403, Rudel-Instanz 404; Opt-in braucht PLZ + Häkchen;
Radar nur Stufen (Schlüssel-Liste: kein `plz`, `lat`, `lon`, `km`, `family_id`, `id` am Profil); Ort nur mit Schalter;
Gesundheit nie öffentlich (Schreiben 400, Lesen gefiltert); Ausschalten sofort unsichtbar (Profil 404, Radar leer, Feed
leer, Foto 404); Follower öffentlich vs. privat; Follower entfernen; Demo ↔ echt getrennt; Admin-Sperre; Rate-Limit
auf Folgen und Radar; Ausblenden.
Client: Reiter im Entdecken, Radar/Folgen, Feed, Einstellungen-Ablauf, Vorschau, englische Texte.
