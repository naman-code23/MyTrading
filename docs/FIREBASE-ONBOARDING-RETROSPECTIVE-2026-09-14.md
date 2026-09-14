# TradeMaster: Firebase onboarding retrospective and technical review

Reviewed 14 September 2026. Audience: Firebase engineering leads and senior management.

**Assessment:** Authentication, Cloud Firestore, Cloud Storage and Firebase Hosting are appropriate for this app. The implementation demonstrates a useful browser-to-Firebase architecture. The next milestone is to prove its security and failure behavior with Firebase tests and a hosted rehearsal. Adding more products would contribute less than closing those gaps.

This review inspected the current source, the onboarding handoff, the recorded showcase verification, six relevant Educative lessons and current Firebase documentation. It did not change application code, deploy rules, run real authentication, or inspect Firebase Console configuration. Findings from code review are identified separately from recorded onboarding experience.

## 1. What went well — ready-to-use talking points

| Point to present | Concrete evidence and appropriate qualification |
| --- | --- |
| “We integrated Firebase into a useful existing application without rebuilding the trading workflow.” | The calculator and trade accounting remain browser modules. A Firebase service layer handles identity, documents and files. This preserved the product while introducing managed services; no measured development-time saving is claimed. |
| “Each Firebase service has a clear product responsibility.” | Auth identifies the user; Firestore stores journal records, winner examples and settings; Storage holds screenshots; Hosting serves the web application. This makes the architecture straightforward to explain and inspect. |
| “The data layout made per-user authorization easy to express.” | Records and screenshots sit beneath UID-scoped paths. Source rules compare the authenticated UID to the path owner. This is a sound design choice; deployed isolation still needs allow/deny evidence. |
| “Realtime listeners fit the journal interaction naturally.” | Journal and Winner Database use `onSnapshot` subscriptions, with listener replacement on account changes. The code supports a second-session update demonstration without introducing a polling backend. Live synchronization has not yet been verified in the recorded tests. |
| “We treated screenshots as a file lifecycle, rather than putting image bytes into journal documents.” | Browser image preparation, Storage upload, Firestore references, and backend old-image cleanup are implemented. The browser retains input and only rolls back an upload that never became referenced. Cloud upload, trigger execution and recovery paths still need testing. |
| “Reducing the product scope made the demo more coherent.” | Calculator → Journal → Winner Database forms one useful workflow. Removed tabs and fake coaching no longer distract from the app or the Firebase integration. Legacy data compatibility was preserved in the source and local tests. |
| “We created a repeatable rehearsal instead of relying on personal trading records.” | The verification report records 20 passing tests and a synthetic fixture with 12 trades and four winner examples, plus desktop and mobile browser checks. Synthetic results are demonstration data, not evidence of trading performance. |

For a short presentation, use the first, second, third and last points. Describe the realtime and screenshot flows as implemented until the cloud rehearsal passes.

## 2. Frictions — what actually required attention

These are grounded in the handoff or current implementation. They are not claims of Firebase outages, quota failures or measured productivity loss.

| Friction | Realistic wording | Learning / improvement |
| --- | --- | --- |
| Local execution and authentication origins | “Opening a static app directly from disk was not a suitable Firebase workflow. We added a clear HTTP(S) warning and moved the authentication rehearsal to Hosting.” | Treat the origin and provider configuration as part of the setup instructions, alongside the SDK code. The handoff records the `file://` guard; it does not establish every possible authentication error occurred. |
| Setup spans code and Console | “Writing the sign-in flow did not finish onboarding. Providers, authorized domains, phone settings and optional OAuth callbacks also needed coordinated configuration.” | Maintain one checklist that maps each user-visible sign-in method to its Console prerequisites and a verification step. Do not claim Google, SMS or X succeeded without running them. |
| Sign-in and account linking are different operations | “Supporting Google and phone made the identity model more important. Different credentials do not automatically become one trading journal.” | The service contains a phone-linking branch, but the UI hides sign-in controls after authentication and has no linking action. Use one provider for the core rehearsal; design explicit linking and conflict recovery if needed. |
| A screenshot save crosses two services | “An image upload and a journal-document write do not commit together. We had to handle partial success, preserve the draft, and clean up old files.” | Test upload failure, document-write failure, uncertain outcomes and cleanup failure. A Firestore transaction does not make Storage operations atomic. This is application coordination work. |
| Local success is not Firebase verification | “The local rehearsal proved the interface and synthetic calculations, but it did not prove authorization, live listeners or cloud uploads.” | Replace the current rules text checks with Emulator Suite allow/deny tests, then run a hosted rehearsal. The local demo uses localStorage and is not the Firebase emulator. |
| Documentation drifted as scope changed | “Earlier plans included optional branches that were no longer part of the web demo.” | Label every capability as implemented, configured, verified or proposed. In particular, web SMS is not PNV; optional App Check code is not confirmed enforcement; screenshot cleanup is deployed, while reserved PNV verification paths are not. |

**New review observations, not historical incidents:** weak Firestore payload validation, a linked-winner concurrency path, a broad Hosting deployment directory, old SDK pinning, and image download-URL/privacy tradeoffs. Present these as remaining engineering work, not as problems already observed in production.

## 3. Are the service choices correct?

| Service | Verdict for TradeMaster | What the implementation does / what to improve |
| --- | --- | --- |
| Firebase Authentication | Appropriate | Google popup and standard phone SMS; optional X. UID is the data-owner boundary. Browser-local Auth persistence is explicit. Explain persistence on shared devices and test account changes. |
| Cloud Firestore | Appropriate | Document collections suit trades, settings and saved examples. Listeners and a narrow create-if-absent transaction are sensible. Add payload rules, executable rules tests and eventually bounded queries. |
| Cloud Storage | Appropriate | Image files belong outside Firestore documents. Owner-scoped paths plus size/type rules are a useful start. Test cleanup and decide whether reusable download URLs meet the intended privacy requirement. |
| Firebase Hosting | Appropriate | This is a static HTML/CSS/JavaScript application. Hosting is a suitable delivery service; an SSR framework or App Hosting migration is not required to improve this demo. Narrow the published file set. |
| App Check | Useful optional hardening | A conditional reCAPTCHA Enterprise integration exists. Confirm registration, request metrics and enforcement before calling it active protection. Auth establishes the user; App Check attests the app; rules authorize access. |
| Emulator Suite | Missing from verification; high priority | The source and test setup inspected do not connect the app to Auth, Firestore or Storage emulators. Add it to make security and failure cases repeatable. |
| Cloud Functions | Appropriate for screenshot cleanup; PNV remains future | Firestore triggers now clean obsolete Winner screenshot objects after document deletion or reference replacement. Add the future PNV callable branch only for trusted proof validation and custom-token issuance. It does not provide an atomic Firestore-plus-Storage commit, and orphan uploads from a failed document write still need client rollback or a separate bucket reconciliation job. |
| Realtime Database | No current requirement | Firestore already supports realtime listeners. Add another database only for a specific requirement, such as a presence design that justifies it. |
| Analytics / Crashlytics / PNV | Remain outside this showcase scope | These were intentionally excluded. Google Drive backup is a separate Google API integration, not a Firebase service; keep it outside the core walkthrough until its identity and restore behavior is tested. |

The recommendations above are judgments about this app, not a checklist requiring every Firebase product. See the official [Web setup guidance](https://firebase.google.com/docs/web/setup), [Firestore listeners](https://firebase.google.com/docs/firestore/query-data/listen), [App Check overview](https://firebase.google.com/docs/app-check), and [Authentication persistence](https://firebase.google.com/docs/auth/web/auth-state-persistence).

## 4. What the current rules actually guarantee

**Firestore source rules:** signed-in owners can read and write their profile, `meta` documents, trades and winners. The explicit nested matches matter: permission on a user document does not automatically authorize arbitrary subcollections. Owners can read `security/phone` but clients cannot write it. Clients cannot access root `verificationExchanges` records. Unmatched paths are denied.

The rules currently do **not** constrain document keys, types, enums, list sizes or immutable historical fields. They also do not establish that client-submitted P&L is authoritative. For a private journal, client calculations are reasonable; avoid describing them as audited or tamper-proof. Add compatibility-aware schema rules rather than suddenly rejecting existing records with legacy fields. Firebase documents [field/type validation and update restrictions](https://firebase.google.com/docs/firestore/security/rules-fields).

**Storage source rules:** reads require the path owner. Writes require the owner and either deletion or an object strictly smaller than 10 MiB with `image/*` content-type metadata. Exactly 10 MiB is rejected. A MIME metadata condition is not inspection of the file bytes.

The app uses `getDownloadURL` and long-lived public cache metadata. Possession of a valid tokenized URL is a different access path from an authenticated SDK read. Do not demonstrate only an SDK denial and conclude a copied URL is unusable. For stronger screenshot privacy, assess authenticated blob downloads, client rendering and an appropriate cache policy. See [Storage download methods](https://firebase.google.com/docs/storage/web/download-files).

These are source-level observations; the deployed rules and Console enforcement were not inspected in this review.

## 5. Highest-value work before a Firebase tech-lead showcase

### A. Prove authorization with executable tests

Use the Auth, Firestore and Storage emulators with controlled user A, user B and unauthenticated contexts. Test owner reads/writes, cross-user reads/writes, collection queries, unmatched paths, reserved verification paths, image deletion, wrong content types, just-under-limit files and exactly-10-MiB files. Once payload rules exist, add valid and invalid document cases. Keep the existing UI/unit checks, but label them correctly. Firebase's [rules testing guide](https://firebase.google.com/docs/rules/unit-tests) provides the relevant test environment and authenticated contexts.

Acceptance evidence: a reproducible command and test output covering both allowed and denied requests. The present regex checks of rules text are insufficient.

### B. Fix and test the linked-winner concurrency path

**Code-review finding; not a reproduced cloud incident.** A new linked draft is marked `linked-new`, but `saveWinnerForm` chooses between create and update based on whether a matching document is found at save time. If session B creates that winner while session A's new draft remains open, A can discover the existing document and call ordinary `saveWinner`, overwriting B's content. The stable ID prevents duplicate documents, but this path can bypass the intended no-overwrite transaction.

Preserve create-versus-edit intent: a `linked-new` draft should always use create-if-absent and open the existing record on conflict. Test two sessions creating from the same source trade with different notes and screenshots. Ensure the losing creation cannot replace the winner's content or delete its screenshot; intentional edits must remain possible. See [saveWinnerForm](/Users/naman/Documents/Coding/MyTrading/trademaster-web-v9-winner-fixes/js/app.js:752), [linked draft creation](/Users/naman/Documents/Coding/MyTrading/trademaster-web-v9-winner-fixes/js/app.js:867), and [Firestore transactions](https://firebase.google.com/docs/firestore/manage-data/transactions).

### C. Run a short hosted Firebase rehearsal

1. Confirm the intended build and Firebase project, then sign in through the actual Hosting origin.
2. Save a trade and show it in a second session of the same UID; reload both.
3. Create a linked winner with a synthetic screenshot; verify the document and Storage object persist.
4. Replace the screenshot and verify the old object is cleaned up after the record save.
5. Sign out and use a second controlled identity; prove the first user's data is unavailable through both UI state and direct SDK operations.
6. Exercise a rejected write and interrupted upload, preserving input and showing truthful status. Include an account change while a save or upload is pending.
7. If presenting App Check, show its actual metrics/enforcement state. Otherwise label it optional and unverified.

For privacy claims, test tokenized URLs separately from owner-authenticated SDK access. Use a fictional configured phone number for a repeatable SMS rehearsal if appropriate, and disclose that it is a test flow.

### D. Tighten deployment and presentation accuracy

`firebase.json` publishes `.` and ignores hidden files, node_modules, and the Functions source. Tests, fixtures, package metadata and rule files in that directory can therefore enter the Hosting artifact. Use a dedicated public/build directory or deliberate excludes, with a deploy-file inspection. This is deploy hygiene; this review did not establish that secrets were exposed. See [Hosting configuration](https://firebase.google.com/docs/hosting/full-config).

Keep one dated evidence table, mark synthetic screenshots, and state the live test boundary. Do not call the current source rules comprehensive validation or the optional App Check integration enforced protection.

### E. Improvements after the core rehearsal

- **SDK maintenance:** the app pins CDN modules to 10.12.2. Review release notes and upgrade under tests. For ongoing development, npm and a bundler would improve dependency management and build control; a framework rewrite is unnecessary. Current Firebase documentation recommends a module bundler for production. [Web setup](https://firebase.google.com/docs/web/setup)
- **Read volume:** listeners load each entire user collection ordered by creation time. Add a bounded recent-history view and pagination as data grows; ensure summaries still clearly describe their date range. Do not claim unlimited-scale or low-cost operation without measurements.
- **Offline semantics:** Auth persistence, localStorage demo mode and Firestore persistent caching are separate features. Firestore persistent offline caching is not explicitly enabled here. Decide whether it is needed, especially on shared devices, before adding it. [Firestore offline data](https://firebase.google.com/docs/firestore/manage-data/enable-offline)
- **Identity and restore:** explicit account linking requires conflict handling. The optional backup flow requests another Google popup, and restore deletes existing records before replacement; review account selection and interruption recovery before including these flows in the demo. [Account linking](https://firebase.google.com/docs/auth/web/account-linking)
- **Observability:** collect operation-specific error codes and test logs with useful user-visible recovery states. This can begin without expanding scope to Analytics or Crashlytics.

## 6. What the Educative course added to this review

I read the course overview/syllabus and these six relevant lesson contents through the signed-in browser. I did not complete all 46 lessons or execute course exercises.

| Lesson read | Implication for TradeMaster |
| --- | --- |
| [Cloud Firestore and Cloud Storage Security Rules](https://www.educative.io/courses/complete-guide-firebase-web/cloud-firestore-and-cloud-storage-security-rules) | Reinforces path matching, request conditions and data validation. Our ownership checks are a start; schema checks are the obvious next step. Some teaching examples isolate a single condition or allow broad reads. Do not copy those as private-journal policies: combine ownership and validation. |
| [Connect Your Application to the Emulator Suite](https://www.educative.io/courses/complete-guide-firebase-web/connect-your-application-to-the-emulator-suite) | Strengthens the case for a real emulator-backed workflow. A separate localStorage demo is not equivalent. |
| [Read Data from Cloud Firestore](https://www.educative.io/courses/complete-guide-firebase-web/read-data-from-cloud-firestore) | The app correctly distinguishes one-shot document reads from realtime collection subscriptions. Next verify lifecycle and query scope. |
| [Persistence in Firebase](https://www.educative.io/courses/complete-guide-firebase-web/persistence-in-firebase) | Makes the Auth persistence choice explicit. The app chooses browser-local persistence; this should be explained separately from data caching. |
| [Introduction to Cloud Functions](https://www.educative.io/courses/complete-guide-firebase-web/introduction-to-cloud-functions) | Functions solve backend-trigger and trusted server-work requirements. Their inclusion in a course does not make them necessary for every app. |
| [Deploying to Firebase Hosting](https://www.educative.io/courses/complete-guide-firebase-web/deploying-to-firebase-hosting) | Deployment configuration determines the published files. Verify the artifact and actual hosted revision after deployment. |

The [course](https://www.educative.io/courses/complete-guide-firebase-web) teaches the modular Firebase 9 era. Its core concepts are useful, but use current official documentation for API details, supported behavior and operational decisions rather than treating older snippets as a production template.

## 7. Current evidence and limits

| Claim | Evidence as of this review |
| --- | --- |
| Three-tab product and local workflow | Source inspection plus the recorded 14 September local test/browser rehearsal. |
| New page is hosted | Fresh read-only HTTP check on 14 September returned 200 at `https://trading-d5a0e.web.app/`, script `js/app.js?v=20260914`, and exactly calculator, journal and winners tabs. Last-Modified: 14 September 2026 08:33:10 UTC. This supersedes the older report's deployment observation, but is not an authenticated end-to-end test or a full source hash comparison. |
| Unit/UI checks | The [verification report](/Users/naman/Documents/Coding/MyTrading/docs/SHOWCASE-VERIFICATION.md) records 20 passing tests and a synthetic desktop/mobile rehearsal. |
| Deployed screenshot cleanup | Both Gen 2 Functions are `ACTIVE` in `trading-d5a0e`, with Firestore delete/update triggers for `users/{userId}/winners/{winnerId}`. Trigger delivery and live Storage deletion were not manually rehearsed. |
| Live Auth, synchronization, uploads, isolation and deployed rules | Not verified in this review or in the recorded showcase tests. |
| App Check enforcement | Unknown; conditional source integration is present. |
| Linked-winner overwrite scenario | Supported by current control-flow inspection; requires a targeted reproduction and regression test. |

## 8. Suggested 45-second retrospective

“The most useful part of this onboarding was applying Firebase to a real workflow. Auth gives each user an identity, Firestore stores the journal and saved examples, Storage handles screenshots, and Hosting delivers the app. We kept the calculator in the browser and avoided a custom CRUD backend.

“The friction was mostly at the boundaries: provider setup, sign-in versus account linking, and coordinating an image upload with a document save. The local rehearsal is repeatable, but it does not prove cloud authorization. My next steps are emulator allow/deny tests, a two-account hosted rehearsal, and tighter payload validation. I also found a concurrent-create path in linked examples that needs correction before claiming no-overwrite behavior.”

## Source pointers

- [Onboarding handoff](/tmp/mytrading-handoff-2026-09-14.md)
- [Showcase verification](/Users/naman/Documents/Coding/MyTrading/docs/SHOWCASE-VERIFICATION.md)
- [Showcase demo](/Users/naman/Documents/Coding/MyTrading/docs/SHOWCASE-DEMO.md)
- [Firebase service implementation](/Users/naman/Documents/Coding/MyTrading/trademaster-web-v9-winner-fixes/js/firebase-service.js)
- [Application save/lifecycle handling](/Users/naman/Documents/Coding/MyTrading/trademaster-web-v9-winner-fixes/js/app.js)
- [Firestore rules](/Users/naman/Documents/Coding/MyTrading/trademaster-web-v9-winner-fixes/firestore.rules)
- [Storage rules](/Users/naman/Documents/Coding/MyTrading/trademaster-web-v9-winner-fixes/storage.rules)
- [Hosting configuration](/Users/naman/Documents/Coding/MyTrading/trademaster-web-v9-winner-fixes/firebase.json)
- [Google Slides presentation](https://docs.google.com/presentation/d/16tgDUM6f6Cx4t0b7rnhI4AbizwBpvHlIMmdvJEDyahw/edit)
