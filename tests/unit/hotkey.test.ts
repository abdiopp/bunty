import { describe, expect, it } from 'vitest'
import { acceleratorFor } from '@renderer/lib/hotkey'

const press = (
  code: string,
  mods: Partial<Record<'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey', boolean>> = {}
) => ({
  code,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...mods
})

describe('recording a shortcut', () => {
  it('turns Ctrl+Shift+Space on Windows into the cross-platform accelerator', () => {
    expect(acceleratorFor(press('Space', { ctrlKey: true, shiftKey: true }), 'win32')).toBe(
      'CommandOrControl+Shift+Space'
    )
  })

  it('treats ⌘ as the main modifier on a Mac', () => {
    expect(acceleratorFor(press('KeyK', { metaKey: true, altKey: true }), 'darwin')).toBe(
      'CommandOrControl+Alt+K'
    )
  })

  it('uses the physical key, so layouts do not matter', () => {
    expect(acceleratorFor(press('Digit7', { altKey: true }), 'win32')).toBe('Alt+7')
    expect(acceleratorFor(press('F9', { ctrlKey: true }), 'win32')).toBe('CommandOrControl+F9')
  })

  it('refuses a key without Ctrl, Alt or Win, and a lone modifier', () => {
    expect(acceleratorFor(press('KeyA'), 'win32')).toBeNull()
    expect(acceleratorFor(press('KeyA', { shiftKey: true }), 'win32')).toBeNull()
    expect(acceleratorFor(press('ControlLeft', { ctrlKey: true }), 'win32')).toBeNull()
  })
})
