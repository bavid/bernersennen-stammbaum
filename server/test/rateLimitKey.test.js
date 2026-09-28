const test = require('node:test')
const assert = require('node:assert/strict')
const { ipKeyGenerator, maskIpv6 } = require('../lib/rateLimitKey')

test('ipKeyGenerator: IPv4 und IPv4-mapped IPv6 bleiben unverändert', () => {
  assert.equal(ipKeyGenerator({ ip: '203.0.113.42' }), '203.0.113.42')
  assert.equal(ipKeyGenerator({ ip: '::ffff:203.0.113.42' }), '203.0.113.42')
  assert.equal(ipKeyGenerator({ ip: '::FFFF:203.0.113.42' }), '203.0.113.42')
})

test('ipKeyGenerator: zwei IPv6-Adressen im selben /56 ergeben denselben Schlüssel', () => {
  const a = ipKeyGenerator({ ip: '2001:db8:1234:56ab::1' })
  const b = ipKeyGenerator({ ip: '2001:db8:1234:5600:ffff:ffff:ffff:ffff' })
  assert.equal(a, b)
})

test('ipKeyGenerator: unterschiedliche /56-Präfixe ergeben unterschiedliche Schlüssel', () => {
  const a = ipKeyGenerator({ ip: '2001:db8:1234:5600::1' })
  const b = ipKeyGenerator({ ip: '2001:db8:1234:5700::1' })
  assert.notEqual(a, b)
})

test('ipKeyGenerator: fehlendes req.ip wird unverändert durchgereicht', () => {
  assert.equal(ipKeyGenerator({ ip: undefined }), undefined)
})

test('maskIpv6: komprimierte und ausgeschriebene Form derselben Adresse maskieren gleich', () => {
  const a = maskIpv6('2001:db8::1')
  const b = maskIpv6('2001:0db8:0000:0000:0000:0000:0000:0001')
  assert.equal(a, b)
})

test('maskIpv6: eingebettetes IPv4-Suffix wird korrekt in Bytes umgerechnet', () => {
  // ::1.2.3.4 == ::0102:0304, das /56-Präfix ist hier ohnehin komplett Null
  assert.equal(maskIpv6('::1.2.3.4'), maskIpv6('::102:304'))
})

test('maskIpv6: eine nicht parsbare Adresse wird unverändert zurückgegeben statt zu werfen', () => {
  assert.equal(maskIpv6('nicht-valide'), 'nicht-valide')
  assert.equal(maskIpv6('1:2:3:4:5:6:7:8:9'), '1:2:3:4:5:6:7:8:9')
})
