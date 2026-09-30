# Phase V – Freunde, „Erlebt mit“, Partner-Karten, Kalender und Collage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Grundlage:** Rückmeldungen des Betreibers vom 29./30.09. nach dem Test der Vorschau (Screenshot „Hundeschulen“ in
Entdecken: eine Hundeschule wirkt wie drei verschiedene Anbieter).

**Regeln:** wie in allen Phasen – Branch `staging`, nicht pushen, kein Trailer, nur eigene Dateien stagen, keine
Worktrees; keine echten Namen (pre-commit-Hook); jede Funktion auch in der Demo; Datenschutz vor Bequemlichkeit.

**Vorgeschlagene Reihenfolge:** V1 → V2 → V3 → V4 → V5 → V6 → V7 (danach Hinweis-Banner aus Phase N Task 5 und
„Mein Revier“ aus Phase M).

---

## V1 – Entdecken: ein Partner = eine Karte, PLZ dezent

- **Eine Karte je Partner** (Hundeschule, Salon, Tierheim …) statt Partner-Karte + einzelne Anzeigen-Karten:
  1. Kopf: Logo, Name, Kurzbeschreibung, „Partner“-Merkmal, Knöpfe „Zum Portal“ und „Website“.
  2. Darunter 1–3 Anzeigen des Partners (freigegebene Beiträge) – kompakt, je Platz; Kennzeichnung „Anzeige“ bleibt.
  3. Darunter die angepinnten Ereignisse/Einblicke oder, wenn nichts angepinnt ist, die letzten drei.
- **Reihenfolge durch den Partner:** Im Partner-Bereich legt der Partner fest, welche Anzeigen in welcher
  Reihenfolge erscheinen (Ziehen oder Pfeile) und welche Einblicke/Ereignisse angepinnt sind (höchstens 3). Der
  Admin kann ebenfalls anpinnen (überstimmt den Partner).
- Empfehlungen ohne Partner (Futter, Unterstützen) bleiben eigene Karten.
- **PLZ dezent:** Entdecken öffnet sofort mit Inhalten (gespeicherte PLZ oder „überall“). Oben nur eine kleine Zeile
  „In der Nähe von 20095 Hamburg · ändern“; das Eingabefeld erscheint erst nach „ändern“ (auch auf `/partner` und
  `/umgebung`).
- Tests + Demo (Pfotenglück mit zwei Anzeigen, angepinntem Einblick; Wuschelglück entsprechend).

## V2 – Zuhause besuchen und „Erlebt mit“

- **„Jemanden in mein Zuhause einladen“:** Code (Gutschein-Format) mit **7 Tagen Gültigkeit**, einmalig einlösbar.
- **„Ein anderes Zuhause besuchen“:** Code einlösen → Besuchs-Verbindung zwischen zwei Zuhausen. Besucher sehen die
  nicht-privaten Tiere und Einträge des anderen Zuhauses und dürfen **kommentieren**; nichts bearbeiten. Beide
  Seiten können die Verbindung jederzeit beenden. Wechsel über den Bereichswechsler („Zu Besuch bei …“).
- **„Erlebt mit“:** Beim Anlegen einer Erinnerung Tiere aus befreundeten Zuhausen/Familien markieren.
  - Die markierte Seite bekommt eine **Anfrage** („Wilma war dabei – übernehmen?“). Erst nach Bestätigung erscheint
    der gespiegelte Eintrag („erlebt mit Balu“) in der Chronik ihres Tiers; ablehnen entfernt die Markierung.
  - Die Rückrichtung braucht keine Bestätigung: Der eigene Eintrag zeigt sofort „erlebt mit Wilma“.
  - Fotos des Eintrags sind für die markierte Seite sichtbar, solange die Verbindung besteht.
- **Demo:** zwei Demo-Zuhause mit Besuchs-Verbindung, ein bestätigter und ein offener „Erlebt mit“-Eintrag; **mehr
  Fotos** in der Demo, z. B. mehrere Einträge mit Bildern bei „Balu“ (nicht nur das Profilbild).

## V3 – Familienbande: erst Familien, Baum nach Verpaarung

- Standard-Auftritt: die Ebenen heißen **„Familien“** statt „Generationen“ (mehrere Familien-Verbindungen).
- Der Generationen-Baum ist ein **Zusatz**: Er wird erst aktiv, wenn eine Verpaarung eingetragen ist; dann erscheint
  „Stammbaum öffnen“. Vorher zeigt die Familienbande Tiere, Mitbewohner und Verbindungen ohne Generationen.
- Berner-Auftritt unverändert. Demo anpassen.

## V4 – Partner: Kalender, Termine, Anpinnen, Kontakt, Telegram

- **Kalender für Partner** (Hundeschulen, Tierheime, Salons):
  - Termine mit Titel, Text, Ort, Uhrzeit; **Serien**: wöchentlich, alle 2 Wochen, „jeden 2. Samstag“, monatlich;
    höchstens 1 Jahr; einzelne Termine einer Serie absagen.
  - Beiträge/Anzeigen mit **mehreren Zeiträumen** (z. B. „Tag der offenen Tür“ am 1.1., 1.2., 1.3. und 5.5.–10.5.).
  - Übersicht aller Termine im Partner-Bereich; **öffentlich** auf dem Portal (Liste nach Monat) und in der
    Partner-Karte in Entdecken (nächster Termin).
- **Einblicke anpinnen** (siehe V1).
- **Kontakt:** Ansprechpartner-Name und 1–2 Bannerfotos für den Portal-Kopf.
- **Telegram für Partner:** Partner verbinden ihren Telegram-Chat mit dem Bot der Plattform („Mit Telegram
  verbinden“ → Link `t.me/<bot>?start=<Einmal-Code>`), Schalter je Ereignis (neue Nachricht über „Schreib uns“,
  Freigabe/Ablehnung eines Beitrags), „Testnachricht senden“. Ohne personenbezogene Daten im Standard.

## V5 – Visitenkarten-Designer für Partner

- Karten im Visitenkartenformat mit Logo, Farbe, Name, Kurztext, QR-Code zum Portal; optional mit einem
  Kunden-Gutschein je Karte (aus dem eigenen Kunden-Stapel).
- Vorlagen (2–3 Layouts), Vorschau, Druckbogen A4 (wie die Admin-Druckseite), Vorder-/Rückseite.

## V6 – Collage: Vorlagen, Layouts, Hintergründe, Sticker

- Je Seite eine Vorlage/Layout wählbar (Raster 2×2, groß + klein, Polaroid, Zeitstrahl …).
- Hintergründe (Pfoten, Herzen, Papier) und **Sticker/Emojis** aus einer freien Bibliothek mit passender Lizenz
  (bevorzugt **Fluent Emoji (MIT)**; lokal gebündelt, keine externen Aufrufe). Lizenzhinweis im README.
- Export wie bisher (PNG, A4).

## V2b – Eigene Einladungen verwalten (Wunsch 30.09.)

- **Obergrenze:** Eine Privatperson (ein Zuhause) hat höchstens **5 offene**, also nicht eingelöste
  Einladungs-Codes gleichzeitig. Gilt für Familien-Einladungen, Zuhause-Besuche und Kunden-Gutscheine zum
  Weitergeben zusammen. Ein neuer Code geht erst, wenn einer eingelöst, zurückgezogen oder abgelaufen ist.
  Serverseitig durchgesetzt.
- **Beschriftung:** Jeder Code bekommt eine eigene Notiz, z. B. „…7420 – Tante Matilde“. Nur der Ersteller sieht sie.
- **Offene Codes** lassen sich zurückziehen und löschen (mit Bestätigung).
- **Eingelöste Codes** werden archiviert und ausgeblendet. „Eingelöste anzeigen“ blendet sie wieder ein, dazu die
  Zahl „Du hast schon n Leute zu Familie auf Pfoten gebracht“.
- Demo: Liste mit zwei beschrifteten offenen und drei archivierten Codes.

## V7 – Prüfen und ausliefern

- Reviews (Sicherheit bei Besuchen, Markierungen und öffentlichen Terminen), Browser-Prüfung, Demo zurücksetzen,
  Deploy, Roadmap.
