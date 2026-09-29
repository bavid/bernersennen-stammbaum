import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@fontsource-variable/fraunces/full.css'
import '@fontsource-variable/manrope'
import App from './App.jsx'
import { ToastProvider } from './components/Toast.jsx'
import EnvBanner from './components/EnvBanner.jsx'
import { trackScrollbarWidth } from './lib/viewport.js'
import { installChunkReload } from './lib/chunkReload.js'
import './styles/global.css'

trackScrollbarWidth()
installChunkReload()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <EnvBanner />
        <App />
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>
)
