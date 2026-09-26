const config = require('./config')
const { createApp } = require('./app')

const app = createApp()

app.listen(config.port, () => {
  console.log(`Familienchronik läuft auf http://localhost:${config.port}`)
})
