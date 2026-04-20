# TradeMaster Pro Web

A proper web-app version of your original TradeMaster Pro prototype, keeping the calculator / MBI / sell-check workflow from the single-file app while upgrading the journal into a real multi-leg trading workspace.

## What is included

- Position size calculator preserved and improved
- Detailed MBI V2 scorer ported from the original TradeMasterPro formula
- AI coach tab with strengths, leaks, and improvement plan
- MBI scorer and sell checklist
- Multi-leg journal with pyramiding and staggered exits
- FIFO or weighted-average P&L modes
- Dashboard with equity / monthly / strategy / weekday charts
- Coach charts for MBI bucket and hold-time bucket P&L
- Journal search, filters, sorting, grades, setup types, and tags
- Separate **Trades / Statistics / Calendar** journal views
- Process checklist tracking for rule-following analysis
- Emotion tags and mistake tags
- CSV + JSON export, plus direct broker tradebook CSV import
- Demo mode with localStorage
- Google sign-in + Firestore sync when Firebase config is added
- Optional Google Drive backup / restore using `appDataFolder`

## Folder structure

- `index.html` — app shell
- `styles.css` — styling
- `js/app.js` — main UI controller
- `js/calc.js` — calculator math
- `js/mbi.js` — MBI scoring and sell rules
- `js/trade-engine.js` — multi-fill trade engine and analytics
- `js/charts.js` — chart helpers
- `js/tradebook-importer.js` — broker tradebook CSV importer and flat-to-flat grouping
- `js/utils.js` — shared helpers
- `js/storage.js` — demo/cloud storage abstraction
- `js/firebase-service.js` — Firebase Auth / Firestore / Drive integration
- `js/config.js` — Firebase config placeholder
- `js/config.example.js` — copy/reference config template
- `firestore.rules` — Firestore rules
- `firebase.json` — Firebase Hosting config

## Journal model

Each trade can contain multiple fills, so buys and sells are tracked independently.

```json
{
  "symbol": "RELIANCE",
  "direction": "LONG",
  "strategy": "Swing",
  "plannedRisk": 11200,
  "fills": [
    { "side": "BUY", "qty": 100, "price": 2500, "fees": 20, "executedAt": "2026-04-10T09:20" },
    { "side": "BUY", "qty": 50, "price": 2510, "fees": 10, "executedAt": "2026-04-10T10:05" },
    { "side": "SELL", "qty": 80, "price": 2530, "fees": 12, "executedAt": "2026-04-10T11:15" },
    { "side": "SELL", "qty": 70, "price": 2545, "fees": 11, "executedAt": "2026-04-10T13:40" }
  ]
}
```

This supports:

- pyramiding
- scaling out in multiple sells
- partial exits
- open quantity tracking
- realized P&L calculation
- average entry / average exit
- R-multiple and process review

## Quick start

### Run immediately in demo mode

You can open the app directly, or use a simple local server:

```bash
cd trademaster-web
python3 -m http.server 4173
```

Then open `http://localhost:4173`.

If `js/config.js` still contains the `YOUR_...` placeholders, the app automatically stays in **demo mode** and stores data in localStorage.

### Connect Firebase

Create a Firebase project and enable:

- Authentication → Google provider
- Firestore Database
- Hosting

Then replace the placeholder values in `js/config.js` with your real Firebase web config:

```js
window.TRADEMASTER_CONFIG = {
  firebase: {
    apiKey: '...',
    authDomain: 'your-project.firebaseapp.com',
    projectId: 'your-project-id',
    storageBucket: 'your-project.appspot.com',
    messagingSenderId: '...',
    appId: '...'
  }
};
```

## Deploy for free on Firebase Hosting

```bash
npm install -g firebase-tools
firebase login
cd trademaster-web
firebase use --add
firebase deploy
```

## Firestore rules

Deploy the included rules:

```bash
firebase deploy --only firestore:rules
```

The rules are scoped so each signed-in user only reads/writes their own data under `users/{uid}`.

## Direct tradebook CSV import

Use **Journal → Import tradebook CSV** and choose your broker export.

The importer currently expects columns like:

```
symbol, isin, trade_date, exchange, segment, series, trade_type, quantity, price, trade_id, order_id, order_execution_time
```

What it does automatically:

- merges fragmented executions from the same order into one journal fill
- groups fills into a single trade until the position goes flat
- supports pyramiding and staggered exits
- skips unmatched closing-only rows when the CSV starts after an older holding was opened
- keeps your existing notes / tags if you re-import the same trade later

Imported trades are tagged as `imported` and `tradebook`.

## Optional Google Drive backup

To use the Drive backup buttons:

1. Enable the Google Drive API in the same Google Cloud project.
2. Configure the OAuth consent screen.
3. Sign in and use the Backup / Restore buttons from Settings.

Backups are written to the hidden `appDataFolder`, not the visible My Drive.

## Best new journal features in this build

- separate Trades / Statistics / Calendar views
- All / Open / Closed quick toggles
- strategy and setup breakdowns
- emotion and mistake tagging
- process checklist scoring
- rule-leak statistics
- day-level calendar review
- calculator → journal seeding
- MBI → journal seeding
- CSV import path for old records or broker exports

## Good next upgrades

- screenshot uploads to Firebase Storage
- broker-specific CSV import presets
- reusable checklist templates by setup type
- live quote integration for open positions
- screenshot gallery + before/after review
- strategy scorecards by MBI bucket and market regime
