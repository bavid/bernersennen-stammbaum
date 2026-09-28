const net = require('node:net')

// IPv4-mapped IPv6 (z. B. hinter manchen Proxys/Dual-Stack-Setups): wie die reine IPv4-Adresse behandeln.
const IPV4_MAPPED_RE = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i
const IPV6_PREFIX_BYTES = 7 // /56 = 56 Bit = 7 von 16 Bytes

// Zerlegt eine IPv6-Adresse (inkl. "::"-Kurzschreibweise und eingebettetem IPv4-Suffix) in 16 Bytes.
// Gibt null zurück, wenn sich die Eingabe nicht sauber als IPv6 parsen lässt.
function ipv6ToBytes(address) {
  const zoneless = address.split('%')[0]
  const halves = zoneless.split('::')
  if (halves.length > 2) return null

  const expand = (part) => {
    if (!part) return []
    return part.split(':').flatMap((hextet) => {
      if (hextet.includes('.')) {
        const octets = hextet.split('.').map(Number)
        if (octets.length !== 4 || octets.some((o) => !Number.isInteger(o) || o < 0 || o > 255)) return [Number.NaN]
        return [(octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3]]
      }
      if (!/^[0-9a-fA-F]{1,4}$/.test(hextet)) return [Number.NaN]
      return [Number.parseInt(hextet, 16)]
    })
  }

  const head = expand(halves[0])
  const tail = halves.length === 2 ? expand(halves[1]) : []
  if ([...head, ...tail].some((value) => Number.isNaN(value))) return null

  let hextets
  if (halves.length === 1) {
    hextets = head
  } else {
    const missing = 8 - head.length - tail.length
    if (missing < 0) return null
    hextets = [...head, ...Array(missing).fill(0), ...tail]
  }
  if (hextets.length !== 8) return null

  const bytes = []
  for (const hextet of hextets) bytes.push((hextet >> 8) & 0xff, hextet & 0xff)
  return bytes
}

// Maskiert eine IPv6-Adresse auf ihr /56-Präfix: die meisten Provider vergeben Kunden mindestens einen
// /56- oder /64-Block, ein einzelnes Gerät kann die letzten Blöcke aber oft beliebig wechseln. Ohne
// Maskierung liefe ein reines Pro-IP-Limit für IPv6 praktisch leer. Lässt sich die Adresse nicht
// parsen, wird sie unverändert zurückgegeben (bleibt als Schlüssel eindeutig genug, nur ohne die
// zusätzliche Großzügigkeit gegenüber demselben Kunden).
function maskIpv6(address) {
  const bytes = ipv6ToBytes(address)
  if (!bytes) return address

  const hextets = []
  for (let i = 0; i < 16; i += 2) {
    const hi = i < IPV6_PREFIX_BYTES ? bytes[i] : 0
    const lo = i + 1 < IPV6_PREFIX_BYTES ? bytes[i + 1] : 0
    hextets.push(((hi << 8) | lo).toString(16))
  }
  return `${hextets.join(':')}/56`
}

// Ersatz für express-rate-limits eingebauten IP-Schlüssel (der in v7 noch keine IPv6-Maskierung kennt -
// die kam erst mit "ipv6Subnet" in späteren Versionen dazu). IPv4 und IPv4-mapped IPv6 bleiben
// unverändert, echtes IPv6 wird auf /56 gekappt, siehe maskIpv6.
function ipKeyGenerator(req) {
  const ip = req.ip
  if (typeof ip !== 'string' || !ip) return ip
  const mapped = ip.match(IPV4_MAPPED_RE)
  if (mapped) return mapped[1]
  if (net.isIP(ip) === 6) return maskIpv6(ip)
  return ip
}

module.exports = { ipKeyGenerator, maskIpv6 }
