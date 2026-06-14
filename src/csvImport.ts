import fs from 'fs';
import { parse } from 'csv-parse/sync';

export interface CsvData {
  /** Column names in original CSV order (keys of the first data row). */
  headers: string[];
  /** One object per data row, keyed by header. */
  rows: Record<string, string>[];
}

/**
 * Read a CSV file into header + row objects. Node-only (uses fs + csv-parse),
 * so this runs in the Electron main process — the renderer never imports it.
 *
 * relax_column_count tolerates ragged rows rather than throwing on the whole
 * file; missing/extra cells just yield undefined/extra keys.
 */
export function readCsvFile(filePath: string): CsvData {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const rows = parse(raw, {
    columns: true,
    bom: true,
    trim: true,
    skip_empty_lines: true,
    relax_column_count: true,
  }) as Record<string, string>[];

  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  return { headers, rows };
}
