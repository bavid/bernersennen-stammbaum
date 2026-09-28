// Erlaubte Auftritte einer Familie – muss zu client/src/themes/index.js passen
const THEMES = ['standard', 'berner']

function isTheme(value) {
  return THEMES.includes(value)
}

module.exports = { THEMES, isTheme }
