const test = require('node:test')
const assert = require('node:assert/strict')
const { foldDe, foldBasis, cleanQuery, findMatch, excerpt, matchRank, EXCERPT_MAX } = require('../lib/searchText')

test('Falten: Groß/klein, Umlaute (ä/ae und ä/a), ß/ss, Akzente', () => {
  assert.equal(foldDe('Müller'), 'mueller')
  assert.equal(foldBasis('Müller'), 'muller')
  assert.equal(foldDe('STRAẞE'), 'strasse')
  assert.equal(foldBasis('Straße'), 'strasse')
  assert.equal(foldDe('Öhrchen Äpfel'), 'oehrchen aepfel')
  assert.equal(foldBasis('Café Crème'), 'cafe creme')
  // zerlegt geschriebenes ü (u + U+0308) zählt wie das zusammengesetzte
  assert.equal(foldDe('Mu\u0308ller'), 'mueller')
  assert.equal(foldDe(null), '')
  // Kompatibilitätszeichen werden erst beim Zerlegen zu Buchstaben - auch die klein
  assert.equal(foldDe('ℌund'), 'hund')
  assert.deepEqual(findMatch('Der ℌund', 'hund'), { start: 4, end: 8 })
})

test('Falten für die Datenbank und Zeichen für Zeichen (Hervorhebung) ergeben dasselbe', () => {
  const samples = ['ΟΔΟΣ ΜΑΪΟΣ', 'İstanbul', 'Ǟpfel', 'ﬁnden ½', 'Mu\u0308ller', 'Größe 🐾 Straße', 'ὈΔΥΣΣΕΎΣ']
  for (const sample of samples) {
    // findMatch faltet Zeichen für Zeichen: findet es den ganzen gefalteten Text, sind beide Wege gleich.
    for (const fold of [foldDe, foldBasis]) {
      const match = findMatch(sample, fold(sample))
      assert.ok(match, `${sample} (${fold.name})`)
      assert.deepEqual(match, { start: 0, end: sample.normalize('NFC').length }, sample)
    }
  }
})

test('Suchbegriff: Text mit 2 bis 80 Zeichen, Steuerzeichen raus, Leerraum zusammengefasst', () => {
  assert.equal(cleanQuery('  Benno  '), 'Benno')
  assert.equal(cleanQuery('Strand\n\ttag'), 'Strand tag')
  assert.equal(cleanQuery('B\u202Eenno\u0000'), 'Benno')
  assert.equal(cleanQuery('Tag \u200E am'), 'Tag am')
  assert.equal(cleanQuery('x'.repeat(80)), 'x'.repeat(80))
  assert.equal(cleanQuery('x'.repeat(81)), null)
  assert.equal(cleanQuery('a'), null)
  assert.equal(cleanQuery('   '), null)
  assert.equal(cleanQuery('e\u0301\u0301'), null, 'nur Zeichen, die beim Falten verschwinden, reichen nicht')
  assert.equal(cleanQuery(['Benno']), null)
  assert.equal(cleanQuery({ q: 'Benno' }), null)
  assert.equal(cleanQuery(undefined), null)
})

test('Suchbegriff: auch gefaltet kurz (Zeichen, die beim Falten lang werden)', () => {
  // U+FDFA wird beim Zerlegen zu 18 Buchstaben, Ⅲ zu "iii"
  assert.equal(cleanQuery('ﷺ'.repeat(9)), null)
  assert.equal(cleanQuery('Ⅲ'.repeat(54)), null)
  assert.equal(cleanQuery('Ⅲ'.repeat(53)), 'Ⅲ'.repeat(53))
  // Umlaute verlängern einen gewöhnlichen Begriff nur wenig
  assert.equal(cleanQuery('ü'.repeat(80)), 'ü'.repeat(80))
})

test('Treffer finden: Position im Original, auch über Umlaute hinweg', () => {
  assert.deepEqual(findMatch('Herr Müller kam', 'mueller'), { start: 5, end: 11 })
  assert.deepEqual(findMatch('Herr Müller kam', 'muller'), { start: 5, end: 11 })
  assert.deepEqual(findMatch('Herr Mueller kam', 'Müller'), { start: 5, end: 12 })
  // ein halbes ü (nur das "u" von "ue") markiert trotzdem das ganze Zeichen
  assert.deepEqual(findMatch('Mühle', 'mu'), { start: 0, end: 2 })
  assert.equal(findMatch('Benno', 'xyz'), null)
  assert.equal(findMatch('', 'be'), null)
})

test('Rang: genau 0, Anfang 1, irgendwo 2, gar nicht 3', () => {
  assert.equal(matchRank('Benno', 'benno'), 0)
  assert.equal(matchRank('Bennos Ball', 'Benno'), 1)
  assert.equal(matchRank('Mit Benno', 'benno'), 2)
  assert.equal(matchRank('Flocke', 'benno'), 3)
  assert.equal(matchRank('Jürgen', 'jurgen'), 0)
})

test('Auszug: höchstens 140 Zeichen rund um den Treffer, mit Auslassungszeichen', () => {
  assert.equal(excerpt('Kurzer Text mit Benno.', 'benno'), 'Kurzer Text mit Benno.')
  assert.equal(excerpt('Zeile eins\n\nZeile   zwei mit Benno', 'benno'), 'Zeile eins Zeile zwei mit Benno')
  assert.equal(excerpt('Ohne Treffer', 'benno'), null)
  assert.equal(excerpt(null, 'benno'), null)

  const long = `${'Anfang '.repeat(40)}Heute war Benno am Strand und hat gebuddelt. ${'Ende '.repeat(40)}`
  const cut = excerpt(long, 'benno')
  assert.ok(cut.length <= EXCERPT_MAX, `höchstens ${EXCERPT_MAX} Zeichen, waren ${cut.length}`)
  assert.ok(cut.includes('Benno am Strand'))
  assert.ok(cut.startsWith('…') && cut.endsWith('…'))

  const atStart = excerpt(`Benno ${'lief weiter '.repeat(30)}`, 'benno')
  assert.ok(atStart.startsWith('Benno') && atStart.endsWith('…') && atStart.length <= EXCERPT_MAX)
})
