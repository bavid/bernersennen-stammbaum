# Phase G – Eigene Domain und Go-Live Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans. Schritte mit 🧑 macht **nur der Betreiber** oder sie brauchen seine ausdrückliche
> Freigabe: Domainkauf, DNS, Proxy/Firewall auf dem Server, Admin-Passwort, Prod-Deploy.

**Goal:** Alles zieht unter eine eigene Domain (zum Beispiel `familieaufpfoten.de`). Prod läuft mit dem auf der
Vorschau freigegebenen Stand, und danach werden Karten gedruckt (Kunden, Partner, Partner-Stapel).

**Architecture:**
- **Proxy:** Der vorhandene Caddy-Proxy auf dem Server (`/opt/proxy`) bekommt Site-Blöcke für die Domain mit
  automatischem Let's-Encrypt-Zertifikat. Die App-Instanzen bleiben auf `127.0.0.1:3010` (Prod) und
  `127.0.0.1:3005` (Vorschau).
- **App:** Sie kennt ihre öffentliche Adresse über `PUBLIC_URL` (schon in `server/config.js`) bzw. `DEPLOY_DOMAIN`
  (schon in `deploy/remote.sh` und `manage.ps1`).

**Voraussetzung:** Die Phasen bis 5 sind auf der Vorschau abgenommen.

---

### Task 1: Entscheidungen und Kauf 🧑

- [ ] Markenrecherche „Familie auf Pfoten“ beim DPMA bzw. EUIPO (Konzept, Frage 18).
- [ ] Die Domain über die DENIC-Abfrage prüfen und kaufen. Hauptdomain plus Weiterleitungsdomains, zum Beispiel
  `familie-auf-pfoten.de`.
- [ ] Die Vorschau-Adresse festlegen, Vorschlag `vorschau.<domain>`, optional mit Basic-Auth.
- [ ] Die Kontakt-E-Mail unter der Domain einrichten (Postfach beim Registrar). Sie wird für das Impressum
  gebraucht.

### Task 2: App für die Domain vorbereiten (Code, auf `staging`)

**Files:** `server/config.js`, `server/app.js`, neu `client/public/robots.txt` bzw. eine Server-Route,
`deploy/remote.sh`, `.deploy.env.example`, `.deploy.staging.env.example`, README

- **`PUBLIC_URL`** wird überall genutzt, wo absolute Links entstehen: QR-Ziele der Druckseite, Portal- und
  Steckbrief-Links zum Teilen, `og:url`. Fehlt `PUBLIC_URL`, wird wie bisher relativ gearbeitet.
- **HTTPS-Absicherung, wenn `PUBLIC_URL` mit `https://` beginnt:**
  - HSTS-Header `max-age=31536000` (ohne `preload`, bis alles stabil ist);
  - Cookies `Secure` und `SameSite=Lax` (prüfen, ob schon so).
- **Suchmaschinen:**
  - `robots.txt`: Portale `/p/` dürfen indexiert werden. `/t/` (Steckbriefe) bleibt `noindex` per Meta-Tag, wie
    heute.
  - Admin, API und `/v` sind gesperrt.
- **`remote.sh`:**
  - Ist `DEPLOY_DOMAIN` gesetzt, gibt der Deploy den fertigen Caddy-Block als Text aus, damit der Betreiber ihn
    einfügen kann (siehe Task 3).
  - Der Deploy ändert **nichts** an `/opt/proxy`.
- **Tests:** HSTS nur mit https-`PUBLIC_URL`; `robots.txt`; QR-Ziel mit `PUBLIC_URL`.

- [ ] Commit: `feat: Domain-Unterstützung – PUBLIC_URL für Links und QR-Codes, HSTS, robots.txt`

### Task 3: Proxy und DNS 🧑

- [ ] DNS: A- und AAAA-Einträge der Domain (und `vorschau.`) auf den Server setzen.
- [ ] Den Caddy-Block in `/opt/proxy/Caddyfile` einfügen (Vorlage aus Task 2):

  ```
  familieaufpfoten.de {
    encode zstd gzip
    reverse_proxy 127.0.0.1:3010
  }
  www.familieaufpfoten.de, familie-auf-pfoten.de {
    redir https://familieaufpfoten.de{uri} permanent
  }
  vorschau.familieaufpfoten.de {
    encode zstd gzip
    reverse_proxy 127.0.0.1:3005
  }
  ```

- [ ] Die Firewall für Port 80 und 443 öffnen, falls noch zu. Der Betreiber entscheidet, ob die Ports 3010/3005
  danach geschlossen werden.
- [ ] Caddy neu laden und die Zertifikate prüfen.
- [ ] Die alte Adresse `IP:3010` leitet per Caddy auf die Domain weiter.

### Task 4: Go-Live 🧑 (mit Freigabe)

- [ ] **Prod-Backup:** `manage.ps1` → Backup, lokal sichern.
- [ ] **Prod-`.env`:**
  - `CODE_PEPPER` setzen (einmalig, nie wieder ändern);
  - `PUBLIC_URL=https://<domain>`;
  - `IMPRESSUM_*`;
  - `APP_ENV=production` bzw. leer.
- [ ] **Admin-Passwort** auf Prod setzen (`manage.ps1` → [10]). Das Passwort gibt nur der Betreiber ein.
- [ ] **Übernehmen:** den auf der Vorschau getesteten Stand nach Prod übernehmen (`manage.ps1` → [12], prüft das
  SHA). Vorher der Merge `staging` → `main` per PR.
- [ ] **Rauchtest:**
  - Login mit Bestandsrudel (altes Passwort);
  - Demo;
  - Gutschein einlösen (Test-Gutschein aus einem Admin-Stapel, danach widerrufen);
  - Partnerliste, Steckbrief, Impressum und Datenschutz.
- [ ] **Vorschau:** `PUBLIC_URL` auf `https://vorschau.<domain>`, sie bleibt die Präsentations-Instanz.

### Task 5: Karten drucken (nach Go-Live)

- [ ] Die Druckseite aus Phase 5 mit der echten Domain prüfen: QR-Code scannen, dann Einlösen am Handy.
- [ ] Stapel anlegen:
  - Kunden-Karten;
  - Partner-Zugänge (je Partner-Typ);
  - Partner-Stapel für die ersten Partner.
- [ ] Probedruck (85×55 mm), danach die Auflage drucken.
- [ ] Die Roadmap abschließen.

---

### Task 6: Sicherheit und Betrieb (DevOps) – Zusatz 30.09.

**Server heute (30.09.):**
- 2 CPU-Kerne, 3,7 GB RAM (2,8 GB frei), 38 GB SSD (16 % belegt), Ubuntu 26.04 LTS.
- Last ~0,1; die Apps brauchen je ~35 MB RAM.
- Daten: Prod 56 MB, Vorschau 20 MB.
- Der Server wird mit einem weiteren Projekt geteilt (~130 MB RAM, ~3 % CPU).

**Sicherheit vor dem Go-Live:**
- **Updates:** `unattended-upgrades` für Sicherheits-Updates, Neustart-Fenster nachts. Docker-Images monatlich neu
  bauen (Node-Basis-Image).
- **SSH:** nur Schlüssel, kein Passwort-Login, eigener Deploy-Nutzer statt root, `fail2ban`. Firewall wie bisher
  nur 22/80/443 (+ App-Ports bis zur Domain).
- **Abhängigkeiten:** `npm audit` (Server + Client) vor jedem Prod-Deploy; kritische Funde beheben.
- **Geheimnisse:** `CODE_PEPPER`, JWT-Secret und Admin-Passwort-Hash liegen nur in der Server-`.env` (Rechte 600).
  Den Pepper zusätzlich außerhalb des Servers sichern (Passwort-Manager). Geht er verloren, sind offene Codes und
  der Telegram-Token nicht mehr lesbar.
- **Header prüfen:** CSP, HSTS mit Domain, Referrer-Policy, Permissions-Policy. Rate-Limits bleiben aktiv.
- **Admin:** starkes Passwort, später optional ein zweiter Faktor (TOTP).

**Backups:**
- Täglich (bisher nur vor Deploys): DB per SQLite-Online-Backup plus Uploads, 14 Tage aufheben.
- Wöchentlich zusätzlich außerhalb des Servers: verschlüsselt auf einen Speicher-Dienst in der EU oder per
  `manage.ps1` auf den eigenen Rechner.
- Die Wiederherstellung einmal testen (in die Vorschau einspielen).

**Überwachung:**
- Health-Check von außen alle 5 Minuten; bei Ausfall eine Telegram-Nachricht an den Admin (vorhandener Bot).
- Optional ein täglicher Kurzbericht per Telegram: Anfragen, neue Bereiche, Plattenplatz, Backup ok.
- Warnschwellen per Telegram:
  - Platte über 70 %;
  - RAM dauerhaft über 80 %;
  - Last dauerhaft über 1,5 (bei 2 Kernen);
  - Antwortzeit der Startseite über 1 s.

**Admin-Reiter „Server“ (Wunsch 30.09.):**
- **Anzeige** im Admin, jeweils mit Ampel nach den Warnschwellen oben:
  - **Arbeitsspeicher:** gesamt, frei, davon die App.
  - **Speicherplatz:** gesamt und frei auf dem Laufwerk der Daten.
  - **Größe:** Datenbank, Fotos (`uploads`, `public-media`, `partner-media`), Backups.
  - **Last:** CPU-Kerne und Last (1/5/15 min).
  - **Laufzeit:** Server und App.
  - **Stand:** App-Version (Commit), letztes Backup.
- **Messwerte:**
  - im Container über Node: `os.totalmem`/`os.freemem`/`os.loadavg`/`os.uptime`, `fs.statfs` auf dem
    Daten-Verzeichnis, `process.memoryUsage`;
  - Ordnergrößen einmal pro Stunde berechnet und zwischengespeichert, nie pro Aufruf;
  - das letzte Backup über eine Markierungsdatei, die `remote.sh backup` ins Daten-Verzeichnis schreibt.
- **Verlauf:** stündliche Messung, 30 Tage aufbewahrt, als kleine Linien (Speicher frei, Platte frei, Last) mit
  Textalternative.
- **Warnungen:** beim Überschreiten der Schwellen per Telegram an den Admin (vorhandener Bot, eigener Schalter
  „Server-Warnungen“, höchstens eine Warnung je Messwert und Tag).
- **Sicherheit:** nur Admin, `no-store`, keine Pfade oder Hostnamen im Klartext nach außen.
- Tests mit gestubbten Messwerten (Ampel-Grenzen, Verlauf, Warn-Drosselung).

**Wann aufrüsten (Richtwerte):**
- **RAM 4 → 8 GB:** wenn der freie Speicher dauerhaft unter 1 GB fällt oder der Server auslagert. Grob ab einigen
  tausend aktiven Bereichen oder wenn weitere Projekte dazukommen.
- **CPU 2 → 4 Kerne:** wenn die Last über Stunden über 1,5 liegt oder Uploads bzw. die Collage spürbar langsam
  werden.
- **Platte:** ab ~70 % Belegung. Größter Treiber sind Fotos: 1.000 aktive Familien mit je ~200 Fotos à 300 KB
  ergeben ≈ 60 GB. Dann eine größere Platte oder die Fotos auf einen S3-kompatiblen Speicher in der EU.
- **Datenbank:** SQLite reicht für diese Größenordnung (eine Instanz, wenige gleichzeitige Schreibzugriffe).
  PostgreSQL erst bei mehreren Server-Instanzen.
- **Eigene Maschine** für Familie auf Pfoten statt des geteilten Servers: spätestens mit dem Go-Live einplanen, damit
  Wartung am anderen Projekt die Vorschau und Prod nicht trifft.
