import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page
} from '@playwright/test'
import { addDays, toLocalDate } from '../../src/shared/dates'
import { answerDialogs } from './helpers'

const ROOT = join(__dirname, '../..')
const FAKE_WHISPER = join(__dirname, '../fixtures/fake-whisper.sh')

let userData: string
let app: ElectronApplication
let page: Page

// The stand-in for whisper.cpp is a shell script.
test.skip(process.platform === 'win32', 'The fake whisper.cpp is a shell script')

test.beforeEach(async () => {
  userData = mkdtempSync(join(tmpdir(), 'bunty-voice-e2e-'))
  app = await electron.launch({
    cwd: ROOT,
    args: [
      '.',
      `--user-data-dir=${userData}`,
      // Chromium's fake microphone (a steady beep), so recording works without hardware.
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream'
    ]
  })
  await app.firstWindow()
  await expect.poll(() => app.windows().find((w) => !w.url().includes('#'))).toBeTruthy()
  page = app.windows().find((w) => !w.url().includes('#'))!
  await page.getByRole('navigation', { name: 'Sidebar' }).waitFor()
})

test.afterEach(async () => {
  await app.close()
  rmSync(userData, { recursive: true, force: true })
})

test('speak, check the card, save: the whole path from microphone to task', async () => {
  // Set up the way a user would: pick the program and model in Settings. Any readable file
  // will do as the stand-in's model.
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('radio', { name: 'On this PC' }).click()
  await answerDialogs(app, { open: FAKE_WHISPER })
  await expect(page.getByRole('button', { name: 'Choose…' })).toHaveCount(2)
  for (const button of await page.getByRole('button', { name: 'Choose…' }).all()) {
    await button.click()
  }
  await expect
    .poll(() => page.evaluate(() => window.api.voice.status().then((status) => status.ready)))
    .toBe(true)
  await page
    .getByRole('navigation', { name: 'Sidebar' })
    .getByRole('button', { name: /^Today/ })
    .click()

  await page.getByRole('button', { name: 'Add by voice' }).first().click()
  await expect(page.getByRole('button', { name: 'Stop recording' })).toBeVisible()
  await page.waitForTimeout(1200)
  await page.getByRole('button', { name: 'Stop recording' }).click()

  const card = page.getByRole('form', { name: 'Confirm task' })
  await expect(card).toBeVisible()
  await expect(card).toContainText('Call Ali tomorrow at 5 p.m., high priority.')
  await expect(card.getByRole('textbox', { name: 'Title' })).toHaveValue('Call Ali')
  const tomorrow = addDays(toLocalDate(new Date()), 1)
  await expect(card.getByLabel('Date')).toHaveValue(tomorrow)
  await expect(card.getByLabel('Time')).toHaveValue('17:00')
  await expect(card.getByRole('radio', { name: 'high' })).toHaveAttribute('aria-checked', 'true')

  await card.getByRole('textbox', { name: 'Title' }).fill('Call Ali about the venue')
  await card.getByRole('button', { name: 'Save task' }).click()

  await expect(card).toHaveCount(0)
  const [task] = await page.evaluate(() => window.api.tasks.list({ search: 'Call Ali' }))
  expect(task).toMatchObject({
    title: 'Call Ali about the venue',
    date: tomorrow,
    time: '17:00',
    priority: 'high'
  })
})

test('a page cannot choose the program Bunty runs', async () => {
  const failure = await page.evaluate(() =>
    window.api.settings.update({ whisperPath: '/bin/sh' } as never).catch((err) => err)
  )
  expect(failure).toMatchObject({ code: 'VALIDATION' })
  expect((await page.evaluate(() => window.api.settings.get())).whisperPath).toBe('')
})

test('explains what to set up when voice input is not ready', async () => {
  // The default provider is OpenAI, with no key yet.
  await page.getByRole('button', { name: 'Add by voice' }).first().click()
  await expect(page.getByText('Add your OpenAI API key.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Stop recording' })).toHaveCount(0)
})
