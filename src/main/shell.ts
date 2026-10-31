// Everything the user sees outside a page: windows, the tray, the global hotkey, notifications
// and launch at login. Services don't know about any of it; index.ts connects the two.
import { app, BrowserWindow, globalShortcut, Notification } from 'electron'
import type { Settings } from '@shared/schemas'
import { createTray, type TrayState } from './tray'
import { createMainWindow } from './windows/main-window'
import { createQuickAddWindow, resizeQuickAdd, showQuickAdd } from './windows/quick-add-window'
import { resourcePath } from './windows/resources'
import { applyWidgetSettings, createWidgetWindow, resizeWidget } from './windows/widget-window'

interface Deps {
  /** Current settings, read fresh each time. */
  settings: () => Settings
  saveWidgetBounds: (bounds: Settings['widgetBounds']) => void
  setWidgetVisible: (visible: boolean) => void
  /** Open tasks due today, for the tray tooltip. */
  dueToday: () => number
  /** Shows the "still running in the tray" hint only once, ever. */
  trayHintShown: () => boolean
  markTrayHintShown: () => void
}

/** "CommandOrControl+Shift+Space" as the platform writes it. */
export function hotkeyLabel(accelerator: string): string {
  const mod = process.platform === 'darwin' ? '⌘' : 'Ctrl'
  return accelerator.replace('CommandOrControl', mod).replace('CmdOrCtrl', mod)
}

export function createShell(deps: Deps) {
  let main: BrowserWindow | null = null
  let quickAdd: BrowserWindow | null = null
  let widget: BrowserWindow | null = null
  let quitting = false
  let hotkey = { accelerator: '', registered: false }
  let tray: ReturnType<typeof createTray> | null = null
  let boundsTimer: ReturnType<typeof setTimeout> | undefined
  // A notification that nothing references can be garbage-collected while it's still in the
  // Action Center, and then clicking it does nothing. These are held until they're done with.
  const shown = new Set<Notification>()

  app.on('before-quit', () => {
    quitting = true
  })

  /** Windows signing out or shutting down doesn't send before-quit, so windows hear it here. */
  function endsWithSession(window: BrowserWindow): void {
    const end = (): void => {
      quitting = true
    }
    window.on('query-session-end', end)
    window.on('session-end', end)
  }

  function notify(title: string, body: string, onClick?: () => void): void {
    if (!Notification.isSupported()) return
    const notification = new Notification({ title, body, icon: resourcePath('icon.png') })
    const release = (): void => void shown.delete(notification)
    notification.on('click', () => {
      release()
      onClick?.()
    })
    notification.on('close', release)
    notification.on('failed', release)
    shown.add(notification)
    // Toasts left unread in the Action Center for days shouldn't pile up in memory.
    if (shown.size > 50) shown.delete(shown.values().next().value!)
    notification.show()
  }

  function showMain(): BrowserWindow {
    if (!main || main.isDestroyed()) {
      main = createMainWindow()
      endsWithSession(main)
      main.on('close', (event) => {
        if (quitting || !deps.settings().closeToTray) return
        // Closing keeps Bunty running, so reminders, the widget and the hotkey keep working.
        event.preventDefault()
        main?.hide()
        if (!deps.trayHintShown()) {
          deps.markTrayHintShown()
          notify(
            'Bunty is still running',
            'Reminders and the quick-add shortcut keep working. Find Bunty in the system tray.'
          )
        }
      })
      main.on('closed', () => {
        main = null
        // With close-to-tray off, closing the window means quitting.
        if (!quitting && !deps.settings().closeToTray) app.quit()
      })
      return main
    }
    if (main.isMinimized()) main.restore()
    main.show()
    main.focus()
    return main
  }

  function showTask(id: string): void {
    const window = showMain()
    const send = (): void => window.webContents.send('app:showTask', id)
    if (window.webContents.isLoading()) window.webContents.once('did-finish-load', send)
    else send()
  }

  function openQuickAdd(): void {
    if (!quickAdd || quickAdd.isDestroyed()) quickAdd = createQuickAddWindow()
    showQuickAdd(quickAdd)
  }

  function toggleQuickAdd(): void {
    if (quickAdd && !quickAdd.isDestroyed() && quickAdd.isVisible()) quickAdd.hide()
    else openQuickAdd()
  }

  /** Registers the global shortcut, keeping the old one if the new one can't be had. */
  function setHotkey(accelerator: string): boolean {
    const previous = hotkey
    if (previous.registered) globalShortcut.unregister(previous.accelerator)
    let registered = false
    try {
      registered = globalShortcut.register(accelerator, toggleQuickAdd)
    } catch {
      // Not a valid accelerator.
    }
    if (!registered) {
      if (previous.registered) globalShortcut.register(previous.accelerator, toggleQuickAdd)
      // The setting keeps the old shortcut, so this does too. Only at launch, with nothing
      // to keep, is the shortcut that couldn't be had recorded, so Settings can say so.
      if (previous.accelerator) return false
    }
    hotkey = { accelerator, registered }
    refreshTray()
    return registered
  }

  function syncWidget(settings: Settings): void {
    if (!settings.widgetVisible) {
      widget?.hide()
      refreshTray()
      return
    }
    if (!widget || widget.isDestroyed()) {
      const created = createWidgetWindow(settings, saveWidgetBoundsSoon)
      widget = created
      endsWithSession(created)
      // It's a glanceable surface: it appears without taking focus, once its page is ready,
      // and only if it hasn't been switched off again while that page loaded.
      created.once('ready-to-show', () => {
        if (deps.settings().widgetVisible) created.showInactive()
      })
      // Alt+F4 on the widget is the same as switching it off, so the setting and tray agree.
      created.on('close', (event) => {
        if (quitting) return
        event.preventDefault()
        deps.setWidgetVisible(false)
      })
      created.on('closed', () => {
        if (widget === created) widget = null
      })
    } else {
      applyWidgetSettings(widget, settings)
      if (!widget.isVisible()) widget.showInactive()
    }
    refreshTray()
  }

  function saveWidgetBoundsSoon(): void {
    clearTimeout(boundsTimer)
    boundsTimer = setTimeout(() => {
      if (widget && !widget.isDestroyed()) deps.saveWidgetBounds(widget.getBounds())
    }, 400)
  }

  function refreshTray(): void {
    const state: TrayState = {
      widgetVisible: deps.settings().widgetVisible,
      hotkeyLabel: hotkey.registered ? hotkeyLabel(hotkey.accelerator) : '',
      dueToday: deps.dueToday()
    }
    tray?.update(state)
  }

  /** Launch at login, packaged builds only: in development it would register Electron itself. */
  function applyLoginItem(settings: Settings): void {
    if (!app.isPackaged) return
    // Only touch the OS setting when it actually differs.
    if (app.getLoginItemSettings({ args: ['--hidden'] }).openAtLogin === settings.launchAtStartup) {
      return
    }
    app.setLoginItemSettings({ openAtLogin: settings.launchAtStartup, args: ['--hidden'] })
  }

  return {
    notify,
    showMain,
    showTask,
    openQuickAdd,
    closeQuickAdd: () => quickAdd?.hide(),
    resizeQuickAdd: (height: number) => {
      if (quickAdd && !quickAdd.isDestroyed()) resizeQuickAdd(quickAdd, height)
    },
    resizeWidget: (size: { width: number; height: number }) => {
      if (!widget || widget.isDestroyed()) return
      resizeWidget(widget, size)
      saveWidgetBoundsSoon()
    },
    setHotkey,
    hotkey: () => hotkey,
    syncWidget,
    applyLoginItem,
    refreshTray,

    /** Opens the windows and tray. Started at login, only the tray and widget appear. */
    start(settings: Settings): void {
      const atLogin =
        process.argv.includes('--hidden') || app.getLoginItemSettings().wasOpenedAtLogin
      tray = createTray({
        open: showMain,
        quickAdd: openQuickAdd,
        toggleWidget: () => deps.setWidgetVisible(!deps.settings().widgetVisible),
        quit: () => app.quit()
      })
      setHotkey(settings.quickAddHotkey)
      app.on('will-quit', () => globalShortcut.unregisterAll())
      quickAdd = createQuickAddWindow()
      if (!atLogin) showMain()
      syncWidget(settings)
      applyLoginItem(settings)
      app.on('activate', showMain)
      app.on('second-instance', showMain)
    }
  }
}

export type Shell = ReturnType<typeof createShell>
