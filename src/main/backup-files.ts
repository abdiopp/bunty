import { readFile, stat, writeFile } from 'fs/promises'
import { join } from 'path'
import { app, BrowserWindow, dialog } from 'electron'
import { toLocalDate } from '@shared/dates'
import { AppError } from './errors'
import { rememberExport } from './exported-files'
import type { BackupService } from './services/backup-service'

/** Far beyond any real task list; anything bigger isn't a Bunty backup. */
const MAX_BACKUP_BYTES = 200 * 1024 * 1024

const parentWindow = (): BrowserWindow | undefined => BrowserWindow.getFocusedWindow() ?? undefined

/** The dialogs and files around the backup service; `afterRestore` refreshes every window. */
export function createBackupFiles(backup: BackupService, afterRestore: () => void) {
  return {
    async exportFile(): Promise<string | null> {
      const options: Electron.SaveDialogOptions = {
        title: 'Back up Bunty',
        defaultPath: join(app.getPath('documents'), `Bunty backup ${toLocalDate(new Date())}.json`),
        filters: [{ name: 'Bunty backup', extensions: ['json'] }]
      }
      const parent = parentWindow()
      const result = parent
        ? await dialog.showSaveDialog(parent, options)
        : await dialog.showSaveDialog(options)
      if (result.canceled || !result.filePath) return null
      await writeFile(result.filePath, JSON.stringify(backup.export(), null, 2), 'utf8')
      rememberExport(result.filePath)
      return result.filePath
    },

    async importFile(): Promise<{ tasks: number } | null> {
      const parent = parentWindow()
      const options: Electron.OpenDialogOptions = {
        title: 'Restore a Bunty backup',
        properties: ['openFile'],
        filters: [{ name: 'Bunty backup', extensions: ['json'] }]
      }
      const picked = parent
        ? await dialog.showOpenDialog(parent, options)
        : await dialog.showOpenDialog(options)
      const path = picked.filePaths[0]
      if (picked.canceled || !path) return null

      if ((await stat(path)).size > MAX_BACKUP_BYTES) {
        throw new AppError('BACKUP_INVALID', 'That file is far too large to be a Bunty backup.')
      }
      let data: unknown
      try {
        data = JSON.parse(await readFile(path, 'utf8'))
      } catch {
        throw new AppError('BACKUP_INVALID', "That file isn't a Bunty backup.")
      }
      // Check it before asking, so the question is only asked about a backup that will work.
      const file = backup.validate(data)

      const confirm: Electron.MessageBoxOptions = {
        type: 'warning',
        title: 'Restore backup',
        message: `Replace everything in Bunty with this backup?`,
        detail: `It has ${file.tables.tasks.length} tasks, saved ${new Date(file.exportedAt).toLocaleString()}. A copy of your current data is kept beside Bunty's database first.`,
        buttons: ['Replace my data', 'Cancel'],
        defaultId: 1,
        cancelId: 1
      }
      const answer = parent
        ? await dialog.showMessageBox(parent, confirm)
        : await dialog.showMessageBox(confirm)
      if (answer.response !== 0) return null

      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      const safetyCopy = join(app.getPath('userData'), `bunty.sqlite.before-restore-${stamp}.bak`)
      const result = backup.restore(file, safetyCopy)
      afterRestore()
      return result
    }
  }
}
