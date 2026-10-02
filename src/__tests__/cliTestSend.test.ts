// `npm run test-send` (ts-node src/index.ts --test) emailed every active recipient
// for real unless TEST_MODE=true happened to be set, then stayed resident running a
// second cron scheduler on the shared data dir — eating the real daily cap with
// practice sends next to the desktop app. It must refuse without TEST_MODE and
// exit once the practice run is done. Runs the real CLI in a temp dir with one
// scheduled recipient; SMTP points at a closed local port, so nothing leaves.
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const root = path.resolve(__dirname, '../..');

function runCli(extraEnv: Record<string, string>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ept-cli-'));
  fs.writeFileSync(path.join(dir, 'recipients.json'), JSON.stringify([
    { email: 'someone@example.test', name: 'Someone', active: true, scheduledDays: ['Mon'], scheduledTimes: ['09:00'], messageContent: 'Hi' },
  ]));
  const { TEST_MODE: _ignored, ...inherited } = process.env;
  try {
    return spawnSync(
      process.execPath,
      [path.join(root, 'node_modules/ts-node/dist/bin.js'), '--transpile-only', '-P', path.join(root, 'tsconfig.json'),
        path.join(root, 'src/index.ts'), '--test'],
      {
        cwd: dir,
        env: {
          ...inherited, DOCKER: 'true', SMTP_HOST: '127.0.0.1', SMTP_PORT: '9',
          SMTP_USER: 'cli@example.test', SMTP_PASS: 'not-a-real-secret', ...extraEnv,
        },
        encoding: 'utf8',
        timeout: 60_000, // ts-node startup under full-suite load; a resident CLI still hits it
      },
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('CLI --test', () => {
  it('refuses to send without TEST_MODE, before touching any recipient', () => {
    const r = runCli({});
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/TEST_MODE=true/);
    expect(r.stdout).not.toMatch(/Running immediate test send/);
  }, 120_000);

  it('exits after the practice run instead of staying resident', () => {
    const r = runCli({ TEST_MODE: 'true' });
    expect(r.error).toBeUndefined(); // a spawnSync timeout lands here
    expect(r.stdout).toMatch(/Running immediate test send/);
    expect(r.stdout).not.toMatch(/Scheduler is running/);
  }, 120_000);
});
