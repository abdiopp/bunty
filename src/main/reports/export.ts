import type { Report } from '@shared/ipc'
import type { ReportQuery } from '@shared/schemas'
import type { ReportTask } from '../services/report-service'

/** Excel runs cells starting like formulas; a leading quote keeps them as text (CSV injection). */
function cell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function toCsv(tasks: ReportTask[]): string {
  const header = [
    'Title',
    'Date',
    'Time',
    'Status',
    'Priority',
    'Category',
    'Completed at',
    'Originally due',
    'Times rescheduled',
    'Notes'
  ]
  const rows = tasks.map((task) => [
    task.title,
    task.date,
    task.time,
    task.status,
    task.priority,
    task.category,
    task.completed_at,
    task.original_date,
    task.reschedule_count,
    task.notes
  ])
  // A byte-order mark so Excel reads non-English titles correctly.
  return '﻿' + [header, ...rows].map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n'
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`)
}

interface PdfLabels {
  title: string
  range: string
  weekdayLabel: (weekday: number) => string
}

/** A self-contained, script-free page for printToPDF: bars are plain SVG, text is escaped. */
export function toReportHtml(report: Report, query: ReportQuery, labels: PdfLabels): string {
  const { totals } = report
  const rate = totals.rate === null ? '–' : `${Math.round(totals.rate * 100)}%`

  const maxDay = Math.max(1, ...report.days.map((day) => day.done + day.missed))
  const barWidth = Math.max(6, Math.floor(640 / report.days.length) - 4)
  const dayBars = report.days
    .map((day, i) => {
      const x = i * (barWidth + 4)
      const doneHeight = (day.done / maxDay) * 120
      const missedHeight = (day.missed / maxDay) * 120
      return `
        <rect x="${x}" y="${130 - doneHeight}" width="${barWidth}" height="${doneHeight}" rx="2" fill="#4061db"/>
        <rect x="${x}" y="${130 - doneHeight - missedHeight}" width="${barWidth}" height="${missedHeight}" rx="2" fill="#d73337"/>`
    })
    .join('')

  const maxWeekday = Math.max(1, ...report.byWeekday.map((day) => day.completed))
  const weekdayRows = report.byWeekday
    .map(
      (day) => `<tr><td>${escapeHtml(labels.weekdayLabel(day.weekday))}</td>
      <td class="bar"><span style="width:${(day.completed / maxWeekday) * 100}%"></span></td>
      <td class="num">${day.completed}</td></tr>`
    )
    .join('')

  const categoryRows = report.categories
    .map(
      (
        category
      ) => `<tr><td><i style="background:${category.color ?? '#a1a1aa'}"></i>${escapeHtml(category.name)}</td>
      <td class="num">${category.done} / ${category.due}</td></tr>`
    )
    .join('')

  const rescheduledRows = report.mostRescheduled
    .map((task) => `<tr><td>${escapeHtml(task.title)}</td><td class="num">${task.moves}×</td></tr>`)
    .join('')

  const stat = (label: string, value: string): string =>
    `<div class="stat"><div class="label">${label}</div><div class="value">${value}</div></div>`

  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(labels.title)}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  body { font: 10.5pt/1.5 -apple-system, "Segoe UI", Inter, Arial, sans-serif; color: #1c1c1f; }
  h1 { font-size: 22pt; margin: 0 0 2pt; letter-spacing: -0.02em; }
  .range { color: #6e6e76; margin-bottom: 16pt; }
  h2 { font-size: 11.5pt; margin: 18pt 0 6pt; }
  .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8pt; }
  .stat { border: 1px solid #e4e4e7; border-radius: 8pt; padding: 8pt 10pt; }
  .label { color: #6e6e76; font-size: 8.5pt; }
  .value { font-size: 18pt; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 3pt 0; border-bottom: 1px solid #f0f0f2; }
  td.num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; width: 70pt; }
  td.bar { width: 60%; }
  td.bar span { display: block; height: 8pt; border-radius: 4pt; background: #5b6cf0; }
  i { display: inline-block; width: 7pt; height: 7pt; border-radius: 50%; margin-right: 6pt; }
  .legend { color: #6e6e76; font-size: 8.5pt; }
  .legend b { display: inline-block; width: 8pt; height: 8pt; border-radius: 2pt; margin: 0 4pt 0 10pt; vertical-align: -1pt; }
  .empty { color: #6e6e76; }
</style></head><body>
  <h1>${escapeHtml(labels.title)}</h1>
  <div class="range">${escapeHtml(labels.range)}</div>
  <div class="stats">
    ${stat('Completion rate', rate)}
    ${stat('Completed', String(totals.done))}
    ${stat('Missed', String(totals.missed))}
    ${stat('Rescheduled', String(totals.rescheduled))}
  </div>
  ${
    query.period === 'day'
      ? ''
      : `<h2>Completed and missed by day</h2>
  <div class="legend"><b style="background:#4061db"></b>Completed<b style="background:#d73337"></b>Missed</div>
  <svg width="100%" viewBox="0 0 ${report.days.length * (barWidth + 4)} 132" preserveAspectRatio="none" style="height:120pt">${dayBars}</svg>`
  }
  <h2>Completions by day of the week</h2>
  <table>${weekdayRows}</table>
  <h2>By category</h2>
  ${categoryRows ? `<table>${categoryRows}</table>` : '<p class="empty">Nothing was due.</p>'}
  <h2>Most rescheduled</h2>
  ${rescheduledRows ? `<table>${rescheduledRows}</table>` : '<p class="empty">Nothing was moved.</p>'}
</body></html>`
}
