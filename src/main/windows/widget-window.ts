import { BrowserWindow, screen, type Rectangle } from 'electron'
import type { Bounds, Settings } from '@shared/schemas'
import { loadRenderer, PRELOAD } from './renderer-url'

const DEFAULT_SIZE = { width: 300, height: 400 }
const MARGIN = 24

/** Saved bounds, if they still land on a connected screen; otherwise the top-right corner. */
function startingBounds(saved: Bounds | null): Rectangle {
  const visible =
    saved &&
    screen.getAllDisplays().some(({ workArea: area }) => {
      const overlapX =
        Math.min(saved.x + saved.width, area.x + area.width) - Math.max(saved.x, area.x)
      const overlapY =
        Math.min(saved.y + saved.height, area.y + area.height) - Math.max(saved.y, area.y)
      // Enough of it showing to grab and drag back.
      return overlapX >= 80 && overlapY >= 40
    })
  if (saved && visible) return saved
  const { workArea } = screen.getPrimaryDisplay()
  return {
    ...DEFAULT_SIZE,
    x: workArea.x + workArea.width - DEFAULT_SIZE.width - MARGIN,
    y: workArea.y + MARGIN
  }
}

/**
 * The desktop widget: today's open and overdue tasks in a small frameless window. It stays out
 * of the taskbar, sits under other windows unless "always on top" is set, and remembers where
 * it was left.
 */
export function createWidgetWindow(settings: Settings, onMoved: () => void): BrowserWindow {
  const window = new BrowserWindow({
    ...startingBounds(settings.widgetBounds),
    show: false,
    frame: false,
    transparent: true,
    hasShadow: false,
    // Transparent windows can't be resized from their edges on Windows; the page has a grip.
    resizable: false,
    movable: !settings.widgetLocked,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: settings.widgetAlwaysOnTop,
    title: 'Bunty',
    webPreferences: {
      preload: PRELOAD,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  window.on('moved', onMoved)
  // The shell shows it once ready, if it's still wanted by then.
  loadRenderer(window, 'widget')
  return window
}

export function applyWidgetSettings(window: BrowserWindow, settings: Settings): void {
  window.setAlwaysOnTop(settings.widgetAlwaysOnTop)
  window.setMovable(!settings.widgetLocked)
}

export function resizeWidget(window: BrowserWindow, size: { width: number; height: number }): void {
  const [x, y] = window.getPosition()
  window.setBounds({
    x,
    y,
    width: Math.round(Math.min(1200, Math.max(240, size.width))),
    height: Math.round(Math.min(1400, Math.max(180, size.height)))
  })
}
