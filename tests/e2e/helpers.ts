import { execFileSync } from 'child_process'
import { mkdtempSync } from 'fs'
import { createRequire } from 'module'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  _electron as electron,
  expect,
  type ElectronApplication,
  type Page
} from '@playwright/test'

export const ROOT = join(__dirname, '../..')

export interface Launched {
  app: ElectronApplication
  page: Page
  userData: string
}

export function newProfile(): string {
  return mkdtempSync(join(tmpdir(), 'bunty-e2e-'))
}

/** Starts the built app on a throwaway profile and returns its main window. */
export async function launch(userData = newProfile(), args: string[] = []): Promise<Launched> {
  const app = await electron.launch({
    cwd: ROOT,
    colorScheme: null,
    args: ['.', `--user-data-dir=${userData}`, ...args]
  })
  await app.firstWindow()
  await expect.poll(() => app.windows().find((w) => !w.url().includes('#'))).toBeTruthy()
  const page = app.windows().find((w) => !w.url().includes('#'))!
  await page.getByRole('navigation', { name: 'Sidebar' }).waitFor()
  return { app, page, userData }
}

/** Finds an extra window (widget, quick add) by its route. */
export async function windowAt(app: ElectronApplication, route: string): Promise<Page> {
  await expect.poll(() => app.windows().find((w) => w.url().endsWith(`#${route}`))).toBeTruthy()
  return app.windows().find((w) => w.url().endsWith(`#${route}`))!
}

/** Edits the database while the app is closed, for states the app won't create itself. */
export function editDatabase(userData: string, sql: string): void {
  const electronBinary = createRequire(__filename)('electron') as unknown as string
  const script = `
    const db = require(${JSON.stringify(join(ROOT, 'node_modules/better-sqlite3'))})(${JSON.stringify(join(userData, 'bunty.sqlite'))})
    db.exec(${JSON.stringify(sql)})
    db.close()`
  execFileSync(electronBinary, ['-e', script], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
  })
}

/** Native dialogs can't be clicked by a test, so they're answered from the main process. */
export async function answerDialogs(
  app: ElectronApplication,
  answers: { save?: string; open?: string; confirm?: boolean }
): Promise<void> {
  await app.evaluate(({ dialog }, { save, open, confirm }) => {
    if (save) dialog.showSaveDialog = (async () => ({ canceled: false, filePath: save })) as never
    if (open)
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [open] })) as never
    if (confirm !== undefined) {
      dialog.showMessageBox = (async () => ({
        response: confirm ? 0 : 1,
        checkboxChecked: false
      })) as never
    }
  }, answers)
}
