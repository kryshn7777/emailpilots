// IPC bridge contract — every invoke method electron/preload.ts exposes must be
// called by the renderer. A bridge method nobody calls is a backend with no way in:
// that is how "Sign in with Google" shipped its handler and preload method but no
// button (plan task C5). Static read, like uiContract.test.ts — vitest runs in node.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '../..');

const INERT = new Set([
  'connectBrowserAccount', // browser-session transport: deliberately UI-less (CLAUDE.md)
]);

describe('IPC bridge contract', () => {
  it('calls every invoke method the preload exposes', () => {
    const preload = fs.readFileSync(path.join(root, 'electron/preload.ts'), 'utf8');
    const renderer = fs.readFileSync(path.join(root, 'src/main.ts'), 'utf8');
    const methods = [...preload.matchAll(/^\s*(\w+):\s*\([^)]*\)\s*=>\s*ipcRenderer\.invoke\(/gm)].map((m) => m[1]);
    expect(methods.length).toBeGreaterThan(40); // the parse really found the bridge
    const unused = methods.filter((m) => !INERT.has(m) && !new RegExp(`electronAPI\\.${m}\\(`).test(renderer));
    expect(unused).toEqual([]);
  });
});
