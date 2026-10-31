import { join } from 'path'
import { app, type BrowserWindow } from 'electron'

/** Loads the app's page, optionally at a hash route such as `quick-add`. */
export function loadRenderer(window: BrowserWindow, hash = ''): void {
  // Packaged builds ignore this variable, so it can't point the app at someone else's page.
  const devServer = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devServer) {
    void window.loadURL(hash ? `${devServer}#${hash}` : devServer)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'), { hash })
  }
}

export const PRELOAD = join(__dirname, '../preload/index.js')

/** Matches --background in main.css, so a window never flashes white before the page paints. */
export function backgroundColor(dark: boolean): string {
  return dark ? '#161618' : '#ffffff'
}
