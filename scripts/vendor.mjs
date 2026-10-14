// Copies pdf.js (pinned at 3.11.174 in package.json) into app/vendor/pdfjs so the app never loads it from the internet.
// Run with: npm run vendor
import { copyFileSync, mkdirSync } from 'node:fs';

const from = new URL('../node_modules/pdfjs-dist/', import.meta.url), to = new URL('../app/vendor/pdfjs/', import.meta.url);
mkdirSync(to, { recursive: true });
for (const f of ['build/pdf.min.js', 'build/pdf.worker.min.js', 'LICENSE']) copyFileSync(new URL(f, from), new URL(f.split('/').pop(), to));
console.log('Copied pdf.js into app/vendor/pdfjs');
