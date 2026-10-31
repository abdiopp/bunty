import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

// Runs under Electron's own Node (see the "test" script), so tests exercise the same Node and
// better-sqlite3 runtime that ships in the app rather than whatever Node is installed locally.
export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve('src/shared'),
      '@main': resolve('src/main'),
      '@renderer': resolve('src/renderer/src')
    }
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    pool: 'forks',
    environment: 'node'
  }
})
