# TradeMaster showcase demo

This is a five-minute product walkthrough for the synthetic dataset in `trademaster-web-v9-winner-fixes/fixtures/`. The records and SVG charts are intentionally illustrative; they are not live market data, performance evidence, or investment advice.

## Isolated setup

Run the app from the implementation directory:

```bash
cd /Users/naman/Documents/Coding/MyTrading/trademaster-web-v9-winner-fixes
python3 -m http.server 4173
```

Open [http://localhost:4173/?mode=demo](http://localhost:4173/?mode=demo) in a fresh browser profile or a private local-storage context. `mode=demo` is an explicit local override, so the existing Firebase configuration file is not changed and no cloud write is possible from this walkthrough.

Open the browser developer console and run:

```js
const { seedShowcaseLocal } = await import('/fixtures/seed-showcase-local.mjs');
seedShowcaseLocal();
location.reload();
```

The seed merges only records marked `trademaster-showcase-synthetic-v1`. It is idempotent, never calls the app's `replaceAllData` restore path, and refuses to run if unrelated local records are present. Use a new profile if it refuses. It does not change account settings.

Expected fixture headline: 12 trades, 10 closed, 6 wins, 3 losses, 1 breakeven, 2 open positions; 4 winner examples, 2 linked to source trades; 60% win rate. The exact calculated totals are in [`showcase-manifest.json`](../trademaster-web-v9-winner-fixes/fixtures/showcase-manifest.json).

## Five-minute script

0:00 — Calculator

- Leave the primary inputs visible: Capital, Risk %, Entry price, and Stop-loss price.
- Enter `2500` for Entry price and `2440` for Stop-loss price. Choose `3` for Target R in the expandable simulator.
- Point out quantity, calculated risk, position value, target P&L, and the explicit “estimated” charges label.

1:00 — Calculator handoff

- Select **Use in journal**. The app opens an unsaved trade draft; nothing has been persisted yet.
- Show the actual fill editor, add a sell leg if desired, and close the dialog. The discard prompt is the intended review boundary.

2:00 — Journal overview

- Open Journal and clear filters if needed. The single headline row should show closed net P&L, `10` closed trades, `6 of 10` win rate, and `2` open positions.
- Expand Performance. The cumulative and monthly charts use the same current filters and final exit dates.
- Edit or inspect TRENT to show the partial exit and remaining open quantity; it is visible on the card but excluded from closed aggregates.

3:15 — Filter behavior

- Set Status to Closed and Result to Winners. The cards and both charts update together.
- Set Result back to All and show that the breakeven ASIANPAINT record remains in the denominator even though it is neither a win nor a loss.

4:00 — Winner Database

- Open Winner Database. The default controls are Search, Setup, Screenshot, and Sort; detailed pattern filters are collapsed.
- Open the RELIANCE or TCS card's screenshot. The preview is uncropped and closes with Escape.
- Use **View original trade** on a linked example. If the source is unavailable, the saved source snapshot remains readable and the card reports that state.

4:40 — Account boundary

- Open Account & settings to show P&L method and currency in one place.
- In cloud mode, journal and Winner Database require authentication. Google and Phone are the baseline providers; X appears only when explicitly enabled in Firebase config.

## Optional failure-path rehearsal

- Open a winner form, choose a screenshot, then close it. The discard prompt protects the prepared image draft.
- In cloud mode, disable network or use a rules-denied account during a save. The form reports whether the result is failed or uncertain and retains typed data/prepared image when retry/reconciliation is safe.
- The browser does not delete obsolete referenced screenshots. After deployment, the Firestore Functions triggers clean the old object when a Winner is deleted or its `imageStoragePath` changes. The browser still rolls back a newly uploaded object when a definitive Firestore write failure leaves it unreferenced.

## Live Firebase rehearsal boundary

The five-minute script is local and synthetic. It does not sign in, send an SMS, upload Storage bytes, create Firestore records, invoke Drive backup, exercise App Check, or invoke deployed screenshot-cleanup Functions. The Functions are deployed in Firebase project `trading-d5a0e`, but trigger delivery and live Storage deletion still require an authorized test account or Firebase emulator. Hosting deployment and the remaining live checks are separate release actions.
