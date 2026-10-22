# Stack

Stack every pay. Each pay, your bills and repayments come out first, then your plan splits the rest into spending, Savings, extra debt, your Buffer and investing, and you get a to-do list. Your rank is your net worth: every dollar you save, invest or pay off raises it, and it settles each pay day.

It runs as an app on your iPhone (a "web app" you add to the Home Screen). It works offline, and **your money data never leaves your phone**. There are no accounts, no servers and no bank logins.

**Live app:** https://notmuchaye999.github.io/stack/

---

## Put it on your iPhone

1. On the iPhone, open **Safari** and go to https://notmuchaye999.github.io/stack/
2. Tap **Share** (the square with the arrow), scroll down and tap **Add to Home Screen**. If you see an **Open as Web App** switch, leave it on. Then tap **Add**.
3. From now on, open Stack **from its Home Screen icon**, not from Safari. The Home Screen app keeps its own storage, separate from Safari, so data you enter in a Safari tab won't show up in the app.
4. Set it up: the first time you open it, **Build your stack** walks you through how often you're paid, your bills, debts and credit (your everyday card, Afterpay…), purchases you're saving for, what you have now, and your first pay.
5. To test offline: turn on Airplane Mode and open Stack. It should open and work normally.

**Updates:** when a new version is published, Stack shows **Update ready · Tap to reload** the next time you open it. Tap it and you're on the new version. Your data is untouched. Data from the earlier version (with the 5 stages and statement import) is brought across by itself the first time the new version opens.

**Backups:** Plan → ⚙ (Settings) → **Back up** saves a file with all your data through the phone's share sheet (Save to Files, Notes…). **Restore from backup** takes the file, or the text pasted. If you delete the Home Screen icon, iOS deletes the app's data with it, so back up first.

**Coming from the claude.ai version:** the Stack artifact can also keep a copy in your Claude account. This app can't (it never sends data anywhere), so move it across once with a backup: in the artifact, Plan → ⚙ → **Back up**; then in this app, Plan → ⚙ → **Restore from backup**. Backups work both ways.

**Test mode** (in Settings) lets you try things, or the sample data, without saving anything until you end it.

---

## How the code is organised

```
app/                 everything that gets published (the website itself)
  index.html         the page
  styles.css         the look: colours, fonts, light and dark mode
  sw.js              the service worker: saves the app on the phone so it works offline
  manifest.webmanifest, icons/   what the Home Screen icon and name look like
  fonts/ img/        fonts, and the Hubble deep-field background (one per theme), stored with the app
  src/core/          ALL the money logic. No page code in here, so the future native app can reuse it as-is
  src/ui/            the screens: one file per tab, plus the sheets, the pay screen and the quick start
  src/storage.js     saving to the phone (IndexedDB)
tests/               the automatic checks (run with npm test)
prototype/stack.html the claude.ai prototype: the spec this is built from
docs/PHASE-2.md      the plan for a native iPhone app (not started)
```

The rules live in `app/src/core`:

| File | What it does |
| --- | --- |
| `stacks.js` | Stacking a pay: bills → repayments → your plan's split, in $5 steps. Plan vs what you did, Mark all done, your spending habit |
| `plans.js` | The plans: FI, Debt-free (Balanced once there's nothing to put extra on), Tight and Custom, and the plans for a pay you're about to stack |
| `paynow.js` | This pay as it stands: what's free in Pay, what's still due, what your plan suggests for the free money, what's done |
| `projection.js` | The countdown: pay cycles, month-by-month projection, where each month's money goes (`allocate`) |
| `impact.js` | How each entry moves the debt-free date (while you owe money) or the FI date, and saying "how long" and "when" |
| `due.js` | Due dates, overdue bills, bill ticks and direct debits, Pay in 4 |
| `balances.js` | Every account and debt right now, the everyday card, credit limits, debt priorities (Urgent, Focus, Fixed, Steady), net worth |
| `accounts.js` | Account names, transfers between your accounts (Moved), purchases as unlocks |
| `rank.js`, `goals.js` | Rank tiers, pay day (medals, settling), what moved your net worth; goals and their pace |
| `state.js`, `migrate.js` | What's saved, backups, and bringing older saved data up to date |
| `sample.js` | The sample data |

Stack never says what to invest in, only how much.

## Working on it

You need Node.js (any recent version).

```bash
npm install        # once, to get the test tools
npm test           # runs every check (about 140 of them). They should all pass
npm run typecheck  # checks src/core against its JSDoc types
npm start          # runs the app at http://localhost:8080
```

The service worker is switched off on `localhost`, so your edits show straight away. To test offline mode locally, open `http://localhost:8080/?sw`.

**To release a change:** commit and push to `main`. GitHub runs all the tests and, only if they pass, publishes the app (see the **Actions** tab on GitHub). Phones get the **Update ready** button the next time they open Stack.

### What the tests check

- **Parity with the prototype:** the same functions run inside `prototype/stack.html` and in `src/core`, on 35 money situations built with the prototype's own functions (the sample, an everyday card, Afterpay with pay-in-4, an urgent fine, overdue and ticked bills, money parked in the Buffer, each plan, a pay that ran out…), and must give identical answers. That covers balances, due dates, the countdown, every plan, stacking a pay, this pay, transfers, rank, pay day, goals, the sample data and bringing old data up to date.
- **The rules, in plain words:**
  - a pay goes bills → repayments → your split, in $5 steps, with spending taking the loose change so the parts add up to the pay
  - short when a pay doesn't cover bills and repayments; urgent debts take the split (except spending) until paid
  - money moved past the plan comes off spending; purchases from Savings don't touch the card budget
  - the plans: FI spends nothing, Debt-free puts everything past spending on debt then turns Balanced, Tight waits for a tracked pay, Custom starts from a sensible split
  - what's free this pay, what's still due, and parked money covering it before Pay has to
  - overdue bills come out of the next pay; ticking a bill records the payment; direct debits tick themselves; Pay in 4
  - the countdown only from pays you've entered (the last 26), a forgotten pay counts as its full budget, Never when more goes out than comes in, interest-free periods, extra-debt order
  - rank tiers, rank locked until pay day, the pay day tally, debt cleared / debt-free / goal reached
- **The whole app:** it opens data saved by the earlier version, runs the sample in Test mode through every tab and the main sheets, records a spend, ticks things off and stacks a pay, without a single error.
- **Safety:**
  - `src/core` never touches the page
  - the service worker saves every file
  - backups read back as the same data

### Updating from the prototype

The prototype lives as a claude.ai artifact and may keep changing. To bring changes across:

1. Save the new version over `prototype/stack.html` and commit it on its own, so the diff shows what changed.
2. Run `npm test`. The parity tests fail wherever the logic changed, which points at what to port into `src/core`.
3. Port the screen changes into `src/ui`. The screens follow the prototype's code closely (same function names, same markup), so the prototype's diff maps onto them.

The prototype's Claude-account sync (`window.claude`) isn't ported: the app keeps everything on the phone.

## Notes

- Background image: NASA, ESA, Hubble. Fonts: Archivo and IBM Plex (SIL Open Font License).
- General information, not financial advice.
