import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'node:module';
import { pdfTextLines, readPdfStatement } from '../app/src/core/pdf.js';
import { statementPdf } from './helpers/statement-pdf.js';
import { loadPrototype } from './helpers/prototype.js';

const pdfjs = createRequire(import.meta.url)('pdfjs-dist/legacy/build/pdf.js');
let lines;
beforeAll(async () => { lines = await pdfTextLines(pdfjs, await statementPdf()); });
const copy = v => JSON.parse(JSON.stringify(v));

describe('PDF statements', () => {
  it('reads every transaction with the right date, sign and amount', () => {
    expect(readPdfStatement(copy(lines))).toEqual([
      { date: '2026-09-02', amount: 2150, desc: 'Salary ACME DIESEL PTY LTD' },
      { date: '2026-09-03', amount: -64.2, desc: 'EFTPOS WOOLWORTHS 1234 BRISBANE QLD AUS' },
      { date: '2026-09-05', amount: -300, desc: 'Transfer to Savings xx9910' },
      { date: '2026-09-10', amount: 50, desc: 'Transfer from Savings xx9910' },
      { date: '2026-09-15', amount: -1234.56, desc: 'Card purchase BUNNINGS 6789' },
      { date: '2026-09-20', amount: -2000, desc: 'Rent J LANDLORD' },
    ]);
  });
  it('gives the same answer as the prototype', () => {
    const P = loadPrototype();
    expect(readPdfStatement(copy(lines))).toEqual(P.run(`readPdfStatement(${JSON.stringify(lines)})`));
    P.close();
  });
  it('always opens PDFs with eval switched off (the pdf.js 3.x security fix)', async () => {
    let opts;
    const fake = { getDocument: o => { opts = o; return { promise: Promise.resolve({ numPages: 0 }) }; } };
    await pdfTextLines(fake, new Uint8Array(1));
    expect(opts.isEvalSupported).toBe(false);
  });
});
