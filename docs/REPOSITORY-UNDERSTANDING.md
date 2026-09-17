# MyTrading repository understanding

Inspected on 2026-09-12. Source: https://github.com/naman-code23/MyTrading

The complete Git repository is saved at `/Users/naman/Documents/Coding/MyTrading`, including its fetched history. Inspected commit: `17c2d39a3b09d3dc7d6bc5793dc359498b406d91` on `main` (commit date 2026-05-19). The checkout contains 84 tracked files and 30 commits reachable from HEAD.

## Current showcase implementation

The 2026-09-14 showcase pass reduces the v9 surface to exactly three tabs: Calculator, Journal, and Winner Database. MBI, Playbook, Sell Check, AI Coach, and the standalone Dashboard are not imported or rendered. Journal performance contains only the two closed-trade charts requested by the showcase. Legacy MBI fields remain in normalized storage/export compatibility paths and are not current UI or filter logic. Older snapshots and the offline Git archive remain unchanged.

## Product and recommended baseline

TradeMaster Pro is a personal trading journal and review workspace. Its useful loop is: calculate position risk, record executions and context, review outcomes, and save examples of winning chart patterns. No broker execution backend or live market-data service was found in this checkout.

The repository contains four parallel static web-app snapshots:

| Folder | Role |
| --- | --- |
| `trademaster-web-v4` | Calculator, market-regime tools, journal and Firebase foundation |
| `trademaster-web-v5-ai` | Adds the coach module |
| `trademaster-web-v8-winner-image-upload` | Adds Winner DB and image uploads; also contains a local assistant |
| `trademaster-web-v9-winner-fixes` | Highest-numbered snapshot; simplifies the Winner DB implementation and removes the separate local assistant |

Use v9 as the cloud-backed product baseline. This is an inference from the repository structure and comparison, not confirmation that v9 is the currently deployed website. Preserve the other snapshots as references. Do not combine their code indiscriminately.

## Workflows and code map

Paths below are relative to `trademaster-web-v9-winner-fixes/`.

| Surface | What the code does | Main implementation |
| --- | --- | --- |
| Calculator | Capital/risk/entry/stop sizing, target projections and estimated charges; seeds journal entries | `js/calc.js`, `js/app.js` |
| Legacy MBI / Playbook / Sell Check | Historical compatibility module and fields; not imported by the current three-tab UI | `js/mbi.js`, legacy snapshots |
| Journal | Multiple fills per trade, pyramiding, partial exits, fixed weighted-average metrics, tags, notes and filters | `js/trade-engine.js`, `js/app.js` |
| Tradebook import | Parses broker CSV, consolidates execution fragments, groups position cycles and merges imported records | `js/tradebook-importer.js`; `handleTradebookImport` in `js/app.js` |
| Journal performance | Closed-trade cumulative and monthly P&L charts, using the same filters as the summary/cards | `js/charts.js`, `js/trade-engine.js`, `js/app.js` |
| Removed Dashboard / AI Coach | No current surface; old modules/snapshots are retained only as historical references | legacy snapshots |
| Winner DB | Chart-pattern library with moves, bases, expansions, notes, tags, filters and screenshot metadata | `js/winner-db.js`, `js/app.js` |
| Image processing | Browser resize to a default maximum dimension of 1600px and WebP/JPEG compression; backend cleanup of obsolete Storage objects | `js/image-tools.js`, `functions/` |
| Settings / export | Cloud settings; browser-generated CSV export | `js/storage.js`, `js/firebase-service.js` |

The financial calculation formulas were read to understand the application; this inspection is not a validation of current trading costs or strategy performance. The showcase fixture is synthetic and must not be presented as a live result.

## Architecture already present

`index.html` loads configuration, Chart.js from a CDN, and `js/app.js` as an ES module. There is no package manifest, bundler, application server or automated test suite in the tracked checkout. v9 contains roughly 5,900 lines of JavaScript, including a roughly 2,300-line UI controller.

`createStorageLayer()` has one persistence path: `createFirebaseService()` dynamically imports Firebase web SDK 10.12.2, uses Google popup sign-in, listens to Firestore collections, and uploads screenshots to Storage. Missing configuration or a `file://` origin is a startup error; there is no browser-storage fallback. The Functions package reacts to Winner deletes and screenshot-reference changes to delete obsolete Storage objects.

The checked-in configurations are non-placeholder Firebase configurations. Their existence does not establish whether the associated backend, providers, rules, billing or deployment are currently working. No existing cloud data was accessed during this review.

Existing cloud data layout:

```text
Firebase Auth user: uid
Firestore:
  users/{uid}                         profile
  users/{uid}/meta/settings           Fixed weighted-average P&L, currency, timezone
  users/{uid}/trades/{tradeId}         trade with embedded fills
  users/{uid}/winners/{winnerId}       pattern and image metadata
Storage:
  users/{uid}/winner-images/{winnerId}/{file}
```

The checked-in Firestore rules constrain the listed paths to their owner, but do not validate document schemas. Storage rules constrain the owner, image content type and size below 10 MiB. Their deployment has not been checked.

## Integration details that affect the proposal

1. **Identity is the main compatibility boundary.** Every journal and image belongs to a UID. Creating an unrelated phone-auth account will show an empty workspace, even when the human already has a Google account. Preserve the UID through explicit linking.
2. **Real-time listeners already exist.** Demonstrate them across Android and web; there is no reason to add a second real-time database.
3. **Durable web offline caching is not configured.** `getFirestore(app)` uses the default cache. The app requires Firebase and does not present browser-local journal data when offline. See [Firestore offline behavior](https://firebase.google.com/docs/firestore/manage-data/enable-offline).
4. **A save waits for cloud operations.** `saveTrade` and `saveWinner` first read the existing document and then await a write. If adding offline editing later, explicitly address pending writes and UI completion instead of assuming a cache setting solves everything.
5. **Collection listeners load whole histories.** Fine for a small onboarding dataset; pagination and summary maintenance belong after the first live identity flow works.
6. **Profile creation time is overwritten.** `upsertProfile()` writes a fresh `createdAt` during every Google sign-in. Correct this when centralizing profile initialization for all sign-in providers.
7. **Image URLs and image access are different concerns.** Uploads store a download URL and set long-lived public cache metadata. For a private journal, prefer authenticated SDK blob downloads by storage path, with suitable CORS and cache handling. Existing download tokens need separate revocation/migration if privacy guarantees change. See [Storage download options](https://firebase.google.com/docs/storage/web/download-files).
8. **Hosting config serves the entire app directory.** The Functions source is explicitly excluded, but docs, tests and fixtures still need deliberate deployment hygiene before a production release. Firebase Hosting is appropriate for the static app; a framework migration is unnecessary.

## Initial verification before changes

- Git clone completed; `git fsck --full` passed.
- v8 and v9 were compared, and the v9 bootstrap, storage/auth flow, domain modules, importer, images and rules were inspected.
- All 14 v9 JavaScript files passed `node --check`.
- A synthetic closed trade (10 units bought at 100, sold at 110, total fees 10) returned gross P&L 100, net P&L 90, zero open quantity and CLOSED status.
- Winner normalization was exercised with a synthetic entry.

No browser session, live Firebase sign-in, upload, deployment, provider configuration or real-device PNV flow was tested. These checks establish a useful code baseline, not a working-cloud certification.

The local checkout saves the source offline. Running the existing cloud application still requires internet access; CDN dependencies are not vendored and cloud user data is not included. A fully disconnected app launch would be a separate packaging/caching change.


## Verification boundary

Historical test evidence, browser screenshots, and live Firebase checks that remain unexercised are recorded in [SHOWCASE-VERIFICATION.md](SHOWCASE-VERIFICATION.md). The source is tracked in GitHub, but Firebase services still require a separate deploy. The original Git archive remains an unchanged backup.
