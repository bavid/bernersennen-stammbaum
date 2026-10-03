'use strict'

// Phase G Task 6, Admin-Reiter „Server“: die echten Messungen über Node. Im Container zeigen os.* und /proc/meminfo den
// Speicher und die Last des ganzen (geteilten) Servers - genau das ist gemeint. Tests geben lib/serverMetrics.js statt
// dieser Probe eine eigene mit festen Werten, nie das echte System. Ordnergrößen nur über fs.promises: jede Datei ein
// await, die Ereignisschleife bleibt frei - und lib/serverMetrics.js rechnet sie höchstens einmal je Stunde.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const MEMINFO = '/proc/meminfo'
const KIB = 1024
const MAX_DEPTH = 6

// MemTotal/MemAvailable aus /proc/meminfo in Bytes, fehlende Werte null.
function parseMeminfo(text) {
  const value = (key) => {
    const match = new RegExp(`^${key}:\\s+(\\d+)\\s+kB`, 'm').exec(text)
    return match ? Number(match[1]) * KIB : null
  }
  return { total: value('MemTotal'), available: value('MemAvailable') }
}

// { total, available } in Bytes. MemAvailable (Linux) zählt Caches mit, die der Kernel sofort hergibt - os.freemem nicht.
// Ohne lesbares /proc/meminfo (Windows, macOS, ältere Kernel) der Rückfall auf os.freemem.
async function memory() {
  try {
    const { total, available } = parseMeminfo(await fs.promises.readFile(MEMINFO, 'utf8'))
    if (total && available !== null) return { total, available }
  } catch {
    // kein /proc - Rückfall unten
  }
  return { total: os.totalmem(), available: os.freemem() }
}

// Laufwerk unter dir in Bytes: total, used (belegt) und free (für die App nutzbar, ohne die Reserve für root) - belegt in
// Prozent rechnet lib/serverMetrics.js wie df: used / (used + free).
async function disk(dir) {
  const stats = await fs.promises.statfs(dir)
  return { total: stats.blocks * stats.bsize, used: (stats.blocks - stats.bfree) * stats.bsize, free: stats.bavail * stats.bsize }
}

function load() {
  const [load1, load5, load15] = os.loadavg()
  return { cores: os.cpus().length || 1, load1, load5, load15 }
}

function uptime() {
  return { server: os.uptime(), app: process.uptime() }
}

function appRss() {
  return process.memoryUsage.rss()
}

// Größe einer Datei in Bytes, 0, wenn es sie nicht (mehr) gibt.
async function fileSize(file) {
  try {
    return (await fs.promises.stat(file)).size
  } catch (err) {
    if (err.code === 'ENOENT') return 0
    throw err
  }
}

// Größe eines Eintrags ohne einem Link zu folgen (lstat) - wurde die Datei inzwischen gelöscht, 0.
async function entrySize(file) {
  try {
    return (await fs.promises.lstat(file)).size
  } catch (err) {
    if (err.code === 'ENOENT') return 0
    throw err
  }
}

// Summe aller Dateien unter dir, rekursiv bis MAX_DEPTH Ebenen; symbolische Links zählen nicht (Dirent.isFile ist für sie
// false). opendir liest den Ordner stückweise statt Zehntausende Einträge auf einmal. Ohne Ordner 0.
async function dirSize(dir, depth = 0) {
  let handle
  try {
    handle = await fs.promises.opendir(dir)
  } catch (err) {
    if (err.code === 'ENOENT') return 0
    throw err
  }
  let total = 0
  for await (const entry of handle) {
    const full = path.join(dir, entry.name)
    if (entry.isFile()) total += await entrySize(full)
    else if (entry.isDirectory() && depth < MAX_DEPTH) total += await dirSize(full, depth + 1)
  }
  return total
}

const systemProbe = Object.freeze({ memory, disk, load, uptime, appRss, fileSize, dirSize, now: () => Date.now() })

module.exports = { systemProbe, parseMeminfo }
