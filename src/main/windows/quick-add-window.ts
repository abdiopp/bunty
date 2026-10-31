import { BrowserWindow, screen } from 'electron'
import { loadRenderer, PRELOAD } from './renderer-url'

const WIDTH = 640

/**
 * A Spotlight-style popup for adding a task from anywhere. It's created once and kept hidden,
 * so the hotkey shows it instantly instead of waiting for a page to load.
 */
export function createQuickAddWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: WIDTH,
    height: 120,
    show: false,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: PRELOAD,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // Like Spotlight: clicking anywhere else dismisses it.
  window.on('blur', () => window.hide())
  loadRenderer(window, 'quick-add')
  return window
}

/** Opens the popup near the top of whichever screen the mouse is on. */
export function showQuickAdd(window: BrowserWindow): void {
  const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const [, height] = window.getSize()
  window.setBounds({
    x: Math.round(workArea.x + (workArea.width - WIDTH) / 2),
    y: Math.round(workArea.y + workArea.height * 0.2),
    width: WIDTH,
    height
  })
  window.show()
  window.focus()
  window.webContents.send('quickAdd:opened')
}

export function resizeQuickAdd(window: BrowserWindow, height: number): void {
  const [x, y] = window.getPosition()
  window.setBounds({ x, y, width: WIDTH, height })
}
