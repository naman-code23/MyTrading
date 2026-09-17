# TradeMaster Pro Web

TradeMaster is a compact three-tab workspace for planning a position, recording execution fills, and reviewing chart-backed winner examples.

## Product surface

- **Calculator** — capital, risk %, entry, and stop-loss price are the primary inputs. Solver overrides, target simulation, trailing-stop math, and estimated charges remain available below the primary flow.
- **Journal** — multi-leg fills, pyramiding, partial exits, fixed weighted-average P&L, search/filter/sort, broker CSV import, and CSV export. The overview row contains closed net P&L, closed trades, win rate as numerator/denominator, and open positions. The two performance charts use the same filters and closed-trade accounting rules.
- **Winner Database** — responsive screenshot-first cards, full-size preview, setup/search/screenshot/sort controls, optional pattern detail, and source links to profitable closed journal trades.

The account menu contains the calculator's user-specific trading capital, default risk percentage, and base-currency settings. The calculator is usable while signed out; journal and Winner Database data are private after Firebase sign-in. A calculator handoff is an unsaved journal draft and must be reviewed before saving.

Legacy fields such as `mbiScore`/`SuperMBI` remain in normalized records and CSV exports for compatibility, but they are not rendered, filtered, or used as current product logic. Editing a record preserves unknown historical fields.

Calculator target charges retain the existing estimate model: flat brokerage of ₹40, STT at 0.025% of sell value, plus exchange, SEBI, stamp-duty, and GST estimates. These labels are deliberately estimates and do not alter recorded fill-level P&L.

## Quick start

```bash
cd trademaster-web-v9-winner-fixes
python3 -m http.server 4173
```

Copy the real Firebase web configuration into `js/config.js`, then open `http://localhost:4173`. The app is cloud-only: it refuses to start when Firebase configuration is missing or when opened with `file://`; it never stores journal data in browser local storage.

Run the automated domain tests with:

```bash
npm test
```

## Firebase

Enable Google and Phone providers, Firestore, Storage, and Hosting in the Firebase project. Copy the web configuration into `js/config.js`; use the exact Storage bucket value shown by Firebase Console.

Phone sign-in requires reCAPTCHA and an authorized hosted domain. Use fictional Firebase test numbers for rehearsals. The UI does not silently merge separate provider UIDs; account linking remains a deliberate provider action.

The rules are owner-scoped under `users/{uid}`. Storage winner images are stored under `users/{uid}/winner-images/{winnerId}/...`; the browser uploads the original image unchanged and Firebase Storage rules enforce the 1 MiB limit. They are cleaned up by the deployed Firestore trigger after a confirmed record delete or reference replacement. The browser only rolls back a newly uploaded object when its Firestore write definitively fails, because no trigger can observe an object that was never referenced. A failed or uncertain save preserves the typed form and selected image for reconciliation.

## Showcase fixtures

The synthetic test fixtures live under [`fixtures/`](./fixtures/), with calculated expectations for the fixed weighted-average accounting method in [`showcase-manifest.json`](./fixtures/showcase-manifest.json) and SVG chart assets in [`fixtures/assets/`](./fixtures/assets/). They are test data only, are not loaded by the app, and are not a trading result or recommendation.

The service-by-service code map and configuration guide is [`docs/FIREBASE-SERVICE-GUIDE.md`](../docs/FIREBASE-SERVICE-GUIDE.md). Historical verification evidence and live-check boundaries are recorded in [`docs/SHOWCASE-VERIFICATION.md`](../docs/SHOWCASE-VERIFICATION.md).

## Journal import/export

Journal supports broker tradebook CSV import with flat-to-flat grouping, pyramiding, staggered exits, and unmatched-close reporting. CSV export keeps the legacy `SuperMBI` column for compatibility. Firestore remains the durable source of truth for settings, trades, winners, and screenshot references.

## Deployment boundary

This implementation does not deploy or modify the live Firebase Hosting site. The screenshot-cleanup Functions were deployed separately to Firebase project `trading-d5a0e`; Hosting, rules, and Storage changes remain explicit release actions. Review the rules and run the automated/browser verification first, then deploy the complete release only when authorized:

```bash
firebase deploy --only hosting,firestore,storage,functions
```

The Functions source is under `functions/` and is excluded from the Hosting artifact. GitHub source updates do not deploy Firebase services. The current Functions deployment uses Node.js 20, which Firebase reports will be decommissioned on 2026-10-30; upgrade the runtime before that boundary. Live Google, SMS, Firestore, Storage, Functions, and App Check checks require provider credentials, a hosted authorized domain, or an emulator/console setup. See the verification document for exactly what was and was not exercised in this implementation pass.

## Key files

- `index.html` / `styles.css` — three-tab shell, dialogs, responsive card layout, accessibility states
- `js/app.js` — UI state, auth/session isolation, calculator handoff, journal/winner flows
- `js/trade-engine.js` — fill matching, P&L, filters, journal summaries, chart series, compatibility export
- `js/winner-db.js` — normalization, pattern detail, deterministic linked-winner IDs, source snapshots
- `js/storage.js` / `js/firebase-service.js` — cloud-only persistence, auth, transaction-safe winner creation, upload rollback
- `functions/index.js` / `functions/image-cleanup.js` — Firestore-triggered cleanup of obsolete Winner screenshot objects
- `fixtures/showcase-fixtures.mjs` — synthetic trades, winners, and calculated manifest
- `tests/showcase.test.mjs` — calculator, journal, compatibility, winner-linking, and fixture tests
