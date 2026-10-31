import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import './main.css'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { QuickAddWindow } from './features/quick-add/QuickAddWindow'
import { WidgetWindow } from './features/widget/WidgetWindow'

// API failures reject with plain { code, message } objects, which the console prints as
// "Object"; spell them out so a missed error is diagnosable.
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled rejection:', JSON.stringify(event.reason))
})

// One page, several windows: the quick-add popup and the desktop widget load it at a #route.
const route = location.hash.slice(1)
if (route) document.documentElement.classList.add('popup')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      {route === 'quick-add' ? <QuickAddWindow /> : route === 'widget' ? <WidgetWindow /> : <App />}
    </ErrorBoundary>
  </StrictMode>
)
