# Server-Härtung Schritt 1 – Anleitung für den Betreiber

Diese Skripte setzen **Schritt 1** aus [docs/superpowers/plans/2026-10-04-devops-sicherheit.md](../../docs/superpowers/plans/2026-10-04-devops-sicherheit.md)
um: Firewall, SSH, automatische Updates, CrowdSec, Docker-Härtung, Sicherung außer Haus und eine Wiederherstellungs-Probe.
Alles läuft **auf dem heutigen Server** und **nur, wenn du es startest**. Kein Skript ruft ein anderes auf, keines
läuft von allein, keines fasst `/opt/proxy` (den gemeinsamen Caddy) oder das andere Projekt an.

Die Server-Adresse steht hier nirgends – überall, wo sie gebraucht wird, steht `$DEPLOY_HOST` (deine `.deploy.env`).

## Grundregeln

1. **Erst `--check`, dann ohne.** Jedes Skript hat einen Prüfmodus, der nur zeigt, was es tun würde (`würde: …`),
   und nichts ändert. Ohne `--check` schreibt es `ändere: …` für jede Änderung und `ok: …` für alles, was schon passt.
2. **Idempotent.** Jedes Skript darf beliebig oft laufen – was schon stimmt, bleibt unangetastet.
3. **Zweites Terminal.** Bei Block 1 (Firewall) und Block 2 (SSH) immer eine zweite SSH-Sitzung offen halten, bis die
   neue Verbindung getestet ist. Offene Sitzungen überleben jede Änderung hier (sshd wird nur neu geladen).
4. **Reihenfolge:** 01 → 02 → 03 → 04 → 05 → 06 → 07. Zwischen den Blöcken darf Zeit vergehen; `check.sh` zeigt jederzeit
   den Stand.
5. **Freigabe.** Alles, was den Server, Kosten (Storage Box) oder den Proxy berührt, entscheidest du – die Skripte
   bereiten nur vor und schlagen vor.

## Vorbereitung (einmal)

Vom eigenen Rechner (PowerShell, im Repo-Ordner; `$DEPLOY_HOST` aus `.deploy.env`):

```powershell
$env:DEPLOY_HOST = (Select-String '^DEPLOY_HOST=(.+)$' .deploy.env).Matches[0].Groups[1].Value
scp -r deploy/haertung root@${env:DEPLOY_HOST}:haertung
```

Auf dem Server (`ssh root@$DEPLOY_HOST`):

```bash
cd ~/haertung && chmod +x *.sh
cp haertung.env.example haertung.env     # optional: eigene Werte eintragen (Deploy-Nutzer, Betreiber-IP, Storage Box)
bash check.sh                            # Ist-Zustand, nur lesend
```

Nach Block 2 (Phase B) kopierst du als Deploy-Nutzer (`scp -r deploy/haertung deploy@$DEPLOY_HOST:haertung`) und startest
die Skripte mit `sudo bash …` (sudo-Passwort aus dem Passwort-Manager).

## Überblick

| Block | Skript | Ändert | Risiko | Zurück |
|---|---|---|---|---|
| 1 | `01-firewall.sh` | ufw: 22, 80, 443 offen; 3000 zu; 3005/3010 nur solange der Proxy sie bedient | gering (App-Ports lauschen eh nur lokal) | `ufw allow <port>/tcp` |
| 2 | `02-ssh.sh` | Deploy-Nutzer, sudo-Regeln, sshd ohne Passwort; Phase B: kein Root-Login | mittel – Aussperren möglich, deshalb zwei Phasen + zweites Terminal | Drop-in löschen, sshd neu laden |
| 3 | `03-updates.sh` | unattended-upgrades nur Sicherheits-Updates, Neustart 04:00 wenn nötig | gering (nächtlicher Neustart ≈ 1 Min Ausfall) | Dateien in `/etc/apt/apt.conf.d` löschen |
| 4 | `04-crowdsec.sh` | CrowdSec + Firewall-Bouncer, liest sshd- und Caddy-Logs | mittel – kann dich sperren (OPERATOR_IP setzen) | `cscli decisions delete --ip …`, Dienste stoppen |
| 5 | `05-docker.sh` | nichts – zeigt Ist/Soll; die Härtung kommt per Deploy (`docker-compose.override.yml`) | gering (erst Vorschau, dann Prod) | `COMPOSE_FILE=docker-compose.yml` in die `.env` der Instanz |
| 6 | `06-restic.sh` | restic, Schlüssel, Repos auf der Storage Box, `fap-backup.sh`, Timer 03:50 | gering; Kosten ≈ 3 €/Monat | Timer aus, `/etc/fap-backup` löschen |
| 7 | `07-restore-test.sh` | nichts an den Instanzen – holt den jüngsten Schnappschuss in einen Temp-Ordner und prüft ihn | keins | – |
| – | `check.sh` | nichts – Stand auf einen Blick | keins | – |

---

## Block 1 – Firewall (`01-firewall.sh`)

**Heute:** ufw erlaubt 22, 80, 3000, 3010, 3005 (v4 und v6). Die App-Container lauschen nur auf `127.0.0.1`; nach außen
bedient sie der Caddy-Proxy in `/opt/proxy` – heute auf `https://$DEPLOY_HOST:3010` (Prod) und `:3005` (Vorschau).

**Das Skript:** liest die Caddyfile und die veröffentlichten Ports des Proxy-Containers (nur lesend) und zeigt den
Befund. Dann: Standard „eingehend verboten“, 22/80/443 offen, **3000 zu** (anderes Projekt lauscht lokal), **3005 und
3010 bleiben offen, solange der Proxy dort Seiten bedient** – sonst wären Prod und Vorschau nicht mehr erreichbar.
Protokoll auf „low“.

```bash
sudo bash 01-firewall.sh --check
sudo bash 01-firewall.sh
```

**Risiko:** gering. Port 22 bleibt. Sollte etwas fehlen: `ufw allow 3010/tcp` (bzw. der fehlende Port) stellt die
alte Regel wieder her; `ufw status numbered` zeigt alle.

**Nach der Domain (Phase G):** sobald Prod und Vorschau über `https://<domain>` (443) laufen und die Blöcke
`https://$DEPLOY_HOST:3010 { … }` aus der Caddyfile raus sind, dieses Skript erneut starten – es schließt 3005 und
3010 dann von selbst. Später, mit WireGuard (Schritt 3), Port 22 nur noch über das VPN.

**Zweite Schicht – Hetzner Cloud Firewall (Konsole, kostenlos):** Cloud Console → Firewalls → neue Firewall, eingehend
`TCP 22`, `TCP 80`, `TCP 443` (vorerst plus `TCP 3005`, `TCP 3010`), ausgehend alles; dem Server zuweisen. Sie greift
vor dem Server – ein Fehler in ufw oder ein Container, der doch mal einen Port veröffentlicht, bleibt damit unsichtbar.
Für `TCP 22` kann dort schon jetzt „nur meine IP“ stehen, wenn deine Adresse fest ist (sonst nach dem VPN).

## Block 2 – SSH (`02-ssh.sh`) – zwei Phasen

**Heute:** `root` per Schlüssel (`PermitRootLogin prohibit-password`), aber `PasswordAuthentication yes`, keine
weiteren Nutzer.

**Phase A** (ohne Flag):
- legt den Deploy-Nutzer an (`DEPLOY_USER_NAME`, Standard `deploy`, **UID 1000** – dieselbe wie der Nutzer `node` im
  Container, dem `data/` gehört; so kann der Deploy-Nutzer Sicherungen lesen und `wipe` ausführen),
- trägt alle Schlüssel aus `/root/.ssh/authorized_keys` bei ihm ein,
- setzt ein zufälliges **sudo-Passwort** und zeigt es **einmal** – sofort in den Passwort-Manager,
- schreibt `/etc/sudoers.d/fap-deploy` aus `sudoers-fap-deploy.tpl`: ohne Passwort nur `docker`, zwei `systemctl`-Aufrufe,
  `mkdir`/`chown` unter `/opt`, `fap-backup.sh`; alles andere mit Passwort,
- übergibt die App-Ordner (`/opt/bernersennen-stammbaum*`) dem Deploy-Nutzer,
- sshd (Drop-in `/etc/ssh/sshd_config.d/10-fap-haertung.conf`): **kein Passwort-Login**, `MaxAuthTries 3`,
  `LoginGraceTime 30`, `AllowUsers root deploy`. Root per Schlüssel bleibt erlaubt.

```bash
sudo bash 02-ssh.sh --check
sudo bash 02-ssh.sh
```

**Jetzt testen – in einem ZWEITEN Terminal, die erste Sitzung bleibt offen:**

```powershell
ssh deploy@$env:DEPLOY_HOST 'sudo -n docker ps && echo SUDO-OK'
```

Danach `.deploy.env` und `.deploy.staging.env`: `DEPLOY_USER=deploy`. Ein Deploy mit `.\manage.ps1 -Target staging`
→ **[3]** muss durchlaufen (remote.sh nutzt dann `sudo -n docker compose`). Ab hier Deploys bitte nur noch als
`deploy` – deployt zwischendurch doch root, einfach `02-ssh.sh` erneut laufen lassen (richtet die Besitzrechte).

**Phase B** (erst nach dem Test):

```bash
sudo bash 02-ssh.sh --confirm-key-tested
```

→ `PermitRootLogin no`, `AllowUsers deploy`. Ohne das Flag verweigert das Skript diesen Schritt. Die Hetzner-Konsole
(Rettungssystem/VNC) bleibt als Notausgang immer.

**Risiko:** Aussperren, wenn Phase B ohne Test läuft – darum das Flag. **Zurück:** `rm /etc/ssh/sshd_config.d/10-fap-haertung.conf
&& systemctl reload ssh` (als deploy mit sudo oder über die Hetzner-Konsole).

**Entscheidung für dich:** Name des Deploy-Nutzers (`deploy`) und UID 1000 – siehe `haertung.env.example`.

## Block 3 – Sicherheits-Updates (`03-updates.sh`)

`unattended-upgrades` ist installiert; das Skript stellt es auf **nur Sicherheits-Quellen**, **Neustart um 04:00,
nur wenn ein Update ihn verlangt** (nach der App-Sicherung 03:30 und der Sicherung außer Haus 03:50), keine E-Mails,
entfernt `apt-listchanges`, schaltet die täglichen Timer ein und zeigt zum Schluss die wirksame Konfiguration plus
einen Probelauf (`--dry-run`).

```bash
sudo bash 03-updates.sh --check
sudo bash 03-updates.sh
```

**Risiko:** gering – ein Neustart dauert etwa eine Minute, die Container kommen von selbst wieder
(`restart: unless-stopped`). **Zurück:** `/etc/apt/apt.conf.d/52fap-unattended-upgrades` löschen.
Verlauf: `/var/log/unattended-upgrades/unattended-upgrades.log`.

## Block 4 – CrowdSec (`04-crowdsec.sh`)

**Warum CrowdSec statt fail2ban:** erkennt Muster (Brute-Force, Scanner, Bots) in den Logs, nutzt zusätzlich die
Gemeinschafts-Sperrliste und ist Open Source.

**Warum der Firewall-Bouncer und nicht der Caddy-Bouncer:** der Caddy-Bouncer müsste als Plugin **in den gemeinsamen
Proxy** (`/opt/proxy`, eigenes Repo, eigenes Caddy-Image) – ein Eingriff in alles, was dort läuft. Der
**Firewall-Bouncer** (`crowdsec-firewall-bouncer-nftables`) sperrt auf dem Host, für alle Ports zugleich (auch SSH), und
mit `nftables_hooks: input + forward` auch vor den weitergeleiteten Docker-Ports des Proxys. Nichts am Proxy ändert sich.

**Das Skript:** lädt das offizielle Repo-Skript von CrowdSec, zeigt Größe/SHA-256/Anfang und führt es erst dann aus
(kein blindes `curl | sh`); installiert `crowdsec` + Bouncer, die Sammlungen `linux`, `sshd`, `caddy`; Log-Quellen: sshd
aus dem Journal, Caddy aus den Docker-Logs des Containers `server-proxy`. Optional `OPERATOR_IP` – deine Adresse wird
nie gesperrt.

```bash
OPERATOR_IP=<deine feste IP> sudo -E bash 04-crowdsec.sh --check
OPERATOR_IP=<deine feste IP> sudo -E bash 04-crowdsec.sh
```

Ohne feste IP: weglassen (du kannst dich bei einer Sperre über die Hetzner-Konsole befreien:
`cscli decisions delete --ip <ip>`).

**Caddy-Logs:** CrowdSec sieht Web-Angriffe nur, wenn der Proxy Zugriffe als JSON nach stdout loggt. Das Skript prüft
die Caddyfile (nur lesend) und schlägt den `log { output stdout; format json }`-Block vor – der gehört ins Repo
„server“ und braucht deine Freigabe. Bis dahin schützt CrowdSec nur SSH.

**Risiko:** mittel – Fehlalarme sperren einen Besucher für 4 Stunden (Standard). **Zurück:**
`systemctl disable --now crowdsec crowdsec-firewall-bouncer`. Nützlich: `cscli metrics`, `cscli decisions list`,
`cscli alerts list`.

## Block 5 – Docker-Härtung (`05-docker.sh` + `docker-compose.override.yml`)

Die Härtung steht im Repo, in [`docker-compose.override.yml`](../../docker-compose.override.yml) – Compose lädt sie
automatisch neben der `docker-compose.yml`, lokal wie auf dem Server:

- `no-new-privileges`, `cap_drop: ALL` (Node braucht keine Capability, Port 3000 > 1024, Nutzer `node`),
- `read_only` Dateisystem + `tmpfs /tmp` (64 MB) – geschrieben wird nur nach `/data` (Volume),
- Grenzen: 1 GB RAM, 1,5 CPU, 256 Prozesse; `ulimit nofile` 4096/8192,
- Log-Rotation (10 MB × 3) steht schon in der Basis-Datei.

Das Skript ändert **nichts**: es zeigt je Instanz, was der laufende Container hat, den `git diff` der compose-Dateien
gegen `origin`, und prüft die neuen Dateien mit `docker compose config` gegen die `.env` der Instanz. Die
compose-Datei des anderen Projekts bleibt unberührt.

```bash
sudo bash 05-docker.sh            # Ist und Soll (gleich mit und ohne --check)
```

**Übernehmen – über das normale Deploy:** erst `.\manage.ps1 -Target staging` → **[3]**, Vorschau prüfen (Fotos
hochladen, Admin-Reiter „Server“, `/health`, Logs), dann `.\manage.ps1` → **[3]** bzw. **[12]** für Prod. Danach
`05-docker.sh` erneut – die Werte müssen passen.

**Risiko:** gering, da erst auf der Vorschau. Zeigt der Server-Reiter die App dauerhaft nahe 1 GB oder startet der
Container neu (OOM), Grenze im Override anheben. **Zurück ohne Repo-Änderung:** `COMPOSE_FILE=docker-compose.yml` in
die `.env` der Instanz (`/opt/…/.env`) und dort `sudo docker compose up -d`.

## Block 6 – Sicherung außer Haus (`06-restic.sh`, `fap-backup.sh`)

**Was gesichert wird (verschlüsselt, täglich 03:50):** je Instanz (Prod, Vorschau) der Datenbank-Schnappschuss
(die frische `auto-JJJJ-MM-TT.db` der App von 03:30, sonst ein eigener `sqlite3 .backup`, danach `PRAGMA quick_check`),
die `.env` der Instanz (ohne `JWT_SECRET`/`CODE_PEPPER` wären Sitzungen und Gutschein-Codes nach einer Wiederherstellung
wertlos), `data/uploads` und `data/partner-media`. Zwei restic-Repositories (`/prod`, `/vorschau`) auf **einer** Storage Box.

### Storage Box bestellen und einrichten (du, Hetzner Console)

1. **Bestellen:** Storage Box **BX11** (1 TB, ≈ 3,20 €/Monat zzgl. MwSt.; Preis vor der Bestellung prüfen),
   Standort Falkenstein/Nürnberg wie der Server. Unter „Zugang“ **SSH-Unterstützung** und **externe Erreichbarkeit** an,
   Samba/WebDAV aus.
2. **Snapshots an:** Storage Box → Snapshots → automatisch **täglich** (BX11 behält bis zu 10). Das ist der eigentliche
   Schutz gegen einen gekaperten Server, siehe unten.
3. **Sub-Account für den Server:** Sub-Accounts → neu, eigenes Verzeichnis `fap`, SSH an, Samba/WebDAV aus, extern
   erreichbar an. Name wie `uXXXXXX-sub1`; Adresse `uXXXXXX.your-storagebox.de`, **SFTP-Port 23**.
4. **Schlüssel des Servers eintragen:** `06-restic.sh` erzeugt `/etc/fap-backup/id_ed25519` und zeigt den öffentlichen
   Schlüssel. In der Console beim Sub-Account als SSH-Schlüssel hinterlegen – oder klassisch vom Server aus
   (fragt einmal das Sub-Account-Passwort ab):
   `cat /etc/fap-backup/id_ed25519.pub | ssh -p23 uXXXXXX-sub1@uXXXXXX.your-storagebox.de install-ssh-key`
5. Werte in `haertung.env`: `STORAGEBOX_USER`, `STORAGEBOX_HOST` (Port 23 ist Standard).

### Auf dem Server

```bash
sudo bash 06-restic.sh --check
sudo bash 06-restic.sh          # zeigt den öffentlichen Schlüssel und EINMAL die zwei restic-Passwörter → Passwort-Manager!
sudo fap-backup.sh --check      # Verbindung, was gesichert würde
sudo systemctl start fap-backup.service && journalctl -u fap-backup -n 30 --no-pager
```

Das Skript holt den Host-Schlüssel der Storage Box per `ssh-keyscan` und zeigt die Fingerabdrücke – mit der
Hetzner-Dokumentation vergleichen. Passwörter liegen nur in `/etc/fap-backup/*.pass` (root, 600) und bei dir.
**Ohne die Passwörter sind die Sicherungen wertlos.**

Der Admin-Reiter „Server“ zeigt danach unter „Stand“ die Zeile **„Außer Haus“** (Zeit und Umfang der letzten Sicherung,
aus `data/backups/last-offsite-backup.json`); `check.sh` zeigt zusätzlich, ob der letzte Lauf geklappt hat.

### Ehrlich zu „nur anhängen“ (append-only)

Der Plan wollte einen Server-Schlüssel, der Sicherungen nur anhängen, nie löschen kann. **Über SFTP kann die Storage
Box das nicht erzwingen** – wer den Sub-Account hat, kann dort auch löschen. Deshalb drei Dinge:

1. **Storage-Box-Snapshots** (täglich, Punkt 2 oben): unabhängig vom Server, nur über die Console löschbar. Ein
   Angreifer mit dem Server-Schlüssel kommt an sie nicht heran.
2. **`forget`/`prune` laufen nie auf dem Server**, sondern von deinem Rechner (unten). Der Server löscht nichts.
3. Der Sub-Account sieht nur sein Verzeichnis `fap` – nichts anderes auf der Storage Box.

Echtes append-only gäbe es nur mit einem eigenen `rest-server --append-only` (ein weiterer Dienst, Schritt 2
„Werkzeug-Server“) – dann lohnt der Wechsel des Backends (eine Zeile in `common.env`).

### Vom eigenen Rechner: Aufbewahrung und Zugriff

Einmal: `winget install restic.restic`; Hauptaccount der Storage Box nutzen (oder einen zweiten Sub-Account mit demselben
Verzeichnis); Passwörter aus dem Passwort-Manager in zwei Dateien ohne Zeilenumbruch, z. B. unter
`%USERPROFILE%\.fap-restic\prod.pass`.

```powershell
$env:RESTIC_PASSWORD_FILE = "$env:USERPROFILE\.fap-restic\prod.pass"
restic -r sftp:uXXXXXX@uXXXXXX.your-storagebox.de:/fap/prod -o sftp.command="ssh -p 23 uXXXXXX@uXXXXXX.your-storagebox.de -s sftp" snapshots
# Aufbewahrung wie im Plan: 7 täglich, 4 wöchentlich, 6 monatlich - etwa einmal im Monat:
restic -r sftp:… -o sftp.command="…" forget --host fap-prod --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune
restic -r sftp:… -o sftp.command="…" check --read-data-subset=10%     # ab und zu: Daten wirklich lesbar?
```

Für die Vorschau dasselbe mit `/fap/vorschau` und `--host fap-vorschau`.

**Risiko:** gering – nur Lesen auf dem Server. **Zurück:** `systemctl disable --now fap-backup.timer`,
`/etc/fap-backup` und `/usr/local/bin/fap-backup.sh` löschen.

## Block 7 – Wiederherstellungs-Probe (`07-restore-test.sh`)

Holt den jüngsten Schnappschuss (Standard Prod, nur die Datenbank und die `.env`) in einen Temp-Ordner unter
`/var/lib/fap-backup`, prüft `PRAGMA integrity_check`, zählt Tabellen, schreibt das Ergebnis nach
`/var/lib/fap-backup/<name>/last-restore-test.json` (zeigt `check.sh`) und räumt auf. **Einmal im Monat.**

```bash
sudo bash 07-restore-test.sh --check        # nur die Schnappschüsse zeigen
sudo bash 07-restore-test.sh                # Probe
sudo bash 07-restore-test.sh --keep         # Ordner stehen lassen (Pfad wird gezeigt)
sudo bash 07-restore-test.sh --instance vorschau --mit-fotos
```

**In die Vorschau laden** (zeigt die echten Daten kurz unter der Vorschau-Adresse – danach mit **[11]** wieder auf
Beispieldaten zurücksetzen):

```bash
sudo bash 07-restore-test.sh --keep                      # Pfad T merken, Datenbank liegt unter T/var/lib/fap-backup/prod/data.db
cd /opt/bernersennen-stammbaum-staging && sudo docker compose stop chronik
sudo install -o 1000 -g 1000 -m 600 T/var/lib/fap-backup/prod/data.db data/data.db
sudo rm -f data/data.db-wal data/data.db-shm
sudo docker compose start chronik && sudo rm -rf T
```

Die Fotos der Vorschau passen dann nicht zur Prod-Datenbank – für eine vollständige Probe `--mit-fotos` und
`T/opt/bernersennen-stammbaum/data/uploads` genauso nach `data/uploads` kopieren.

## `check.sh` – Stand auf einen Blick

```bash
sudo bash check.sh
```

Zeigt sshd-Werte, Deploy-Nutzer, ufw-Regeln, Update-Einstellung und letzten Lauf, CrowdSec (Dienste, Sperren,
Sammlungen), Container-Härtung je Instanz, die Timer und je Instanz die letzten Sicherungen (App, außer Haus,
Wiederherstellungs-Probe) sowie die Platte. Nur lesend, ohne Netzverbindung.

## Offene Entscheidungen

- **Storage Box bestellen?** Einzige Kosten in Schritt 1 (≈ 3,20 €/Monat). Ohne sie: Blöcke 1–5 trotzdem sinnvoll.
- **Name des Deploy-Nutzers:** Standard `deploy` (UID 1000). Anders? → `DEPLOY_USER_NAME` in `haertung.env`, dann auch
  `DEPLOY_USER` in `.deploy.env`/`.deploy.staging.env`.
- **3005/3010:** bleiben offen, bis die Domain läuft (Phase G) – danach `01-firewall.sh` erneut und die beiden Ports
  auch aus der Cloud Firewall nehmen.
- **Caddy-Logs als JSON** (Repo „server“) – ohne sie sieht CrowdSec nur SSH.
- **Feste Betreiber-IP** für `OPERATOR_IP` und die Cloud-Firewall-Regel auf 22 – oder erst mit WireGuard (Schritt 3).

## Tests

`cd server && npm test` prüft u. a. (`test/haertungScripts.test.js`): Syntax aller Skripte (`bash -n`),
`set -euo pipefail`, `--check`/`--help`, keine IP-Adressen, keine gesperrten Namen (Muster aus dem lokalen
pre-commit-Hook), Markierung „außer Haus“ passt zur App, Override-Datei enthält die Härtung, `remote.sh` kommt mit dem
Deploy-Nutzer zurecht.
