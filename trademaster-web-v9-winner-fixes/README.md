# TradeMaster Pro Web

TradeMaster is a compact three-tab workspace for planning a position, recording execution fills, and reviewing chart-backed winner examples.

## Product surface

- **Calculator** — capital, risk %, entry, and stop-loss price are the primary inputs. Solver overrides, target simulation, trailing-stop math, and estimated charges remain available below the primary flow.
- **Journal** — multi-leg fills, pyramiding, partial exits, FIFO or weighted-average P&L, search/filter/sort, CSV import, and CSV/JSON export. The overview row contains closed net P&L, closed trades, win rate as numerator/denominator, and open positions. The two performance charts use the same filters and closed-trade accounting rules.
- **Winner Database** — responsive screenshot-first cards, full-size preview, setup/search/screenshot/sort controls, optional pattern detail, and source links to profitable closed journal trades.

The account menu contains P&L/currency settings and advanced backup/restore tools. The calculator is usable while signed out; journal and Winner Database data are private in cloud mode. A calculator handoff is an unsaved journal draft and must be reviewed before saving.

Legacy fields such as `mbiScore`/`SuperMBI` remain in normalized records and CSV exports for compatibility, but they are not rendered, filtered, or used as current product logic. Editing a record preserves unknown historical fields.

Calculator target charges retain the existing estimate model: flat brokerage of ₹40, STT at 0.025% of sell value, plus exchange, SEBI, stamp-duty, and GST estimates. These labels are deliberately estimates and do not alter recorded fill-level P&L.

## Quick start

```bash
cd trademaster-web-v9-winner-fixes
python3 -m http.server 4173
```

Open `http://localhost:4173`. With placeholder values in `js/config.js`, the app uses browser-local demo storage. Do not open the page with `file://` when testing Firebase features.

Run the automated domain tests with:

```bash
npm test
```

## Firebase mode

Enable Google and Phone providers, Firestore, Storage, and Hosting in the Firebase project. Copy the web configuration into `js/config.js`; use the exact Storage bucket value shown by Firebase Console. The optional X/Twitter button is shown only when `twitterEnabled: true` is explicitly set in the config.

Phone sign-in requires reCAPTCHA and an authorized hosted domain. Use fictional Firebase test numbers for rehearsals. The UI does not silently merge separate provider UIDs; account linking remains a deliberate provider action.

The rules are owner-scoped under `users/{uid}`. Storage winner images are stored under `users/{uid}/winner-images/{winnerId}/...`, are resized in the browser before upload, and are cleaned up after a confirmed record delete or replacement. A failed or uncertain save preserves the typed form and prepared image for reconciliation.

## Showcase fixtures

The synthetic showcase lives under [`fixtures/`](./fixtures/), with calculated expectations for both weighted-average and FIFO accounting in [`showcase-manifest.json`](./fixtures/showcase-manifest.json) and local SVG chart assets in [`fixtures/assets/`](./fixtures/assets/). It is clearly synthetic and is not a trading result or recommendation.

For the five-minute walkthrough and the isolated, idempotent local seed procedure, see [`docs/SHOWCASE-DEMO.md`](../docs/SHOWCASE-DEMO.md). Verification evidence and live-check boundaries are recorded in [`docs/SHOWCASE-VERIFICATION.md`](../docs/SHOWCASE-VERIFICATION.md).

## Import/export and backup

Journal supports broker tradebook CSV import with flat-to-flat grouping, pyramiding, staggered exits, and unmatched-close reporting. CSV export keeps the legacy `SuperMBI` column for compatibility. JSON export includes settings, trades, winners, source snapshots, and image references; raw image files are not embedded.

Google Drive backup/restore uses the authenticated account's hidden `appDataFolder`. Restore is intentionally an advanced, confirmed replace operation and is not part of showcase seeding.

## Deployment boundary

This implementation does not deploy or modify the live Firebase Hosting site. Review the rules and run the local/browser verification first, then deploy only as an explicit release action:

```bash
firebase deploy --only hosting,firestore,storage
```

Live Google, X/Twitter, SMS, Firestore, Storage, and App Check checks require provider credentials, a hosted authorized domain, or an emulator/console setup. See the verification document for exactly what was and was not exercised in this implementation pass.

## Key files

- `index.html` / `styles.css` — three-tab shell, dialogs, responsive card layout, accessibility states
- `js/app.js` — UI state, auth/session isolation, calculator handoff, journal/winner flows
- `js/trade-engine.js` — fill matching, P&L, filters, journal summaries, chart series, compatibility export
- `js/winner-db.js` — normalization, pattern detail, deterministic linked-winner IDs, source snapshots
- `js/storage.js` / `js/firebase-service.js` — demo/cloud persistence, auth, transaction-safe winner creation, image lifecycle
- `fixtures/showcase-fixtures.mjs` — synthetic trades, winners, and calculated manifest
- `fixtures/seed-showcase-local.mjs` — isolated localStorage merge seed; refuses unrelated data and never calls `replaceAllData`
- `tests/showcase.test.mjs` — calculator, journal, compatibility, winner-linking, and fixture tests
