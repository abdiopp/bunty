import { writeFile } from 'fs/promises'
import { join } from 'path'
import { app, BrowserWindow, dialog } from 'electron'
import { fromLocalDate } from '@shared/dates'
import { normalizeLocale } from '@shared/quick-add'
import type { ReportQuery } from '@shared/schemas'
import type { ReportService } from '../services/report-service'
import { periodRange } from '../services/report-service'
import { rememberExport, revealExport } from '../exported-files'
import { toCsv, toReportHtml } from './export'

function format(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(normalizeLocale(app.getSystemLocale()), options)
}

/** "November 2026", "2–8 Nov 2026" or "Monday, 2 November 2026". */
function periodName(query: ReportQuery, from: string, to: string): string {
  if (query.period === 'month') {
    return format({ month: 'long', year: 'numeric' }).format(fromLocalDate(from))
  }
  if (query.period === 'week') {
    return format({ day: 'numeric', month: 'short', year: 'numeric' }).formatRange(
      fromLocalDate(from),
      fromLocalDate(to)
    )
  }
  return format({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(
    fromLocalDate(from)
  )
}

async function askWhere(name: string, kind: string, extension: string): Promise<string | null> {
  const options: Electron.SaveDialogOptions = {
    title: `Export ${kind}`,
    defaultPath: join(app.getPath('documents'), name),
    filters: [{ name: kind, extensions: [extension] }]
  }
  const parent = BrowserWindow.getFocusedWindow()
  const result = parent
    ? await dialog.showSaveDialog(parent, options)
    : await dialog.showSaveDialog(options)
  return result.canceled || !result.filePath ? null : result.filePath
}

export function createReportExports(reports: ReportService, weekStart: () => 'monday' | 'sunday') {
  const fileName = (query: ReportQuery, extension: string): string => {
    const { from, to } = periodRange(query, weekStart())
    const span =
      query.period === 'month' ? from.slice(0, 7) : from === to ? from : `${from} to ${to}`
    return `Bunty report ${span}.${extension}`
  }

  return {
    async exportCsv(query: ReportQuery): Promise<string | null> {
      const path = await askWhere(fileName(query, 'csv'), 'CSV', 'csv')
      if (!path) return null
      await writeFile(path, toCsv(reports.tasks(query)), 'utf8')
      rememberExport(path)
      return path
    },

    /** Renders a script-free page in a hidden window and prints it, so it looks like the app. */
    async exportPdf(query: ReportQuery): Promise<string | null> {
      const path = await askWhere(fileName(query, 'pdf'), 'PDF', 'pdf')
      if (!path) return null
      const report = reports.summary(query)
      const weekday = format({ weekday: 'long' })
      const html = toReportHtml(report, query, {
        title: 'Bunty report',
        range: periodName(query, report.from, report.to),
        // 2026-11-01 is a Sunday, so weekday n is 1 November plus n days.
        weekdayLabel: (n) => weekday.format(new Date(2026, 10, 1 + n, 12))
      })
      const window = new BrowserWindow({
        show: false,
        webPreferences: { javascript: false, sandbox: true, contextIsolation: true }
      })
      try {
        await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
        const pdf = await window.webContents.printToPDF({ pageSize: 'A4', printBackground: true })
        await writeFile(path, pdf)
      } finally {
        window.destroy()
      }
      rememberExport(path)
      return path
    },

    reveal: revealExport
  }
}
