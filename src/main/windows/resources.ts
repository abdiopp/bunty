import { join } from 'path'
import { app } from 'electron'

/** Icons and other files shipped beside the app (electron-builder's extraResources). */
export function resourcePath(name: string): string {
  const base = app.isPackaged
    ? join(process.resourcesPath, 'resources')
    : join(__dirname, '../../resources')
  return join(base, name)
}
