import { Menu, nativeImage, Tray } from 'electron'
import { resourcePath } from './windows/resources'

export interface TrayActions {
  open: () => void
  quickAdd: () => void
  toggleWidget: () => void
  quit: () => void
}

export interface TrayState {
  widgetVisible: boolean
  /** e.g. "Ctrl+Shift+Space", shown beside "Quick add". */
  hotkeyLabel: string
  /** Open tasks due today, for the tooltip. */
  dueToday: number
}

export function createTray(actions: TrayActions): {
  tray: Tray
  update: (state: TrayState) => void
} {
  // macOS wants a black "template" image it can tint; Windows shows the full-colour icon.
  const icon = nativeImage.createFromPath(
    resourcePath(process.platform === 'darwin' ? 'trayTemplate.png' : 'tray.png')
  )
  if (process.platform === 'darwin') icon.setTemplateImage(true)
  const tray = new Tray(icon)

  // On Windows a click on the tray icon opens the app; the menu is on right-click.
  tray.on('click', actions.open)

  const update = (state: TrayState): void => {
    tray.setToolTip(
      state.dueToday === 0
        ? 'Bunty: nothing left for today'
        : `Bunty: ${state.dueToday} ${state.dueToday === 1 ? 'task' : 'tasks'} left today`
    )
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Open Bunty', click: actions.open },
        { label: 'Quick add', sublabel: state.hotkeyLabel, click: actions.quickAdd },
        {
          label: 'Show widget',
          type: 'checkbox',
          checked: state.widgetVisible,
          click: actions.toggleWidget
        },
        { type: 'separator' },
        { label: 'Quit Bunty', click: actions.quit }
      ])
    )
  }

  return { tray, update }
}
