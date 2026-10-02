// AUDIT FIX-GUARD — K3 for recipients.json (incomplete-work sweep, 2026-10-02).
//
// A corrupt recipients.json stopped every send path — batch, scheduler, drip — with
// only a console line each, and a packaged build has no console: the app looked
// healthy while nothing went out. K3's toast/tray/banner covered only suppression
// and replies. These pin that an unreadable recipient list raises the same signal
// once, and that repairing the file clears it.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { MailProcessor } from '../../mailProcessor';
import { SequenceRunner } from '../../sequenceRunner';
import { Scheduler } from '../../scheduler';
import { onStateFileError, onStateFileRecovered, type StateFileError } from '../../jsonState';
import { makeStressConfig, scriptedService, acceptAll, stressDir, setDataDir, rmDir, silenceConsole, seedRecipients } from '../stress/helpers';

let dir: string;
let restoreEnv: () => void;
let unquiet: () => void;
const errors: StateFileError[] = [];
const recovered: string[] = [];
let offs: Array<() => void> = [];

beforeEach(() => {
  dir = stressDir('k3rec');
  restoreEnv = setDataDir(dir);
  unquiet = silenceConsole();
  errors.length = 0; recovered.length = 0;
  offs = [onStateFileError(e => errors.push(e)), onStateFileRecovered(p => recovered.push(p))];
});
afterEach(async () => {
  offs.forEach(off => off());
  // Leave no active report behind for the next spec: a clean read clears it.
  seedRecipients(dir, 1);
  await new MailProcessor(makeStressConfig(dir), scriptedService(acceptAll).service).processEmails();
  unquiet(); restoreEnv(); rmDir(dir);
});

describe('K3 — an unreadable recipients.json reaches the user', () => {
  it('raises the signal once across the batch, the scheduler and the drip tick', async () => {
    const cfg = makeStressConfig(dir, { sequences: [{ id: 's', name: 'S', steps: [{ id: 'a', messageContent: 'A', delayDays: 0, stopOnReply: false }] }] });
    fs.writeFileSync(cfg.paths.recipientsJson, '[{"email": "broken@x.test",');
    const proc = new MailProcessor(cfg, scriptedService(acceptAll).service);

    const res = await proc.processEmails();
    new Scheduler(cfg, proc).start();
    await new SequenceRunner(cfg, proc).tick();

    expect(res.sent).toBe(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].kind).toBe('recipients');
    expect(errors[0].filePath).toBe(cfg.paths.recipientsJson);
  });

  it('clears the signal once the file reads cleanly again', async () => {
    const cfg = makeStressConfig(dir);
    fs.writeFileSync(cfg.paths.recipientsJson, '{ not json');
    const proc = new MailProcessor(cfg, scriptedService(acceptAll).service);
    await proc.processEmails();
    expect(errors).toHaveLength(1);

    seedRecipients(dir, 1);
    await proc.processEmails();
    expect(recovered).toEqual([cfg.paths.recipientsJson]);
  });
});
