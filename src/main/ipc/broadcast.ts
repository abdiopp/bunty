import { BrowserWindow } from 'electron'
import type { EventName, Events } from '@shared/ipc'

/** Tells every open window, so the main window, widget and quick-add popup stay in step. */
export function broadcast<E extends EventName>(event: E, payload?: Events[E]): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(event, payload)
  }
}
