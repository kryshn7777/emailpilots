import fs from 'fs';

/**
 * Write a file via temp-file + rename so a crash or power loss mid-write can
 * never leave a truncated/corrupt target. rename() on the same volume is atomic
 * on Windows (MoveFileEx with REPLACE_EXISTING) and POSIX alike. Used for every
 * JSON state file (limits, stats, suppression, accounts, recipients).
 */
export function atomicWriteFileSync(filePath: string, data: string): void {
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, data, 'utf-8');
  try {
    fs.renameSync(tmp, filePath);
  } catch (e) {
    // Clean up the orphaned temp file before surfacing the failure.
    try { fs.unlinkSync(tmp); } catch {}
    throw e;
  }
}
