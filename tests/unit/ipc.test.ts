import { beforeEach, describe, expect, it, vi } from 'vitest'
import { dispatch, type Route, type Routes } from '@main/ipc/dispatch'
import { createRoutes } from '@main/ipc/routes'
import type { Channel } from '@shared/ipc'
import { testApp, type TestApp } from './helpers'

const ID = '00000000-0000-4000-8000-000000000000'

describe('IPC dispatch', () => {
  let app: TestApp
  let routes: Routes

  const send = (channel: Channel, payload?: unknown) =>
    dispatch(routes[channel] as Route<Channel>, payload)

  beforeEach(() => {
    app = testApp()
    routes = createRoutes({
      ...app,
      voice: {
        status: async () => ({ provider: 'off', ready: false, hasKey: false }),
        transcribe: async () => ({ text: '' }),
        setApiKey: async () => ({ provider: 'off', ready: false, hasKey: false }),
        browse: async () => null
      },
      shell: {
        info: () => {
          throw new Error('not used')
        },
        closeQuickAdd: () => {},
        resizeQuickAdd: () => {},
        openQuickAdd: () => {},
        resizeWidget: () => {},
        showTask: () => {},
        showMain: () => {},
        reveal: () => {}
      },
      backup: {
        exportFile: async () => null,
        importFile: async () => null
      },
      reports: {
        summary: () => {
          throw new Error('not used')
        },
        exportCsv: async () => null,
        exportPdf: async () => null
      }
    })
  })

  it('returns the result of a valid request', async () => {
    const result = await send('tasks:create', { title: '  Call Ali  ' })
    expect(result).toMatchObject({ ok: true, data: { title: 'Call Ali' } })
  })

  it.each([
    ['an empty title', 'tasks:create', { title: '   ' }],
    ['a field that does not exist', 'tasks:create', { title: 'x', status: 'done' }],
    ['an impossible date', 'tasks:create', { title: 'x', date: '2026-02-30' }],
    ['a non-string title', 'tasks:create', { title: { $ne: null } }],
    ['a bad id', 'tasks:complete', '1 OR 1=1'],
    ['no id at all', 'tasks:get', undefined],
    ['an empty patch', 'tasks:update', { id: ID, patch: {} }],
    ['a column in a patch', 'tasks:update', { id: ID, patch: { deleted_at: 'now' } }],
    [
      'a weekday out of range',
      'tasks:create',
      {
        title: 'x',
        recurrence: { kind: 'custom', weekdays: [9] }
      }
    ],
    ['an invalid color', 'categories:create', { name: 'x', color: 'red' }],
    ['an unknown theme', 'settings:update', { theme: 'blue' }],
    ['an unknown setting', 'settings:update', { theme: 'dark', admin: true }],
    ['a program for Bunty to run', 'settings:update', { whisperPath: '/bin/sh' }],
    ['a huge popup', 'quickAdd:resize', 50_000],
    ['audio that is not bytes', 'voice:transcribe', 'not audio'],
    ['an empty recording', 'voice:transcribe', new Uint8Array(10)],
    ['a short API key', 'voice:setApiKey', 'sk-123'],
    ['an unknown file kind', 'voice:browse', 'anything']
  ] as const)('rejects %s before it reaches the database', async (_name, channel, payload) => {
    const result = await send(channel, payload)
    expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION' } })
    expect(app.tasks.list({})).toEqual([])
  })

  it('passes an expected failure through with its code', async () => {
    const result = await send('tasks:get', ID)
    expect(result).toEqual({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'That task no longer exists.' }
    })
  })

  it('hides the details of an unexpected failure', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    app.db.close()

    const result = await send('tasks:list', {})

    expect(result).toMatchObject({ ok: false, error: { code: 'INTERNAL' } })
    expect(JSON.stringify(result)).not.toMatch(/database|sqlite/i)
    expect(log).toHaveBeenCalled()
    log.mockRestore()
  })

  it('has a route for every channel in the contract', () => {
    expect(Object.keys(routes).sort()).toEqual([
      'activity:list',
      'app:info',
      'app:openTask',
      'app:reveal',
      'app:show',
      'backup:export',
      'backup:import',
      'categories:create',
      'categories:list',
      'categories:remove',
      'categories:update',
      'quickAdd:close',
      'quickAdd:open',
      'quickAdd:resize',
      'reports:exportCsv',
      'reports:exportPdf',
      'reports:summary',
      'settings:get',
      'settings:update',
      'streaks:heatmap',
      'streaks:summary',
      'tasks:complete',
      'tasks:counts',
      'tasks:create',
      'tasks:get',
      'tasks:list',
      'tasks:remove',
      'tasks:reopen',
      'tasks:reschedule',
      'tasks:rescheduleOverdue',
      'tasks:restore',
      'tasks:update',
      'voice:browse',
      'voice:setApiKey',
      'voice:status',
      'voice:transcribe',
      'widget:resize'
    ])
  })
})
