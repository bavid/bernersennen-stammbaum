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
