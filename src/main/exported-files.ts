import { shell } from 'electron'

/** Files Bunty wrote this session; only these can be revealed in Explorer from a page. */
const exported = new Set<string>()

export function rememberExport(path: string): void {
  exported.add(path)
}

export function revealExport(path: string): void {
  if (exported.has(path)) shell.showItemInFolder(path)
}
