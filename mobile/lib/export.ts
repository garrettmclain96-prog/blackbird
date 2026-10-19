import type { SearchRun } from "./types";
export function csvCell(value: unknown): string {
  let text = String(value ?? "");
  if (/^[\s]*[=+\-@]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export function buildCsv(run: SearchRun): string {
  const rows: unknown[][] = [["Query", "Mode", "Platform", "Category", "Status", "Profile URL", "HTTP status", "Checked at", "Evidence"]];
  for (const r of run.results) rows.push([run.query, run.mode, r.name, r.category, r.status, r.url, r.httpStatus, r.checkedAt, r.detail]);
  return "\uFEFF" + rows.map(row => row.map(csvCell).join(",")).join("\r\n");
}
