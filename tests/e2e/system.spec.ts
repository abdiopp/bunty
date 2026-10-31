import { existsSync, readFileSync, rmSync } from 'fs'
import { join } from 'path'
import { expect, test } from '@playwright/test'
import { addDays, toLocalDate } from '../../src/shared/dates'
import { answerDialogs, editDatabase, launch, windowAt, type Launched } from './helpers'

const today = (): string => toLocalDate(new Date())

let run: Launched

test.beforeEach(async () => {
  run = await launch()
})

test.afterEach(async () => {
  await run.app.close()
  rmSync(run.userData, { recursive: true, force: true })
})

const create = (task: Parameters<typeof window.api.tasks.create>[0]) =>
  run.page.evaluate((input) => window.api.tasks.create(input), task)

test.describe('desktop widget', () => {
  test('shows today’s tasks, ticks them, and the main window follows', async () => {
    await create({ title: 'Water plants', date: today() })
    await run.page.getByRole('button', { name: 'Settings' }).click()
    await run.page.getByRole('switch', { name: 'Show widget' }).click()

    const widget = await windowAt(run.app, 'widget')
    await expect(widget.getByRole('listitem', { name: 'Water plants' })).toBeVisible()
    const info = await run.app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().endsWith('#widget')
      )!
      return { visible: window.isVisible(), onTop: window.isAlwaysOnTop() }
    })
    // Off by default: it sits with your other windows rather than above them.
    expect(info).toEqual({ visible: true, onTop: false })

    await widget.getByRole('checkbox', { name: 'Complete Water plants' }).click()
    await expect
      .poll(async () => (await run.page.evaluate(() => window.api.tasks.counts())).doneToday)
      .toBe(1)
  })

  test('closing it with the keyboard switches it off', async () => {
    await run.page.evaluate(() => window.api.settings.update({ widgetVisible: true }))
    await windowAt(run.app, 'widget')
    // What Alt+F4 does.
    await run.app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().endsWith('#widget'))!
        .close()
    )
    await expect
      .poll(async () => (await run.page.evaluate(() => window.api.settings.get())).widgetVisible)
      .toBe(false)
    const visible = await run.app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().endsWith('#widget'))
        ?.isVisible()
    )
    expect(visible).toBe(false)
  })

  test('remembers where it was put', async () => {
    await run.page.evaluate(() => window.api.settings.update({ widgetVisible: true }))
    await windowAt(run.app, 'widget')
    await run.app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().endsWith('#widget')
      )!
      window.setBounds({ x: 120, y: 140, width: 320, height: 420 })
      window.emit('moved')
    })
    await expect
      .poll(async () => (await run.page.evaluate(() => window.api.settings.get())).widgetBounds)
      .toEqual({ x: 120, y: 140, width: 320, height: 420 })
  })
})

test('closing the window keeps Bunty running in the tray', async () => {
  await run.app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((w) => !w.webContents.getURL().includes('#'))!
      .close()
  )
  await expect
    .poll(() =>
      run.app.evaluate(({ BrowserWindow }) => {
        const main = BrowserWindow.getAllWindows().find(
          (w) => !w.webContents.getURL().includes('#')
        )
        return main
          ? { exists: true, visible: main.isVisible() }
          : { exists: false, visible: false }
      })
    )
    .toEqual({ exists: true, visible: false })
})

test('days missed while the app was closed are closed on launch, breaking the streak', async () => {
  await create({ title: 'Yesterday’s task', date: today() })
  await run.app.close()
  // As if the task had been due two days ago and Bunty was last closed before then.
  editDatabase(
    run.userData,
    `UPDATE tasks SET date = '${addDays(today(), -2)}', original_date = '${addDays(today(), -2)}';
     UPDATE settings SET value = '"${addDays(today(), -3)}"' WHERE key = 'meta.lastClosedDate';`
  )
  run = await launch(run.userData)

  const [task] = await run.page.evaluate(() => window.api.tasks.list({ search: 'Yesterday' }))
  expect(task.status).toBe('missed')
  const heatmap = await run.page.evaluate(() => window.api.streaks.heatmap())
  expect(heatmap.find((day) => day.date === addDays(today(), -2))).toMatchObject({
    due: 1,
    done: 0
  })
})

test('streaks and reports render from real data', async () => {
  await create({ title: 'Done today', date: today() })
  const [task] = await run.page.evaluate(() => window.api.tasks.list({}))
  await run.page.evaluate((id) => window.api.tasks.complete(id), task.id)

  await run.page.getByRole('button', { name: /^Streaks/ }).click()
  await expect(run.page.getByText('Current streak')).toBeVisible()
  await expect(run.page.getByRole('grid', { name: 'Days completed' })).toBeVisible()

  await run.page.getByRole('button', { name: /^Reports/ }).click()
  await expect(run.page.getByRole('region', { name: 'Completed and missed by day' })).toBeVisible()
  await run.page.getByRole('radio', { name: 'History' }).click()
  await expect(run.page.getByText('Done today').first()).toBeVisible()
})

test('exports a report as CSV and PDF', async () => {
  await create({ title: '=SUM(1,2)', date: today() })
  await run.page.getByRole('button', { name: /^Reports/ }).click()

  const csv = join(run.userData, 'report.csv')
  await answerDialogs(run.app, { save: csv })
  await run.page.getByRole('button', { name: 'Export' }).click()
  await run.page.getByRole('menuitem', { name: 'Tasks as CSV' }).click()
  await expect.poll(() => existsSync(csv)).toBe(true)
  // Formula-looking titles stay text in a spreadsheet.
  expect(readFileSync(csv, 'utf8')).toContain(`"'=SUM(1,2)"`)

  const pdf = join(run.userData, 'report.pdf')
  await answerDialogs(run.app, { save: pdf })
  await run.page.getByRole('button', { name: 'Export' }).click()
  await run.page.getByRole('menuitem', { name: 'Report as PDF' }).click()
  await expect.poll(() => existsSync(pdf)).toBe(true)
  expect(readFileSync(pdf).subarray(0, 5).toString()).toBe('%PDF-')
})

test('backs up and restores everything', async () => {
  await create({ title: 'Keep this' })
  const file = join(run.userData, 'backup.json')
  await answerDialogs(run.app, { save: file })
  await run.page.getByRole('button', { name: 'Settings' }).click()
  await run.page.getByRole('button', { name: 'Back up…' }).click()
  await expect.poll(() => existsSync(file)).toBe(true)

  await create({ title: 'Made after the backup' })
  await answerDialogs(run.app, { open: file, confirm: true })
  await run.page.getByRole('button', { name: 'Restore…' }).click()
  await expect(run.page.getByText(/Restored \d+ tasks/)).toBeVisible()

  const titles = await run.page.evaluate(() =>
    window.api.tasks.list({}).then((tasks) => tasks.map((task) => task.title))
  )
  expect(titles).toEqual(['Keep this'])
})

test('changes the quick-add shortcut by pressing it', async () => {
  await run.page.getByRole('button', { name: 'Settings' }).click()
  await run.page.getByRole('button', { name: 'Change' }).click()
  // ⌘ on a Mac and Ctrl on Windows both record as CommandOrControl.
  await run.page.keyboard.press('ControlOrMeta+Alt+KeyK')

  await expect(run.page.getByText('Shortcut changed')).toBeVisible()
  const registered = await run.app.evaluate(({ globalShortcut }) => ({
    next: globalShortcut.isRegistered('CommandOrControl+Alt+K'),
    old: globalShortcut.isRegistered('CommandOrControl+Shift+Space')
  }))
  expect(registered).toEqual({ next: true, old: false })
})
