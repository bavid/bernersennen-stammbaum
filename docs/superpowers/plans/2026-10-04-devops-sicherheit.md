# DevOps & Sicherheit – Server, CI, Scans, Backups (Plan, 04.10.)

> **For agentic workers:** Jeder Schritt, der den Server, die Firewall, DNS oder Kosten berührt, braucht die
> ausdrückliche Freigabe des Betreibers (🧑). Agenten bereiten Skripte und Anleitungen vor, ausgeführt wird erst nach OK.

**Wunsch des Betreibers (04.10.):** „Ich will da nicht schludern – möglichst Open Source, aber sicher. Kein Azure,
eher Jenkins? GitHub Actions zu teuer. Nach Möglichkeit bei Hetzner bleiben.“ Getrennt gedacht: **System** (Prod),
**Demo/Admin** (Präsentation und Verwaltung), später **Shop**.

## Empfehlung in einem Satz
Drei kleine Hetzner-Cloud-Server (Prod, Vorschau/Demo, Werkzeug) plus eine Storage Box für verschlüsselte
Backups; CI mit **Forgejo + Forgejo Actions** (Open Source, GitHub-Actions-kompatibel) auf dem Werkzeug-Server,
Sicherheits-Scans mit Open-Source-Werkzeugen, Admin nur über VPN. Kosten etwa **23 € im Monat** (zzgl. MwSt.,
Preise nach der Hetzner-Anpassung vom Juni 2026 vor Bestellung prüfen).

## Server (Hetzner Cloud, Falkenstein/Nürnberg)
| Rolle | Typ | Leistung | Preis/Monat* | Inhalt |
|---|---|---|---|---|
| `app` (Prod) | CX23 | 2 vCPU, 4 GB, 40 GB | ~5,49 € | App-Container, Caddy (TLS), optional Coraza-WAF |
| `vorschau` | CX23 | 2 vCPU, 4 GB, 40 GB | ~5,49 € | Vorschau, Demo, Präsentation |
| `werkzeug` | CX33 | 4 vCPU, 8 GB, 80 GB | ~8,49 € | Forgejo + Runner, Scans, Renovate, Uptime Kuma, ClamAV |
| Backups | Storage Box BX11 | 1 TB | ~3,20 € | restic-Repos (verschlüsselt) |

\* Stand der Quellen 2026, ohne MwSt. Hetzner Cloud Firewall und privates Netz kosten nichts.

- **Warum getrennt:** Wartung, Scans oder ein Fehler auf der Vorschau treffen Prod nicht; die Werkzeuge (CI,
  Scanner) laufen nicht neben echten Nutzerdaten.
- **Später (ab ~200 Nutzern / mit Shop):** `app` auf CX33, eigener Shop-Server oder Shop als Dienst (siehe Phase F).
- **Heute** teilen sich Prod und Vorschau einen Server mit einem weiteren Projekt – Schritt 3 trennt das.

## CI/CD – warum nicht Jenkins
- **Jenkins:** mächtig, aber schwer (Java, viele Plugins, viel Pflege und Sicherheits-Updates) – für ein kleines
  Projekt zu viel Aufwand.
- **GitHub Actions:** gehostete Minuten kosten im privaten Repo Geld; **eigene Runner** sind derzeit kostenlos (eine
  angekündigte Gebühr von 0,002 $/min wurde 2026 verschoben, könnte aber zurückkommen).
- **Empfehlung: Forgejo** (Open Source, gemeinnützig getragen) auf `werkzeug` mit **Forgejo Actions** – gleiche
  Workflow-Syntax wie GitHub Actions, alles bleibt bei Hetzner. GitHub (privat) bleibt als **Spiegel** und
  Notfall-Kopie des Codes.
- **Ablauf:** Push auf `staging` → Tests, Build, Scans → bei Erfolg automatisch auf die Vorschau. Prod nur per
  Knopfdruck des Betreibers (wie heute `manage.ps1` → [12]), nie automatisch.

## Sicherheits-Scans (alle Open Source)
| Was | Werkzeug | Wann | Blockiert bei |
|---|---|---|---|
| Abhängigkeiten (CVEs) | `npm audit`, **OSV-Scanner** | jeder Push | kritisch/hoch |
| Code (SAST, Injection) | **Semgrep** (Community-Regeln für Node/Express/SQL) | jeder Push | hoch |
| Geheimnisse im Code | **gitleaks** (zusätzlich zur Namens-/IP-Prüfung) | jeder Push + vor dem Commit | jeder Fund |
| Container & Dockerfile | **Trivy** | jeder Build | kritisch/hoch |
| Laufende Seite (DAST) | **OWASP ZAP** Baseline gegen die Vorschau | wöchentlich | hoch (Bericht) |
| Abhängigkeits-Updates | **Renovate** (selbst gehostet) | täglich | – (Vorschläge) |
| Server-Härtung | **Lynis** | monatlich | Bericht |

- SQL-Injection: die App nutzt durchgängig vorbereitete Statements; Semgrep + ZAP prüfen, dass das so bleibt.
- Uploads: nur JPG/PNG, Inhalt geprüft, neu kodiert, Metadaten entfernt (besteht). **ClamAV** zusätzlich als
  Scan-Dienst auf `werkzeug` (über das private Netz) für jeden Upload – bei Fund ablehnen; braucht ~1–1,5 GB RAM, daher
  nicht auf `app`.

## Server-Härtung
- Ubuntu LTS, `unattended-upgrades` (Sicherheits-Updates), Neustart-Fenster nachts.
- SSH nur mit Schlüssel, kein Root-Login, eigener Deploy-Nutzer; **CrowdSec** (Open Source) statt nur fail2ban, mit
  Caddy-Bouncer.
- **Hetzner Cloud Firewall:** nur 80/443 öffentlich; SSH nur von der Betreiber-IP bzw. über VPN; App-Ports nie öffentlich.
- Docker: Container als Nicht-Root (besteht), `no-new-privileges`, Speicher-/CPU-Grenzen, nur nötige Volumes.
- **Admin-Portal nur über VPN:** **WireGuard** (Open Source) zum Betreiber-Rechner; zusätzlich später 2-Faktor (TOTP).
- Geheimnisse: `.env` mit Rechten 600; `CODE_PEPPER` zusätzlich offline im Passwort-Manager; optional **sops + age**
  für verschlüsselte Konfiguration im Repo.

## Backups
- **Täglich** (besteht in der App): SQLite-Online-Backup, 14 Tage.
- **Neu, nachts:** **restic** sichert DB-Backup + Uploads verschlüsselt auf die Storage Box; Aufbewahrung 7 täglich,
  4 wöchentlich, 6 monatlich; der Server-Schlüssel darf nur anhängen (append-only), nicht löschen.
- **Monatlich:** Wiederherstellung in die Vorschau testen (Skript), Ergebnis im Admin-Reiter „Server“ anzeigen.

## Überwachung
- **Uptime Kuma** auf `werkzeug`: Prod, Vorschau, Zertifikats-Ablauf, minütlich; Alarm per Telegram (vorhandener Bot).
- Admin-Reiter „Server“ (besteht): RAM, Platte, Last, letzte Sicherung, Warnungen.
- Logs: Docker-Log-Rotation; keine personenbezogenen Daten in Logs (besteht als Regel).

## Schritte
1. 🧑 **Sofort, ohne neue Kosten:** Cloud Firewall, SSH härten, `unattended-upgrades`, CrowdSec, Docker-Härtung,
   restic + Storage Box (einzige Kosten ~3 €). Agent schreibt Skripte + Anleitung, Betreiber führt aus bzw. gibt frei.
2. 🧑 **Werkzeug-Server:** CX33 bestellen; Forgejo + Runner + Scans + Renovate + Uptime Kuma per Docker Compose;
   GitHub als Spiegel.
3. 🧑 **Trennen:** Prod und Vorschau auf eigene CX23, Admin hinter WireGuard, alte geteilte Maschine räumen.
4. **Ab ~200 Nutzern / Shop:** `app` vergrößern, Shop getrennt (Phase F), Zahlungen nur über gehostete Kassen
   (keine Kartendaten bei uns).

## Offene Fragen an den Betreiber
- Darf Schritt 1 auf dem heutigen Server laufen (Firewall/SSH-Änderungen, kurze Neustarts)?
- Forgejo (alles bei Hetzner) oder GitHub mit eigenem Runner (weniger Pflege, aber Abhängigkeit von GitHub)?
- WireGuard für den Admin – passt das zu deinem Arbeitsplatz (Windows-Client vorhanden)?

## Quellen (Preise/Stand)
- Hetzner Preisanpassung 15.06.2026: https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/
- CX23/CX33-Preise 2026: https://costgoat.com/pricing/hetzner
- Storage Box BX11: https://www.whtop.com/plans/hetzner.com/128269
- GitHub Actions, Gebühr für eigene Runner verschoben: https://github.blog/changelog/2025-12-16-coming-soon-simpler-pricing-and-a-better-experience-for-github-actions/
