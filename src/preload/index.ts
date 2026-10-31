import { contextBridge, ipcRenderer } from 'electron'
import {
  EVENT_NAMES,
  type Api,
  type ApiResult,
  type Channel,
  type Contract,
  type EventName
} from '@shared/ipc'

function call<C extends Channel>(channel: C) {
  return async (req?: Contract[C]['req']): Promise<Contract[C]['res']> => {
    const result: ApiResult<Contract[C]['res']> = await ipcRenderer.invoke(channel, req)
    if (result.ok) return result.data
    throw result.error
  }
}

// Each method is listed by hand, so the page gets these calls and nothing else: no raw
// ipcRenderer, and no way to reach a channel that isn't named here.
const api: Api = {
  tasks: {
    list: call('tasks:list'),
    get: call('tasks:get'),
    create: call('tasks:create'),
    update: call('tasks:update'),
    complete: call('tasks:complete'),
    reopen: call('tasks:reopen'),
    reschedule: call('tasks:reschedule'),
    rescheduleOverdue: call('tasks:rescheduleOverdue'),
    remove: call('tasks:remove'),
    restore: call('tasks:restore'),
    counts: call('tasks:counts')
  },
  categories: {
    list: call('categories:list'),
    create: call('categories:create'),
    update: call('categories:update'),
    remove: call('categories:remove')
  },
  activity: {
    list: call('activity:list')
  },
  settings: {
    get: call('settings:get'),
    update: call('settings:update')
  },
  app: {
    info: call('app:info'),
    openTask: call('app:openTask'),
    show: call('app:show'),
    reveal: call('app:reveal')
  },
  quickAdd: {
    close: call('quickAdd:close'),
    resize: call('quickAdd:resize'),
    open: call('quickAdd:open')
  },
  widget: {
    resize: call('widget:resize')
  },
  streaks: {
    summary: call('streaks:summary'),
    heatmap: call('streaks:heatmap')
  },
  backup: {
    export: call('backup:export'),
    import: call('backup:import')
  },
  reports: {
    summary: call('reports:summary'),
    exportCsv: call('reports:exportCsv'),
    exportPdf: call('reports:exportPdf')
  },
  voice: {
    status: call('voice:status'),
    setApiKey: call('voice:setApiKey'),
    transcribe: call('voice:transcribe'),
    browse: call('voice:browse')
  },
  on(event, listener) {
    if (!EVENT_NAMES.includes(event as EventName)) {
      throw new Error(`Unknown event: ${String(event)}`)
    }
    const handler = (_event: unknown, payload: Parameters<typeof listener>[0]): void =>
      listener(payload)
    ipcRenderer.on(event, handler)
    return () => ipcRenderer.removeListener(event, handler)
  }
}

contextBridge.exposeInMainWorld('api', api)
