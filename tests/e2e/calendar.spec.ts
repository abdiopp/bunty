import { mkdtempSync, rmSync } from 'fs'
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

test.beforeEach(async () => {
  userData = mkdtempSync(join(tmpdir(), 'bunty-cal-e2e-'))
  app = await electron.launch({ cwd: ROOT, args: ['.', `--user-data-dir=${userData}`] })
  await app.firstWindow()
  await expect.poll(() => app.windows().find((w) => !w.url().includes('#quick-add'))).toBeTruthy()
  page = app.windows().find((w) => !w.url().includes('#quick-add'))!
  await page.getByRole('navigation', { name: 'Sidebar' }).waitFor()
  // Room for a full month grid plus the side panel.
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((w) => w.isVisible())!
      .setSize(1440, 900)
  )
})

test.afterEach(async () => {
  await app.close()
  rmSync(userData, { recursive: true, force: true })
})

const create = (task: Parameters<typeof window.api.tasks.create>[0]) =>
  page.evaluate((input) => window.api.tasks.create(input), task)

const findTask = (title: string) =>
  page.evaluate((search) => window.api.tasks.list({ search }).then((tasks) => tasks[0]), title)

async function openCalendar(): Promise<void> {
  await page.getByRole('button', { name: /^Calendar/ }).click()
  await page.getByRole('grid', { name: 'Month' }).waitFor()
}

const cell = (date: string): Locator => page.getByRole('gridcell', { name: date })

/** Dates on screen in the month grid, so tests never assume where the month boundaries fall. */
async function visibleDates(): Promise<string[]> {
  return page
    .getByRole('gridcell')
    .evaluateAll((cells) => cells.map((c) => c.getAttribute('aria-label')!))
}

/** A real pointer drag, slow enough for the drag library to recognise it as one. */
async function drag(from: Locator, to: { x: number; y: number }): Promise<void> {
  const box = (await from.boundingBox())!
  await page.mouse.move(box.x + 6, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + 20, box.y + box.height / 2 + 10, { steps: 4 })
  await page.mouse.move(to.x, to.y, { steps: 12 })
  await page.mouse.up()
}

async function centreOf(locator: Locator): Promise<{ x: number; y: number }> {
  const box = (await locator.boundingBox())!
  return { x: box.x + box.width / 2, y: box.y + box.height - 12 }
}

test('shows tasks on their days and the selected day in the side panel', async () => {
  await create({ title: 'Call Ali', date: today(), time: '17:00' })
  await openCalendar()

  await expect(cell(today()).getByRole('button', { name: /Call Ali/ })).toBeVisible()
  const panel = page.getByRole('complementary', { name: 'Selected day' })
  await expect(panel.getByRole('listitem', { name: 'Call Ali' })).toBeVisible()
})

test('a task added in the side panel goes on the selected day', async () => {
  await openCalendar()
  const target = (await visibleDates()).find((date) => date > today())!
  await cell(target).click({ position: { x: 40, y: 12 } })

  const panel = page.getByRole('complementary', { name: 'Selected day' })
  await panel.getByRole('textbox', { name: 'New task' }).fill('Prepare slides')
  await panel.getByRole('textbox', { name: 'New task' }).press('Enter')

  await expect(panel.getByRole('listitem', { name: 'Prepare slides' })).toBeVisible()
  expect((await findTask('Prepare slides')).date).toBe(target)
})

test('dragging a task to another day reschedules it, keeping its time', async () => {
  await create({ title: 'Dentist', date: today(), time: '15:00' })
  await openCalendar()
  const target = (await visibleDates()).find((date) => date > today())!

  await drag(cell(today()).getByRole('button', { name: /Dentist/ }), await centreOf(cell(target)))

  await expect(cell(target).getByRole('button', { name: /Dentist/ })).toBeVisible()
  expect(await findTask('Dentist')).toMatchObject({
    date: target,
    time: '15:00',
    status: 'rescheduled',
    rescheduleCount: 1
  })
})

test('a past day does not accept a dropped task', async () => {
  await create({ title: 'Report', date: today() })
  await openCalendar()
  const past = (await visibleDates()).find((date) => date < today())
  test.skip(!past, 'No past day is visible in this month view today')

  await drag(cell(today()).getByRole('button', { name: /Report/ }), await centreOf(cell(past!)))

  await page.waitForTimeout(300)
  expect((await findTask('Report')).date).toBe(today())
})

test('dragging from the No date list gives a task its first date', async () => {
  await create({ title: 'Plan trip' })
  await openCalendar()
  const target = (await visibleDates()).find((date) => date > today())!
  const tray = page.getByRole('region', { name: 'No date' })

  await drag(tray.getByRole('button', { name: 'Plan trip' }), await centreOf(cell(target)))

  await expect(cell(target).getByRole('button', { name: /Plan trip/ })).toBeVisible()
  await expect(tray.getByRole('button', { name: 'Plan trip' })).toHaveCount(0)
  // Giving a first date isn't a reschedule.
  expect(await findTask('Plan trip')).toMatchObject({ date: target, rescheduleCount: 0 })
})

test('dropping on the week grid sets the time to the slot, snapped to 15 minutes', async () => {
  const tomorrow = addDays(today(), 1)
  await create({ title: 'Invoice', date: tomorrow, time: '10:00' })
  await openCalendar()

  // Select tomorrow, then switch to its week.
  await page.keyboard.press('t')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('w')
  const column = page.locator(`[data-day-column="${tomorrow}"]`)
  await column.waitFor()

  const block = column.getByRole('button', { name: /Invoice/ })
  const blockBox = (await block.boundingBox())!
  const columnBox = (await column.boundingBox())!
  // The block's top edge decides the time; aim it at 14:30.
  const grabOffset = blockBox.height / 2
  await drag(block, {
    x: columnBox.x + columnBox.width / 2,
    y: columnBox.y + 14.5 * 48 + grabOffset
  })

  await expect.poll(async () => (await findTask('Invoice')).time).toBe('14:30')
  expect((await findTask('Invoice')).date).toBe(tomorrow)
})

test('keyboard switches views and moves between periods', async () => {
  await openCalendar()
  const heading = page.getByRole('heading', { level: 1 })
  const month = await heading.textContent()

  await page.keyboard.press(']')
  await expect(heading).not.toHaveText(month!)
  await page.keyboard.press('t')
  await expect(heading).toHaveText(month!)

  await page.keyboard.press('w')
  await expect(page.getByRole('radio', { name: 'Week' })).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press('d')
  await expect(page.getByRole('radio', { name: 'Day' })).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press('m')
  await expect(page.getByRole('grid', { name: 'Month' })).toBeVisible()
})

test('color by priority is a remembered setting', async () => {
  await openCalendar()
  await page.getByRole('radio', { name: 'Color by priority' }).click()
  await expect(page.getByRole('radio', { name: 'Color by priority' })).toHaveAttribute(
    'aria-checked',
    'true'
  )
  expect((await page.evaluate(() => window.api.settings.get())).calendarColorBy).toBe('priority')
})
