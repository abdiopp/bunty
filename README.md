# Bunty

A fast, private task manager for the Windows desktop. Add tasks by typing ("Call Ali tomorrow at 5pm #work !high") or by voice, plan them on a calendar, keep streaks, and see how your weeks go. Everything is stored on your computer.

## Use it

Install from `Bunty-Setup-<version>.exe` (see [Build the installer](#build-the-installer)). Then:

| To | Do this |
| --- | --- |
| Add a task from any app | **Ctrl+Shift+Space** (change it in Settings) |
| Add a task in the app | **N**, then type: dates, times, `#category`, `!high`, "every monday" all work |
| Add by voice | the mic in any add box; set up OpenAI or whisper.cpp in Settings › Voice input |
| Search and run commands | **Ctrl+K** |
| See every shortcut | **?** |
| Put today on your desktop | Settings › Desktop widget |

Closing the window keeps Bunty in the tray, so reminders and the shortcut keep working. Quit from the tray icon.

### Voice input

- **OpenAI**: paste an API key in Settings. It's encrypted with Windows' own key store and recordings go to OpenAI's Whisper API.
- **On this PC**: download a [whisper.cpp](https://github.com/ggml-org/whisper.cpp/releases) release (`whisper-cli.exe`) and a model such as `ggml-base.en.bin`, then choose both in Settings. Nothing leaves your computer.

### Your data

Tasks live in `%APPDATA%\Bunty\bunty.sqlite`. Settings › Data makes a JSON backup and restores one. Uninstalling keeps your data.

## Develop

Requires Node 22. No Python or C++ compiler is needed: SQLite ships prebuilt.

```bash
npm install
npm run dev
```

| Command | What it does |
| --- | --- |
| `npm run dev` | The app with hot reload |
| `npm test` | Unit tests, on Electron's own Node |
| `npm run test:e2e` | Builds, then drives the real app with Playwright |
| `npm run typecheck`, `npm run lint` | Static checks |
| `npm run build:win` | The Windows installer, into `dist/` |
| `npm run build:dir` | An unpacked build for the current OS, for smoke-testing |

### Build the installer

```bash
npm run build:win
```

This works from Windows or a Mac. The GitHub Actions workflow in `.github/workflows/windows.yml` runs every test on Windows and attaches the installer to the run, which is the way to check Windows-only behaviour (tray, startup, notifications, the widget) on a real machine.

The installer isn't code-signed, so Windows SmartScreen warns on first run until it is. Signing needs a certificate: see electron-builder's `win.signtoolOptions` or Azure Trusted Signing.

## How it's built

Electron 45, React 19, TypeScript, Tailwind 4, shadcn/ui, Zustand, SQLite via better-sqlite3, chrono-node, Recharts and electron-builder. Pages run sandboxed with context isolation and talk to the main process only through a typed, validated bridge.

`docs/ARCHITECTURE.md` (and its PDF) covers the folder structure, database schema, IPC contract, behaviour rules and security model.
