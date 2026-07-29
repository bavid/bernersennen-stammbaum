const path = require('node:path')
const express = require('express')
const cors = require('cors')
const cookieParser = require('cookie-parser')

const authRoutes = require('./routes/auth')
const dogsRoutes = require('./routes/dogs')
const timelineRoutes = require('./routes/timeline')
const breedingRoutes = require('./routes/breeding')
const uploadsRoutes = require('./routes/uploads')

const app = express()
const PORT = process.env.PORT || 4000

app.use(cors({ origin: 'http://localhost:5173', credentials: true }))
app.use(express.json())
app.use(cookieParser())
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

app.use('/api', authRoutes)
app.use('/api/dogs', dogsRoutes)
app.use('/api/timeline', timelineRoutes)
app.use('/api/breeding', breedingRoutes)
app.use('/api/uploads', uploadsRoutes)

app.use((err, req, res, next) => {
  console.error(err)
  res.status(400).json({ error: err.message || 'Unerwarteter Fehler' })
})

app.listen(PORT, () => {
  console.log(`Server läuft auf http://localhost:${PORT}`)
})
