# TradeMaster showcase verification

Verification date: 2026-09-14 (Asia/Kolkata)

Build under test: `/Users/naman/Documents/Coding/MyTrading/trademaster-web-v9-winner-fixes`, working tree implementation with `index.html` loading `js/app.js?v=20260914`. Existing uncommitted changes were left in place; no commit or deployment was created.

## Passed

- `npm test` — 12 tests passed.
- `node --check` passed for all `js/*.js`, `fixtures/*.mjs`, and `tests/*.mjs`.
- `git diff --check` passed.
- Static UI contract test confirms exactly `calculator`, `journal`, and `winners` tabs. Current HTML/app code has no MBI, Playbook, Sell Check, Dashboard, or AI Coach surface/import. Legacy `mbiScore` is covered only by compatibility tests/export behavior.
- Rules contract test confirms owner-scoped access and server-only phone verification/replay paths.
- Fixture manifest test confirms 12 trades across three months, 10 closed, 6 wins, 3 losses, 1 breakeven, 2 open, 4 winner examples, 2 linked winners, and 60% win rate. Both weighted-average and FIFO totals are calculated into the manifest: net P&L `₹6,235`, gross profit `₹8,258`, gross loss `₹2,023`; cumulative and monthly chart totals are checked for both methods.
- Calculator test and browser rehearsal confirmed the primary flow: capital `₹28,00,000`, risk `0.4%`, entry `₹2,500`, stop-loss `₹2,440`, quantity `186`, calculated risk `₹11,160`; target `3R` produced an estimated exit of `₹2,680` and estimated charges of `₹282`.
- Browser rehearsal used the installed Playwright CLI against `http://127.0.0.1:4173/?mode=demo`. Fixture seeding returned 12 trades / 4 winners and remained present after reload.
- Journal browser state showed the single headline summary row `₹6,235`, `10`, `6 of 10`, `2`; filtering to Closed + Winners updated both cards and charts to 6 records, `₹8,258`, and two rendered canvases. The partial-open TRENT card showed realized P&L while retaining 100 open units.
- Winner Database browser state showed 4 responsive cards and 4 screenshots. Linked source summaries were visible. A full-size RELIANCE preview opened and Escape closed it. At 390×844, `scrollWidth` did not exceed the viewport and the card grid collapsed to one column.
- Unsaved calculator handoff opened a journal draft with seeded fields. Closing it raised the discard confirmation; dismissing kept the draft, accepting closed it. Browser console had zero errors/warnings after the favicon fix.

Screenshots captured during the local rehearsal (kept outside the repository):

- Desktop calculator: `/tmp/trademaster-playwright-artifacts-20260914/page-2026-09-14T06-40-26-619Z.png`
- Desktop filtered Journal: `/tmp/trademaster-playwright-artifacts-20260914/page-2026-09-14T06-40-42-284Z.png`
- Mobile Winner Database at 390×844: `/tmp/trademaster-playwright-artifacts-20260914/page-2026-09-14T06-41-05-547Z.png`

The browser plugin was not available in this environment, so this used the installed Playwright CLI through the repository skill. The screenshots are evidence of the local synthetic build only.

## Not run / live Firebase boundary

- Google popup sign-in: not run; requires interactive account consent and an authorized HTTPS domain.
- X/Twitter sign-in: not run; the provider is intentionally hidden unless `twitterEnabled: true` and provider credentials/callback are configured.
- Phone SMS/reCAPTCHA sign-in: not run; requires Firebase Console setup or a configured fictional test number.
- Auth session isolation across two real accounts: not run; needs two controlled identities.
- Firestore live listeners, transaction-safe create-if-absent winner writes, cross-account denial, and deployed rule enforcement: not run. The local rules contract test is not an emulator test.
- Storage upload/download/delete/old-image cleanup: not run; requires an authenticated account, configured bucket, and Storage rules.
- App Check token/enforcement behavior: not run; requires a configured reCAPTCHA Enterprise site key and authorized HTTPS origin.
- Google Drive backup/restore: not run; requires Drive API enablement and interactive OAuth scope consent.
- Changed build on Firebase Hosting: not deployed by request. A read-only check of the known live URL returned HTTP 200, `last-modified: Sat, 12 Sep 2026`, and the deployed script still reported `js/app.js?v=20260913`; it is not evidence for this implementation.
- Firebase Emulator Suite and real-device/carrier PNV: not run. PNV remains outside this web-only implementation boundary.

These are deliberate environment/deployment boundaries, not claims that the live Firebase project is healthy. Deploy only after a separate release review and explicit authorization.
