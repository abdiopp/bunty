const KEYS: Record<string, string> = {
  Space: 'Space',
  Enter: 'Enter',
  Tab: 'Tab',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  Insert: 'Insert',
  Delete: 'Delete',
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/'
}

type KeyPress = Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>

/**
 * A key press as an Electron accelerator, by physical key so it works on any keyboard layout.
 * It needs Ctrl, Alt or Win (⌘ on a Mac): a global shortcut on a bare key would steal typing.
 */
export function acceleratorFor(press: KeyPress, platform: string | undefined): string | null {
  const key = /^Key[A-Z]$/.test(press.code)
    ? press.code.slice(3)
    : /^Digit\d$/.test(press.code)
      ? press.code.slice(5)
      : /^F([1-9]|1\d|2[0-4])$/.test(press.code)
        ? press.code
        : KEYS[press.code]
  if (!key) return null

  const mac = platform === 'darwin'
  const parts: string[] = []
  if (mac ? press.metaKey : press.ctrlKey) parts.push('CommandOrControl')
  if (mac && press.ctrlKey) parts.push('Control')
  if (!mac && press.metaKey) parts.push('Super')
  if (press.altKey) parts.push('Alt')
  if (parts.length === 0) return null
  if (press.shiftKey) parts.push('Shift')
  return [...parts, key].join('+')
}
