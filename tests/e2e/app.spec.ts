import { execFileSync } from 'child_process'
import { mkdtempSync, rmSync } from 'fs'
import { createRequire } from 'module'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Locator,
  type Page
} from '@playwright/test'
import { addDays, toLocalDate } from '../../src/shared/dates'

const ROOT = join(__dirname, '../..')
const today = (): string => toLocalDate(new Date())

let userData: string
let app: ElectronApplication
let page: Page
let pageErrors: string[]

/** The main window; the hidden quick-add popup is the other one. */
async function mainWindow(electronApp: ElectronApplication): Promise<Page> {
  await electronApp.firstWindow()
  await expect
    .poll(() => electronApp.windows().find((w) => !w.url().includes('#quick-add')))
    .toBeTruthy()
  return electronApp.windows().find((w) => !w.url().includes('#quick-add'))!
}

// A throwaway profile each time, so tests never touch real data. No color-scheme emulation,
// so the app's own theme setting is what the page sees.
async function launch(): Promise<void> {
  app = await electron.launch({
    cwd: ROOT,
    colorScheme: null,
    args: ['.', `--user-data-dir=${userData}`]
  })
  page = await mainWindow(app)
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') pageErrors.push(message.text())
  })
  await page.getByRole('navigation', { name: 'Sidebar' }).waitFor()
}

/** Edits the database while the app is closed, for states the app won't create itself. */
function editDatabase(sql: string): void {
  const electronBinary = createRequire(__filename)('electron') as unknown as string
  const script = `
    const db = require(${JSON.stringify(join(ROOT, 'node_modules/better-sqlite3'))})(${JSON.stringify(join(userData, 'bunty.sqlite'))})
    db.exec(${JSON.stringify(sql)})
    db.close()`
  execFileSync(electronBinary, ['-e', script], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
  })
}

const quickAdd = (): Locator => page.getByRole('textbox', { name: 'New task' })
const row = (title: string): Locator => page.getByRole('listitem', { name: title })
const checkbox = (title: string): Locator =>
  page.getByRole('checkbox', { name: `Complete ${title}` })

async function addTask(text: string): Promise<void> {
  await quickAdd().fill(text)
  await quickAdd().press('Enter')
  await expect(quickAdd()).toHaveValue('')
}

test.beforeEach(async () => {
  userData = mkdtempSync(join(tmpdir(), 'bunty-e2e-'))
  pageErrors = []
  await launch()
})

test.afterEach(async () => {
  await app.close()
  rmSync(userData, { recursive: true, force: true })
})

test.describe('security', () => {
  test('the page has no access to Node or Electron', async () => {
    const exposed = await page.evaluate(() => ({
      require: typeof (window as unknown as { require?: unknown }).require,
      process: typeof (window as unknown as { process?: unknown }).process,
      ipcRenderer: typeof (window as unknown as { ipcRenderer?: unknown }).ipcRenderer,
      api: Object.keys(window.api).sort()
    }))

    expect(exposed).toEqual({
      require: 'undefined',
      process: 'undefined',
      ipcRenderer: 'undefined',
      api: [
        'activity',
        'app',
        'backup',
        'categories',
        'on',
        'quickAdd',
        'reports',
        'settings',
        'streaks',
        'tasks',
        'voice',
        'widget'
      ]
    })
  })

  test('every window runs in an OS-level sandbox', async () => {
    const renderers = await app.evaluate(({ app }) =>
      app.getAppMetrics().filter((process) => process.type === 'Tab')
    )
    expect(renderers.length).toBeGreaterThanOrEqual(2)
    expect(renderers.every((process) => process.sandboxed)).toBe(true)
  })

  test('the page cannot navigate away from the app', async () => {
    const before = page.url()
    await page.evaluate(() => {
      window.location.href = 'https://example.com/'
    })
    await page.waitForTimeout(300)
    expect(page.url()).toBe(before)
  })

  test('validation errors reach the page with their code intact', async () => {
    const failure = await page.evaluate(() =>
      window.api.tasks.create({ title: '   ' }).catch((err) => err)
    )
    expect(failure).toEqual({ code: 'VALIDATION', message: 'Title is required' })
  })
})

test('starts without errors in any window', async () => {
  await page.waitForTimeout(1000)
  expect(pageErrors).toEqual([])
  const info = await page.evaluate(() => window.api.app.info())
  expect(() => new Intl.DateTimeFormat(info.locale)).not.toThrow()
})

test('quick add reads the date, time, category and priority from the text', async () => {
  await quickAdd().fill('Call Ali tomorrow at 5pm #work !high')

  const recognised = page.getByRole('status', { name: 'Recognised' })
  await expect(recognised).toContainText('Tomorrow')
  await expect(recognised).toContainText('High priority')
  await expect(recognised).toContainText('New category “work”')

  await quickAdd().press('Enter')

  // It's due tomorrow, so it isn't in Today: the toast says where it went.
  await expect(page.getByText('Added “Call Ali” · Tomorrow')).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Sidebar' })).toContainText('work')

  const [task] = await page.evaluate(() => window.api.tasks.list({ search: 'Call Ali' }))
  const [category] = await page.evaluate(() => window.api.categories.list())
  expect(task).toMatchObject({
    title: 'Call Ali',
    date: addDays(today(), 1),
    time: '17:00',
    priority: 'high',
    categoryId: category.id
  })
})

test('a dismissed part goes back into the title', async () => {
  await quickAdd().fill('Read Tomorrow Never Dies tomorrow')
  await page.getByRole('status', { name: 'Recognised' }).getByRole('button').first().click()
  await quickAdd().press('Enter')

  await expect(row('Read Tomorrow Never Dies tomorrow')).toBeVisible()
})

test('the keyboard can select, complete, delete and undo', async () => {
  await addTask('First')
  await addTask('Second')
  await quickAdd().press('Escape')

  // A newly added task is selected, so you can see where it went.
  await expect(row('Second')).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('k')
  await expect(row('First')).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('j')
  await expect(row('Second')).toHaveAttribute('aria-selected', 'true')

  await page.keyboard.press('x')
  await expect(checkbox('Second')).toHaveAttribute('aria-checked', 'true')

  await page.keyboard.press('k')
  await page.keyboard.press('Delete')
  await expect(row('First')).toHaveCount(0)
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(row('First')).toBeVisible()
})

test('the detail panel edits a task and shows its history', async () => {
  await addTask('Write report')
  await row('Write report').click()
  const panel = page.getByRole('complementary', { name: 'Task details' })
  await expect(panel).toBeVisible()

  await panel.getByRole('radio', { name: 'high' }).click()
  await panel.getByRole('button', { name: 'Today' }).click()
  await page.getByRole('button', { name: /^Tomorrow/ }).click()

  await expect(panel.getByRole('region', { name: 'History' })).toContainText(
    'Moved from today to tomorrow'
  )
  const [task] = await page.evaluate(() => window.api.tasks.list({ search: 'Write report' }))
  expect(task).toMatchObject({ priority: 'high', date: addDays(today(), 1), rescheduleCount: 1 })
})

test('overdue tasks can all be moved to today at once', async () => {
  await addTask('Late one')
  await addTask('Late two')
  await app.close()
  editDatabase(`UPDATE tasks SET date = '${addDays(today(), -2)}'`)
  await launch()

  const overdue = page.getByRole('region', { name: 'Overdue' })
  await expect(overdue.getByRole('listitem')).toHaveCount(2)
  await overdue.getByRole('button', { name: 'Move all to today' }).click()

  await expect(overdue).toHaveCount(0)
  await expect(row('Late one')).toBeVisible()
  const moved = await page.evaluate(() => window.api.tasks.list({}))
  expect(moved.map((task) => [task.date, task.status])).toEqual([
    [today(), 'rescheduled'],
    [today(), 'rescheduled']
  ])
})

test('the global quick-add popup adds a task and closes', async () => {
  const popupVisible = (): Promise<boolean> =>
    app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().includes('#quick-add'))!
        .isVisible()
    )

  // What the hotkey does, minus the key press, which can't be sent to the OS from a test.
  await app.evaluate(({ BrowserWindow }) => {
    const popup = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().includes('#quick-add')
    )!
    popup.show()
    popup.webContents.send('quickAdd:opened')
  })
  const popup = app.windows().find((w) => w.url().includes('#quick-add'))!
  await popup.getByRole('textbox', { name: 'New task' }).fill('Buy milk today')
  await popup.getByRole('textbox', { name: 'New task' }).press('Enter')

  await expect.poll(popupVisible).toBe(false)
  // Written by the popup, shown live in the main window.
  await expect(row('Buy milk')).toBeVisible()
})

test('the theme setting applies to the app and is remembered', async () => {
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('radio', { name: 'Dark' }).click()

  await expect
    .poll(() => page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches))
    .toBe(true)

  await app.close()
  await launch()
  expect(await app.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe('dark')
})

test('the command palette finds a task and opens it', async () => {
  await addTask('Renew passport')
  await page.keyboard.press('ControlOrMeta+k')
  await page.keyboard.type('passport')
  await page.getByRole('option', { name: /Renew passport/ }).click()

  const panel = page.getByRole('complementary', { name: 'Task details' })
  await expect(panel.getByRole('textbox', { name: 'Title' })).toHaveValue('Renew passport')
})

test('the right-click menu reschedules', async () => {
  await addTask('Water plants')
  await row('Water plants').click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Reschedule' }).click()
  await page.getByRole('menuitem', { name: 'Tomorrow' }).click()

  await expect(row('Water plants')).toHaveCount(0)
  const [task] = await page.evaluate(() => window.api.tasks.list({ search: 'Water plants' }))
  expect(task.date).toBe(addDays(today(), 1))
})

test('tasks survive quitting and reopening the app', async () => {
  await addTask('Still here')
  await app.close()
  await launch()
  await expect(row('Still here')).toBeVisible()
})
