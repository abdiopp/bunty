import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import type { Channel } from '@shared/ipc'
import { dispatch, failure, type Route, type Routes } from './dispatch'

export function registerRoutes(
  routes: Routes,
  isTrusted: (event: IpcMainInvokeEvent) => boolean
): void {
  for (const channel of Object.keys(routes) as Channel[]) {
    ipcMain.handle(channel, (event, payload: unknown) => {
      if (!isTrusted(event)) return failure('FORBIDDEN', 'This window is not allowed to do that.')
      return dispatch(routes[channel] as Route<Channel>, payload)
    })
  }
}
