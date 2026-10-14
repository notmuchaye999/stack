// Builds a realistic bank statement PDF: a period line, a header with Debit / Credit / Balance columns,
// right-aligned money, an opening and closing balance, a description that wraps onto a second line,
// balances marked CR / DR, and a page footer.
import { PDFDocument, StandardFonts } from 'pdf-lib';

export async function statementPdf() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const text = (s, x, y, f = font, size = 9) => page.drawText(s, { x, y, size, font: f });
  const right = (s, r, y, f = font) => text(s, r - f.widthOfTextAtSize(s, 9), y, f);
  const COL = { date: 40, desc: 95, debit: 400, credit: 475, balance: 555 };

  text('Everyday Account Statement', 40, 800, bold, 14);
  text('Account name: J Citizen    BSB: 123-456    Account number: 1234 5678', 40, 780);
  text('Statement period 1 Sep 2026 to 30 Sep 2026', 40, 766);
  let y = 730;
  text('Date', COL.date, y, bold); text('Transaction details', COL.desc, y, bold);
  right('Debit', COL.debit, y, bold); right('Credit', COL.credit, y, bold); right('Balance', COL.balance, y, bold);

  const row = (date, desc, debit, credit, balance, more) => {
    y -= 18;
    text(date, COL.date, y); text(desc, COL.desc, y);
    if (debit) right(debit, COL.debit, y);
    if (credit) right(credit, COL.credit, y);
    if (balance) right(balance, COL.balance, y);
    if (more) { y -= 11; text(more, COL.desc, y); }
  };
  row('01 Sep', 'Opening balance', '', '', '1,000.00 CR');
  row('02 Sep', 'Salary ACME DIESEL PTY LTD', '', '2,150.00', '3,150.00 CR');
  row('03 Sep', 'EFTPOS WOOLWORTHS 1234', '64.20', '', '3,085.80 CR', 'BRISBANE QLD AUS');
  row('05 Sep', 'Transfer to Savings xx9910', '300.00', '', '2,785.80 CR');
  row('10 Sep', 'Transfer from Savings xx9910', '', '50.00', '2,835.80 CR');
  row('15 Sep', 'Card purchase BUNNINGS 6789', '1,234.56', '', '1,601.24 CR');
  row('20 Sep', 'Rent J LANDLORD', '2,000.00', '', '398.76 DR');
  row('30 Sep', 'Closing balance', '', '', '398.76 DR');
  text('Page 1 of 1', 270, 40);
  return doc.save();
}
