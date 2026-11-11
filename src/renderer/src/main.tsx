import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/unbounded/wght.css'
import '@fontsource-variable/onest/wght.css'
import './styles.css'
import { App } from './App'
import { connect } from './store'

connect()
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
