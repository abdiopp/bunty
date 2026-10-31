import { BrowserWindow, nativeTheme, type BrowserWindowConstructorOptions } from 'electron'
import { backgroundColor, loadRenderer, PRELOAD } from './renderer-url'

/** Height of the app's own title bar; the page lays out its header to match. */
const TITLE_BAR_HEIGHT = 44

// Windows keeps its native minimise / maximise / close buttons, drawn over our header.
function overlay(): Electron.TitleBarOverlay {
  const dark = nativeTheme.shouldUseDarkColors
  return {
    color: backgroundColor(dark),
    symbolColor: dark ? '#ededef' : '#1d1d1f',
    height: TITLE_BAR_HEIGHT
  }
}

function frameOptions(): BrowserWindowConstructorOptions {
  switch (process.platform) {
    case 'win32':
      return { titleBarStyle: 'hidden', titleBarOverlay: overlay() }
    case 'darwin':
      return { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 16, y: 15 } }
    default:
      return {}
  }
}

export function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 760,
    minHeight: 480,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: backgroundColor(nativeTheme.shouldUseDarkColors),
    ...frameOptions(),
    webPreferences: {
      preload: PRELOAD,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  const onThemeChange = (): void => {
    window.setBackgroundColor(backgroundColor(nativeTheme.shouldUseDarkColors))
    if (process.platform === 'win32') window.setTitleBarOverlay(overlay())
  }
  nativeTheme.on('updated', onThemeChange)
  window.on('closed', () => nativeTheme.off('updated', onThemeChange))

  window.once('ready-to-show', () => window.show())
  loadRenderer(window)
  return window
}
