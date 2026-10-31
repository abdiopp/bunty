import { join } from 'path'
import { pathToFileURL } from 'url'
import { app, session, shell, type IpcMainInvokeEvent } from 'electron'

const RENDERER_DIR = join(__dirname, '../renderer')

/** True when a URL is one of our own pages, in dev (Vite server) or packaged (file://). */
function isAppUrl(url: string): boolean {
  const devServer = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devServer) return new URL(url).origin === new URL(devServer).origin
  return url.startsWith(pathToFileURL(RENDERER_DIR).href + '/')
}

/** IPC is only honoured from the top frame of our own pages. */
export function isTrustedSender(event: IpcMainInvokeEvent): boolean {
  const frame = event.senderFrame
  return frame !== null && frame.parent === null && isAppUrl(frame.url)
}

/** Windows can't navigate away or spawn others; https links open in the default browser. */
export function hardenWebContents(): void {
  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('https://')) void shell.openExternal(url)
      return { action: 'deny' }
    })
    contents.on('will-navigate', (event, url) => {
      if (!isAppUrl(url)) event.preventDefault()
    })
  })
}

/** Every permission is refused except the microphone, for voice input, on our own pages. */
export function restrictPermissions(): void {
  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback, details) => {
    const types = 'mediaTypes' in details ? (details.mediaTypes ?? []) : []
    const microphoneOnly = types.length > 0 && types.every((type) => type === 'audio')
    callback(permission === 'media' && microphoneOnly && isAppUrl(details.requestingUrl))
  })
  session.defaultSession.setPermissionCheckHandler((_contents, permission, origin, details) => {
    if (permission !== 'media' || details.mediaType !== 'audio') return false
    return isAppUrl(details.requestingUrl ?? origin)
  })
}
