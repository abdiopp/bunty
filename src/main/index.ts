import { join } from 'path'
import { app, BrowserWindow, dialog, Menu, nativeTheme } from 'electron'
import { normalizeLocale, prefersDayFirst } from '@shared/quick-add'
import type { Settings } from '@shared/schemas'
import { systemClock } from './clock'
import { createActivityRepo } from './db/activity-repo'
import { openDatabase } from './db/connection'
import { AppError } from './errors'
import { broadcast } from './ipc/broadcast'
import { registerRoutes } from './ipc/router'
import { createRoutes } from './ipc/routes'
import { hardenWebContents, isTrustedSender, restrictPermissions } from './security'
import { startScheduler } from './scheduler'
import { createShell, hotkeyLabel } from './shell'
import { toLocalDate } from '@shared/dates'
import { createCategoryService } from './services/category-service'
import { createReminders } from './services/reminders'
import { createRollover } from './services/rollover'
import { createMetaStore, createSettingsService } from './services/settings-service'
import { createBackupFiles } from './backup-files'
import { createBackupService } from './services/backup-service'
import { createReportService } from './services/report-service'
import { createReportExports } from './reports/save'
import { createStreakService } from './services/streak-service'
import { createVoiceService } from './services/voice-service'
import { createSecrets } from './secrets'
import { createTaskService } from './services/task-service'

/** Must match electron-builder's appId, or Windows won't show the app's notifications. */
const APP_ID = 'com.bunty.app'

const WIDGET_KEYS: (keyof Settings)[] = [
  'widgetVisible',
  'widgetAlwaysOnTop',
  'widgetLocked',
  'widgetOpacity'
]

function start(): void {
  app.setAppUserModelId(APP_ID)
  // Electron's default menu brings reload and developer tools shortcuts; the installed app
  // keeps only what a Mac needs for copy and paste.
  if (app.isPackaged) {
    Menu.setApplicationMenu(
      process.platform === 'darwin'
        ? Menu.buildFromTemplate([
            { role: 'appMenu' },
            { role: 'editMenu' },
            { role: 'windowMenu' }
          ])
        : null
    )
  }
  restrictPermissions()

  let db: ReturnType<typeof openDatabase>
  try {
    db = openDatabase(join(app.getPath('userData'), 'bunty.sqlite'))
  } catch (err) {
    // Better to stop here than open a window that can't load or save anything.
    dialog.showErrorBox('Bunty could not open its data', String(err))
    app.exit(1)
    return
  }
  app.on('will-quit', () => db.close())

  const meta = createMetaStore(db, systemClock)

  const tasks = createTaskService({
    db,
    clock: systemClock,
    onChange: (ids) => {
      broadcast('tasks:changed', { ids })
      shell.refreshTray()
    }
  })
  const categories = createCategoryService({
    db,
    clock: systemClock,
    onChange: () => broadcast('categories:changed')
  })
  const settings = createSettingsService({
    db,
    clock: systemClock,
    validate: (next, previous) => {
      if (next.quickAddHotkey === previous.quickAddHotkey) return
      if (!shell.setHotkey(next.quickAddHotkey)) {
        throw new AppError(
          'HOTKEY_TAKEN',
          `${hotkeyLabel(next.quickAddHotkey)} is already used by another app, or isn't a valid shortcut.`
        )
      }
    },
    onChange: (next, previous) => {
      // Every window follows the OS-level color scheme, so setting it here themes them all.
      nativeTheme.themeSource = next.theme
      if (WIDGET_KEYS.some((key) => next[key] !== previous[key])) shell.syncWidget(next)
      if (next.launchAtStartup !== previous.launchAtStartup) shell.applyLoginItem(next)
      broadcast('settings:changed', next)
    }
  })

  const shell = createShell({
    settings: () => settings.get(),
    saveWidgetBounds: (widgetBounds) => settings.update({ widgetBounds }),
    setWidgetVisible: (widgetVisible) => settings.update({ widgetVisible }),
    dueToday: () => {
      const counts = tasks.counts()
      return counts.today + counts.overdue
    },
    trayHintShown: () => meta.get<boolean>('trayHintShown') === true,
    markTrayHintShown: () => meta.set('trayHintShown', true)
  })

  const secrets = createSecrets(db, systemClock)
  const voice = createVoiceService({
    settings: () => settings.get(),
    apiKey: () => secrets.get('openaiKey')
  })

  const reports = createReportService({
    db,
    clock: systemClock,
    weekStart: () => settings.get().weekStart
  })
  const reportExports = createReportExports(reports, () => settings.get().weekStart)

  // After a restore, everything in memory follows the restored data.
  const backupFiles = createBackupFiles(createBackupService({ db, clock: systemClock }), () => {
    const next = settings.get()
    nativeTheme.themeSource = next.theme
    shell.setHotkey(next.quickAddHotkey)
    shell.syncWidget(next)
    shell.applyLoginItem(next)
    tasks.ensureOccurrences()
    broadcast('settings:changed', next)
    broadcast('categories:changed')
    broadcast('tasks:changed', { ids: [] })
    shell.refreshTray()
  })

  const initial = settings.get()
  nativeTheme.themeSource = initial.theme

  registerRoutes(
    createRoutes({
      tasks,
      categories,
      activity: createActivityRepo(db),
      settings,
      streaks: createStreakService({ db, clock: systemClock }),
      backup: backupFiles,
      reports: {
        summary: reports.summary,
        exportCsv: reportExports.exportCsv,
        exportPdf: reportExports.exportPdf
      },
      voice: {
        ...voice,
        setApiKey: (key) => {
          secrets.set('openaiKey', key)
          return voice.status()
        },
        browse: async (kind) => {
          const parent = BrowserWindow.getFocusedWindow()
          const options: Electron.OpenDialogOptions = {
            title: kind === 'program' ? 'Choose the whisper.cpp program' : 'Choose a whisper model',
            properties: ['openFile'],
            filters:
              kind === 'program'
                ? process.platform === 'win32'
                  ? [{ name: 'Programs', extensions: ['exe'] }]
                  : []
                : [{ name: 'Whisper models', extensions: ['bin', 'gguf'] }]
          }
          const result = parent
            ? await dialog.showOpenDialog(parent, options)
            : await dialog.showOpenDialog(options)
          const path = result.canceled ? null : (result.filePaths[0] ?? null)
          // Saved here, never by a page: only a file the user picked becomes a program to run.
          if (path)
            settings.update(kind === 'program' ? { whisperPath: path } : { whisperModel: path })
          return path
        }
      },
      shell: {
        info: () => ({
          version: app.getVersion(),
          platform: process.platform,
          locale: normalizeLocale(app.getSystemLocale()),
          dayFirst: prefersDayFirst(app.getSystemLocale()),
          quickAddShortcut: shell.hotkey()
        }),
        closeQuickAdd: shell.closeQuickAdd,
        resizeQuickAdd: shell.resizeQuickAdd,
        openQuickAdd: shell.openQuickAdd,
        resizeWidget: shell.resizeWidget,
        showTask: shell.showTask,
        showMain: () => void shell.showMain(),
        reveal: reportExports.reveal
      }
    }),
    isTrustedSender
  )
  shell.start(initial)

  const stopScheduler = startScheduler({
    rollover: createRollover({ db, clock: systemClock, meta, tasks }),
    reminders: createReminders({ db, clock: systemClock, meta }),
    settings: () => settings.get(),
    notify: shell.notify,
    showTask: shell.showTask,
    showMain: () => void shell.showMain(),
    onRolledOver: ({ missed }) => {
      broadcast('tasks:changed', { ids: missed })
      broadcast('day:rolledOver', { date: toLocalDate(new Date()) })
      shell.refreshTray()
    }
  })
  app.on('will-quit', stopScheduler)
}

// A second copy would mean two writers on one database, so hand over to the first instead.
if (app.requestSingleInstanceLock()) {
  hardenWebContents()
  // The tray keeps Bunty running; it quits only from the tray or app menu.
  app.on('window-all-closed', () => {})
  void app.whenReady().then(start)
} else {
  app.quit()
}
