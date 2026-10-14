# Stack

Stack every pay. Your bills, debts, savings and investing get a job each payday, and a countdown shows when you'll be financially independent.

It runs as an app on your iPhone (a "web app" you add to the Home Screen). It works offline, and **your money data never leaves your phone**. There are no accounts, no servers and no bank logins.

**Live app:** https://notmuchaye999.github.io/stack/

---

## Put it on your iPhone

1. On the iPhone, open **Safari** and go to https://notmuchaye999.github.io/stack/
2. Tap **Share** (the square with the arrow), scroll down and tap **Add to Home Screen**. If you see an **Open as Web App** switch, leave it on. Then tap **Add**.
3. From now on, open Stack **from its Home Screen icon**, not from Safari. The Home Screen app keeps its own storage, separate from Safari, so data you enter in a Safari tab won't show up in the app.
4. Set it up: add your bills, your debts (an overdrawn account, Afterpay, credit card…) and your savings/investment balances, then **Stack** your latest pay.
5. To test offline: turn on Airplane Mode and open Stack. It should open and work normally.

**Updates:** when a new version is published, Stack shows **Update ready · Tap to reload** the next time you open it. Tap it and you're on the new version. Your data is untouched.

**Backups:** Plan → Data → **Export my data** copies everything as one block of text. Paste it into a note now and then. **Import data** puts it back. If you delete the Home Screen icon, iOS deletes the app's data with it, so export first.

---

## How the code is organised

```
app/                 everything that gets published (the website itself)
  index.html         the page
  styles.css         the look: colours, fonts, light and dark mode
  sw.js              the service worker: saves the app on the phone so it works offline
  manifest.webmanifest, icons/   what the Home Screen icon and name look like
  fonts/ img/        fonts and the Hubble deep-field background, stored with the app
  vendor/pdfjs/      pdf.js 3.11.174, used to read PDF statements on the phone
  src/core/          ALL the money logic. No page code in here, so the future native app can reuse it as-is
  src/ui/            the screens: one file per tab, plus forms, sheets and the importer
  src/storage.js     saving to the phone (IndexedDB)
tests/               the automatic checks (run with npm test)
prototype/stack.html the original one-file prototype: the spec this was rebuilt from
docs/PHASE-2.md      the plan for a native iPhone app (not started)
```

The rules you chose live in `app/src/core`:

| File | What it does |
| --- | --- |
| `projection.js` | The countdown. Pay cycles, month-by-month projection, rollover (`allocate`), how much each entry moved your FI date |
| `stacks.js` | Stacking a pay: bills → repayments → planned buys → your split. Also plan vs what you did |
| `due.js` | Due dates: what falls due before the next pay; quarterly/yearly bills get saved up |
| `stages.js` | The 5 stages and the suggested split |
| `balances.js` | Savings, investments, debts right now; the order extra debt payments go in |
| `csv.js`, `pdf.js`, `categorize.js` | Reading statements, labelling lines, dedupe, remembered labels |
| `investing.js` | The **only** place that says anything about what to invest in. If Stack is ever shared, review this file: specific picks could count as financial advice in Australia |

## Working on it

You need Node.js (any recent version).

```bash
npm install        # once, to get the test tools
npm test           # runs every check (~100 of them). They should all pass
npm start          # runs the app at http://localhost:8080
```

The service worker is switched off on `localhost`, so your edits show straight away. To test offline mode locally, open `http://localhost:8080/?sw`.

**To release a change:** commit and push to `main`. GitHub runs all the tests and, only if they pass, publishes the app (see the **Actions** tab on GitHub). Phones get the **Update ready** button the next time they open Stack.

### What the tests check

- **Your rules:**
  - no countdown before the first pay
  - the average of 1, 2 or 3 pays (last 26)
  - Never, plus how much you're short each pay
  - rollover order
  - extra-debt order
  - interest-free debts
  - stages
  - the suggested split (same answer twice, investing beats savings, across all 204,020 combinations)
  - due dates
- **Statements:**
  - CSVs laid out like CommBank, Westpac, NAB and ING exports
  - a generated PDF statement with Debit/Credit/Balance columns
  - dedupe, withdrawals from savings, remembered labels
- **Parity with the prototype:** the same functions run inside `prototype/stack.html` and in the new code, on the same data, and must give identical numbers.
- **Safety:**
  - `src/core` never touches the page
  - the service worker saves every file
  - PDFs are always opened with eval off

### Updating from the prototype

The prototype lives as a claude.ai artifact and may keep changing. To bring changes across:

1. Save the new version over `prototype/stack.html` and commit it on its own, so the diff shows what changed.
2. Run `npm test`. The parity tests fail wherever the logic changed, which points at what to port into `src/core`.
3. Port the screen changes into `src/ui`.

## Notes

- **pdf.js 3.11.174** is pinned on purpose. `npm audit` flags it (CVE-2024-4367: a malicious PDF could run code). The fix for this version is opening PDFs with `isEvalSupported: false`, which Stack always does, and a test makes sure that stays.
- Background image: NASA, ESA, Hubble. Fonts: Archivo and IBM Plex (SIL Open Font License).
- General information, not financial advice.
