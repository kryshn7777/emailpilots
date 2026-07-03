import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// GUI2 contract: every static element that src/main.ts queries in index.html
// must also exist in gui2.html (exactly once). index.html is ground truth for
// which queried IDs are static DOM vs runtime-generated.

const root = resolve(__dirname, '..', '..');
const mainTs = readFileSync(resolve(root, 'src', 'main.ts'), 'utf8');
const gui1 = readFileSync(resolve(root, 'index.html'), 'utf8');

function extractQueriedIds(src: string): string[] {
  const ids = new Set<string>();
  for (const m of src.matchAll(/getElementById\(\s*['"`]([^'"`]+)['"`]\s*\)/g)) ids.add(m[1]);
  for (const m of src.matchAll(/querySelector(?:All)?\(\s*(['"`])(.*?)\1/g)) {
    for (const idm of m[2].matchAll(/#([A-Za-z0-9_-]+)/g)) ids.add(idm[1]);
  }
  return [...ids].sort();
}

function extractQueriedNames(src: string): string[] {
  const names = new Set<string>();
  for (const m of src.matchAll(/\[name="([^"]+)"\]/g)) names.add(m[1]);
  return [...names].sort();
}

const staticIds = extractQueriedIds(mainTs).filter((id) => gui1.includes(`id="${id}"`));
const staticNames = extractQueriedNames(mainTs).filter((n) => gui1.includes(`name="${n}"`));

describe('gui2.html parity with the main.ts DOM contract', () => {
  it('gui2.html exists', () => {
    expect(existsSync(resolve(root, 'gui2.html'))).toBe(true);
  });

  it('sanity: contract extraction found a realistic surface', () => {
    expect(staticIds.length).toBeGreaterThan(150);
    expect(staticNames).toContain('rec-days');
  });

  it('every static queried ID exists exactly once in gui2.html', () => {
    const gui2 = readFileSync(resolve(root, 'gui2.html'), 'utf8');
    const missing = staticIds.filter((id) => !gui2.includes(`id="${id}"`));
    expect(missing, `IDs missing from gui2.html: ${missing.join(', ')}`).toEqual([]);
    const dupes = staticIds.filter(
      (id) => (gui2.match(new RegExp(`id="${id}"`, 'g')) || []).length > 1
    );
    expect(dupes, `Duplicate IDs in gui2.html: ${dupes.join(', ')}`).toEqual([]);
  });

  it('every queried name-group exists in gui2.html', () => {
    const gui2 = readFileSync(resolve(root, 'gui2.html'), 'utf8');
    const missing = staticNames.filter((n) => !gui2.includes(`name="${n}"`));
    expect(missing, `name groups missing: ${missing.join(', ')}`).toEqual([]);
  });

  it('gui2.html is marked data-gui="2" and index.html is not', () => {
    const gui2 = readFileSync(resolve(root, 'gui2.html'), 'utf8');
    expect(gui2).toContain('data-gui="2"');
    expect(gui1).not.toContain('data-gui="2"');
  });
});
