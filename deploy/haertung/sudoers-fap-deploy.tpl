# /etc/sudoers.d/fap-deploy - angelegt von deploy/haertung/02-ssh.sh (Vorlage: sudoers-fap-deploy.tpl, __USER__ wird
# durch den Namen des Deploy-Nutzers ersetzt; visudo -c prüft die Datei vor dem Schreiben).
#
# Ohne Passwort nur, was deploy/remote.sh (manage.ps1) fürs Deploy braucht. Ehrlich gesagt ist „sudo docker“
# praktisch root (ein Container kann jeden Host-Pfad einbinden) - der Gewinn liegt woanders: kein Root-Login per SSH,
# jede Rechteausweitung steht im Journal, und der Weg zu einer echten Trennung (rootless Docker) ist geebnet.
Cmnd_Alias FAP_DOCKER   = /usr/bin/docker
Cmnd_Alias FAP_UNITS    = /usr/bin/systemctl enable --now docker, /usr/bin/systemctl start fap-backup.service, \
                          /usr/bin/systemctl status *, /usr/bin/systemctl list-timers *
Cmnd_Alias FAP_FILES    = /usr/bin/mkdir -p /opt/*, /usr/bin/chown * /opt/*
Cmnd_Alias FAP_BACKUP   = /usr/local/bin/fap-backup.sh

# APP_COMMIT reicht remote.sh beim Bauen durch (APP_COMMIT=… sudo docker compose up) - sudo würde es sonst verwerfen.
Defaults:__USER__ env_keep += "APP_COMMIT"
Defaults:__USER__ !requiretty

__USER__ ALL=(root) NOPASSWD: FAP_DOCKER, FAP_UNITS, FAP_FILES, FAP_BACKUP

# Alles andere (Wartung, Härtungs-Skripte, cscli, restic, apt) nur mit dem sudo-Passwort aus dem Passwort-Manager -
# nötig, sobald Root-Login per SSH aus ist (Phase B), sonst käme niemand mehr an den Server.
__USER__ ALL=(ALL) ALL
