// The service worker must save every file the app uses, or that file won't work offline.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = fileURLToPath(new URL('../app/', import.meta.url));
const walk = d => readdirSync(d).flatMap(f => statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [relative(appDir, join(d, f))]);
const sw = readFileSync(join(appDir, 'sw.js'), 'utf8');
const listed = [...sw.match(/const FILES = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map(m => m[1]);

describe('service worker', () => {
  it('saves every file in app/ for offline use (and nothing that is missing)', () => {
    const onDisk = walk(appDir).filter(f => f !== 'sw.js').sort();
    expect(listed.filter(f => f !== './').sort()).toEqual(onDisk);
    expect(listed).toContain('./');
  });
  it('has a version the deploy can stamp', () => {
    expect(sw).toContain("const VERSION = '__BUILD__';");
  });
});
