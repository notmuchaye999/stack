// src/core must run anywhere: the browser, Node and React Native. So it may not touch the page or browser storage.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';

const dir = new URL('../app/src/core/', import.meta.url);
const BANNED = /\b(document|window|localStorage|sessionStorage|indexedDB|navigator|FileReader|fetch|XMLHttpRequest|requestAnimationFrame)\b/;

describe('src/core', () => {
  it('has no browser-only code in it', () => {
    for (const f of readdirSync(dir).filter(f => f.endsWith('.js'))) {
      const code = readFileSync(new URL(f, dir), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''); // ignore comments
      expect(code.match(BANNED)?.[0], f).toBeUndefined();
    }
  });
  it('loads from one entry point', async () => {
    const core = await import('../app/src/core/index.js');
    for (const name of ['project', 'allocate', 'cycles', 'costs', 'levels', 'stageInfo', 'suggest', 'makeStack', 'stackItems',
      'readStatement', 'readPdfStatement', 'pdfTextLines', 'categorize', 'prepImport', 'readImport', 'sampleState']) expect(typeof core[name], name).toBe('function');
  });
});
