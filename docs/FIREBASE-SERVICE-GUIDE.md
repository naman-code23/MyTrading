# TradeMaster Firebase service guide

This is a code-reading and configuration guide for the active v9 app at [`trademaster-web-v9-winner-fixes/`](../trademaster-web-v9-winner-fixes/). It describes what the repository implements, what was configured in Firebase, and what has or has not been verified live. Older `trademaster-web-v4`, `trademaster-web-v5-ai`, and `trademaster-web-v8-winner-image-upload` folders are historical snapshots; start with v9.

## Current status at a glance

| Area | Repository status | Live verification status |
| --- | --- | --- |
| Firebase web bootstrap | Implemented in `js/firebase-service.js` and `js/config.js` | The known Hosting URL responds, but Firebase Auth and data flows were not end-to-end tested |
| Authentication | Google and Phone are implemented | Provider sign-in, account isolation, SMS and reCAPTCHA were not rehearsed with real accounts |
| Cloud Firestore | Trades, winners, settings, profiles and listeners are implemented | Rules and listener behavior were not emulator- or account-tested in the showcase pass |
| Cloud Storage | Winner screenshots are resized, uploaded and referenced by path | Live upload/download/delete was not tested |
| Firebase Hosting | Static site configuration exists and serves the app | Hosting was not redeployed with the Functions change; the known URL is [`trading-d5a0e.web.app`](https://trading-d5a0e.web.app/) |
| Cloud Functions | Delete/update triggers for obsolete Winner screenshots are implemented and deployed | Both Functions were confirmed `ACTIVE` in project `trading-d5a0e`; a real Firestore-to-Storage cleanup event was not manually exercised |
| App Check | Optional web reCAPTCHA Enterprise initialization is implemented | No site key or enforcement behavior was verified |
| Emulator Suite | Not configured in this repository | Not run |
| PNV | Not part of this web implementation | Requires a separate Android/carrier/backend design |

The last live Functions check confirmed `cleanupWinnerImageOnDelete` and `cleanupWinnerImageOnUpdate` in `us-central1`, triggered by Winner documents in the `nam5` Firestore region. Firebase also warned that the current Node.js 20 runtime will be decommissioned on 2026-10-30 and that no Artifact Registry cleanup policy is configured.

## How to read the directory

Read the application from the browser entry point inward:

```text
index.html
  ├─ js/config.js                 browser Firebase configuration
  └─ js/app.js                    UI bootstrap and user actions
       └─ js/storage.js           cloud persistence adapter
            └─ js/firebase-service.js  Firebase Web SDK calls
                 ├─ Authentication
                 ├─ Cloud Firestore
                 ├─ Cloud Storage
                 └─ optional App Check

firestore.rules                   Firestore authorization
storage.rules                     Storage authorization
firebase.json                     Hosting, rules and Functions wiring
functions/index.js                deployed Firestore trigger entry points
functions/image-cleanup.js        safe/idempotent cleanup decision logic
functions/package.json            backend runtime and dependencies
tests/                             local contract tests
docs/FIREBASE-CONSOLE-SETUP.md    manual Console checklist
```

Recommended reading order for a new engineer:

1. [`index.html`](../trademaster-web-v9-winner-fixes/index.html) — see the three product surfaces, sign-in controls, phone modal and module bootstrap.
2. [`js/config.example.js`](../trademaster-web-v9-winner-fixes/js/config.example.js) — identify the browser configuration fields without exposing the local configured values.
3. [`js/app.js`](../trademaster-web-v9-winner-fixes/js/app.js) — follow `bootstrap()`, `updateUserSummary()`, auth event binding, subscriptions and save/delete handlers.
4. [`js/storage.js`](../trademaster-web-v9-winner-fixes/js/storage.js) — see the cloud persistence adapter and UID-scoped operations.
5. [`js/firebase-service.js`](../trademaster-web-v9-winner-fixes/js/firebase-service.js) — inspect the actual Auth, Firestore, Storage and App Check SDK calls.
6. [`firestore.rules`](../trademaster-web-v9-winner-fixes/firestore.rules) and [`storage.rules`](../trademaster-web-v9-winner-fixes/storage.rules) — verify who may read or write each path.
7. [`functions/index.js`](../trademaster-web-v9-winner-fixes/functions/index.js) and [`functions/image-cleanup.js`](../trademaster-web-v9-winner-fixes/functions/image-cleanup.js) — inspect backend cleanup and its safety checks.
8. [`firebase.json`](../trademaster-web-v9-winner-fixes/firebase.json) — connect source directories to Hosting, rules and Functions deployment.
9. [`tests/`](../trademaster-web-v9-winner-fixes/tests/) — see the repeatable local contracts and their limits.

The runtime path is:

```text
HTTP(S) page → config.js → app.js → storage.js
  └─ usable config → Firebase Auth / Firestore / Storage

Firestore Winner delete/update → Eventarc → Cloud Function → Storage object cleanup
```

Do not use `file://` for Firebase features. The cloud-only app refuses to start on a file URL because browser modules and phone authentication require an HTTP(S) origin.

## Shared Firebase bootstrap and configuration

### Where to read it

- [`js/config.js`](../trademaster-web-v9-winner-fixes/js/config.js) contains the machine-local web config for the selected Firebase project. Do not copy its configured values into documentation.
- [`js/config.example.js`](../trademaster-web-v9-winner-fixes/js/config.example.js) documents the expected keys.
- [`js/firebase-service.js`](../trademaster-web-v9-winner-fixes/js/firebase-service.js) checks the config, rejects `file://`, dynamically imports the Firebase Web SDK modules, and creates the app services.
- [`js/storage.js`](../trademaster-web-v9-winner-fixes/js/storage.js) requires Firebase startup and exposes UID-scoped cloud operations.
- [`index.html`](../trademaster-web-v9-winner-fixes/index.html) loads `config.js` before the `app.js` module.

### Configuration done

1. A Firebase web app was registered and its browser config was put in the local `js/config.js`.
2. The v9 app checks for a complete `apiKey`, `authDomain` and `projectId` before starting; missing or unsafe configuration is a startup error, not a local fallback.
3. The exact Storage bucket value is configured for the project (`trading-d5a0e.firebasestorage.app` in the deployed Functions environment).
4. `firebase.json` now declares the `functions/` source and excludes it from the Hosting artifact.
5. Functions dependencies are isolated in `functions/package.json`; the root app remains a static browser app.

### Most useful code

```js
const config = window.TRADEMASTER_CONFIG?.firebase || {};
state.storage = await createStorageLayer(config);
// createStorageLayer throws when Firebase is unavailable.
```

`createStorageLayer()` creates the cloud adapter only after Firebase startup succeeds. With missing or unsafe configuration it throws a visible startup error; journal, Winner Database, settings, and screenshots never fall back to browser storage.

### Important caveat

The web config is client-visible configuration, not an Admin SDK credential. Never put a Firebase service-account JSON, Admin private key, or other server secret in `js/config.js` or Hosting. Restrict browser API keys in Google Cloud Console as appropriate, and rely on Auth, Firestore rules, Storage rules and App Check for access control.

## 1. Firebase Authentication

### What it does here

Authentication establishes the Firebase UID that scopes private journal and screenshot data. It is not the place where trades or images are stored.

### Where to read the code

- [`js/firebase-service.js`](../trademaster-web-v9-winner-fixes/js/firebase-service.js): Firebase Auth imports, persistence, Google popup sign-in, Phone SMS, reCAPTCHA verifier, profile upsert and sign-out.
- [`js/storage.js`](../trademaster-web-v9-winner-fixes/js/storage.js): exposes `signIn()`, `requestPhoneCode()`, `confirmPhoneCode()`, `signOut()` and the auth-state adapter to the UI.
- [`js/app.js`](../trademaster-web-v9-winner-fixes/js/app.js): `updateUserSummary()`, `bindToolbarEvents()`, `handleAuthChanged()` and private-data notices.
- [`index.html`](../trademaster-web-v9-winner-fixes/index.html): Google and Phone sign-in controls, plus the two-step phone modal.
- [`firestore.rules`](../trademaster-web-v9-winner-fixes/firestore.rules): uses `request.auth.uid` for ownership checks.

### Configuration steps

1. In Firebase Console, enable **Google** under Authentication → Sign-in method.
2. Enable **Phone**, allow the countries needed for testing under the SMS region policy, and add fictional test numbers when an SMS-free rehearsal is needed.
3. Add the actual HTTPS Hosting or development domain under Authentication → Settings → Authorized domains.
4. Keep browser-local Auth persistence enabled for this app; it is configured in code rather than in Console.

### Most useful code

```js
await setPersistence(auth, browserLocalPersistence);

const result = await signInWithPopup(auth, new GoogleAuthProvider());
await upsertProfile(result.user);
```

Google popup sign-in returns a Firebase user and the app writes a small profile document under `users/{uid}`. It does not use a browser reCAPTCHA widget because Google OAuth has its own provider-controlled anti-abuse and risk checks.

Phone auth follows a different risk path:

```js
const verifier = getPhoneRecaptcha('phoneRecaptcha');
phoneConfirmation = auth.currentUser
  ? await linkWithPhoneNumber(auth.currentUser, normalized, verifier)
  : await signInWithPhoneNumber(auth, normalized, verifier);
```

The visible phone flow first renders Firebase's reCAPTCHA verifier, then sends an SMS challenge and confirms the six-digit code. If a signed-in user explicitly enters the linking path, the credential can remain under the existing UID; otherwise a phone sign-in can create or open a separate Firebase user. Providers do not automatically merge accounts.

The UI intentionally shows Google/Phone/X only while signed out and only Sign out while signed in. The `linkWithPhoneNumber` branch exists in the service layer but there is no visible account-linking action in the current showcase.

### Caveats

- Phone SMS reCAPTCHA is different from optional Firebase App Check. The former protects the SMS sign-in request; the latter attests requests from the app.
- A real account rehearsal needs an HTTPS authorized domain, provider setup and controlled identities.
- Auth state changes must replace Firestore listeners. `storage.js` and `app.js` use a session epoch and unsubscribe functions to avoid rendering another UID's data.
- A Google user and a phone user are separate accounts unless the user deliberately links credentials.

## 2. Cloud Firestore

### What it does here

Firestore is the private document database and realtime source for the journal, Winner Database and settings. Calculations remain browser code; Firestore stores the records and source snapshots.

### Data layout

```text
users/{uid}                         profile summary
users/{uid}/meta/settings           Fixed weighted-average P&L, capital, risk %, currency, timezone
users/{uid}/trades/{tradeId}        execution fills and journal fields
users/{uid}/winners/{winnerId}      winner example and image reference
users/{uid}/security/phone          reserved backend-written phone state
verificationExchanges/{exchangeId} reserved server-only replay records
```

### Where to read the code

- [`js/firebase-service.js`](../trademaster-web-v9-winner-fixes/js/firebase-service.js): `getFirestore`, collection helpers, profile/settings reads, `getDoc`, `setDoc`, `deleteDoc`, batches, `onSnapshot` and the winner transaction.
- [`js/storage.js`](../trademaster-web-v9-winner-fixes/js/storage.js): cloud adapter methods and one-shot reads built from the realtime subscription methods.
- [`js/app.js`](../trademaster-web-v9-winner-fixes/js/app.js): `subscribeToTrades()`, `subscribeToWinners()`, save/delete handlers and session checks.
- [`js/trade-engine.js`](../trademaster-web-v9-winner-fixes/js/trade-engine.js): browser-side fill matching and P&L calculations after records arrive.
- [`js/winner-db.js`](../trademaster-web-v9-winner-fixes/js/winner-db.js): Winner normalization, linked IDs and bounded source snapshots.
- [`firestore.rules`](../trademaster-web-v9-winner-fixes/firestore.rules): authorization boundary.

### Configuration steps

1. Create the Firestore database in the selected Firebase project.
2. Deploy the v9 [`firestore.rules`](../trademaster-web-v9-winner-fixes/firestore.rules) file from the repository root.
3. Keep all client data below `users/{uid}` and preserve the server-only verification paths.
4. Use the Emulator Suite before claiming cross-account isolation or rules correctness.

The source rules are ready and are covered by local contract assertions, but the current showcase evidence does not prove deployed rule enforcement.

### Most useful code

Realtime subscriptions are centralized:

```js
function subscribeCollection(collectionRef, callback, onError) {
  const q = query(collectionRef, orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
  }, onError);
}
```

Winner creation from a profitable trade is guarded by a transaction:

```js
return runTransaction(db, async (transaction) => {
  const existing = await transaction.get(reference);
  if (existing.exists()) return { created: false, entry: deserializeDocument(existing) };
  transaction.set(reference, { ...entry, id, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return { created: true, entry: { ...entry, id } };
});
```

The transaction prevents two sessions from creating two records for the same deterministic linked Winner ID. It does not make a Storage upload and a Firestore write one atomic operation.

### Example rules

```text
match /users/{userId}/trades/{tradeId} {
  allow read, write: if request.auth != null
                    && request.auth.uid == userId;
}

match /users/{userId}/security/phone {
  allow read: if request.auth != null
              && request.auth.uid == userId;
  allow write: if false;
}

match /verificationExchanges/{exchangeId} {
  allow read, write: if false;
}
```

The same ownership check is used for Winners and settings. The rules currently focus on ownership and server-only paths; they do not comprehensively validate every client field, enum, list length or client-computed P&L value.

### Caveats

- `onSnapshot` is realtime, but live listener replacement and cross-account isolation were not manually tested.
- The browser is allowed to write a broad record shape for compatibility with historical fields. Add schema validation carefully so legacy records are not broken.
- Firestore authorization is independent of Storage authorization. Passing one does not grant the other.

## 3. Cloud Storage

### What it does here

Storage holds Winner screenshots as objects. Firestore stores `imageStoragePath`, `imageUrl` and image metadata; it does not hold the image bytes.

### Where to read the code

- [`js/image-tools.js`](../trademaster-web-v9-winner-fixes/js/image-tools.js): validates image input, resizes to the app's maximum dimension and compresses to WebP/JPEG.
- [`js/firebase-service.js`](../trademaster-web-v9-winner-fixes/js/firebase-service.js): `getStorage`, `uploadBytes`, `getDownloadURL`, `deleteObject` and the canonical object path.
- [`js/storage.js`](../trademaster-web-v9-winner-fixes/js/storage.js): exposes upload and rollback methods to the app.
- [`js/app.js`](../trademaster-web-v9-winner-fixes/js/app.js): prepares the selected file, writes the Winner document and rolls back only a newly uploaded object when its document write definitively fails.
- [`storage.rules`](../trademaster-web-v9-winner-fixes/storage.rules): owner, type and size restrictions.
- [`FIREBASE-STORAGE-SETUP.md`](../trademaster-web-v9-winner-fixes/FIREBASE-STORAGE-SETUP.md): bucket and billing setup notes.
- [`functions/image-cleanup.js`](../trademaster-web-v9-winner-fixes/functions/image-cleanup.js): backend cleanup of an obsolete referenced object.

### Object layout

```text
users/{uid}/winner-images/{winnerId}/{timestamp}-{sanitized-file-name}
```

The user and Winner ID are part of the path so Storage rules can enforce the same ownership boundary as Firestore. The backend deletes only the old path that was previously referenced by that Winner document.

### Configuration steps

1. Enable Firebase Storage and create/use the project's default bucket.
2. Put the exact bucket value from Firebase Console in `js/config.js`; new projects commonly use `PROJECT_ID.firebasestorage.app`, while older projects may use `PROJECT_ID.appspot.com`.
3. Storage currently requires the Blaze plan for this project setup; keep images compressed and monitor usage.
4. Deploy [`storage.rules`](../trademaster-web-v9-winner-fixes/storage.rules).
5. Deploy the screenshot-cleanup Functions if browser-side obsolete-image cleanup is not being used.

### Most useful code

```js
const storagePath = buildWinnerImagePath(userId, winnerId, fileName);
const reference = storageRef(storage, storagePath);
await uploadBytes(reference, fileBlob, {
  contentType,
  cacheControl: 'public,max-age=31536000,immutable',
});
const downloadUrl = await getDownloadURL(reference);
return { storagePath, downloadUrl };
```

### Example rules

```text
match /users/{userId}/winner-images/{winnerId}/{allPaths=**} {
  allow read: if request.auth != null
              && request.auth.uid == userId;
  allow write: if request.auth != null
               && request.auth.uid == userId
               && (
                 request.resource == null
                 || (
                   request.resource.size <= 1 * 1024 * 1024
                   && request.resource.contentType.matches('image/.*')
                 )
               );
}
```

`request.resource == null` permits deletes for the owner. New or replaced objects must be images no larger than 1 MiB.

### Caveats

- The upload and the Firestore reference write are separate operations. A Firestore trigger cannot discover an upload that was never referenced, so the browser retains a rollback path for a definitively failed document write.
- The Functions cleanup is idempotent and treats a missing object as success. It also checks whether the old path has been re-referenced before deleting it.
- The app currently stores a download URL with long-lived public cache metadata. A copied tokenized URL may be usable even when a later SDK read would fail a rule check. This is a privacy/design tradeoff, not proof of public browsing access.
- Live Storage upload, download, delete, rules enforcement and trigger cleanup were not exercised with a controlled Firebase account.

## 4. Firebase Hosting

### What it does here

Hosting serves the static HTML/CSS/JavaScript app over HTTPS. It is important for Firebase Auth because `file://` and unauthorized domains are not valid production origins.

### Where to read the code

- [`firebase.json`](../trademaster-web-v9-winner-fixes/firebase.json): Hosting public directory, rewrite, ignore list and backend source declarations.
- [`index.html`](../trademaster-web-v9-winner-fixes/index.html): static entry page and script versions.
- [`js/config.js`](../trademaster-web-v9-winner-fixes/js/config.js): browser Firebase configuration loaded before `app.js`.
- [`README.md`](../trademaster-web-v9-winner-fixes/README.md): deployment boundary and commands.

### Configuration steps

1. Select the intended Firebase project with `firebase use --add`.
2. Keep Hosting's public directory pointed at the v9 app directory.
3. Keep `functions/**` excluded from Hosting so backend source and dependencies are not published as static files.
4. Add the resulting Hosting domain to Firebase Authentication → Authorized domains.
5. Serve the app with `firebase deploy --only hosting` or use the combined release command when rules and Functions have separately passed review.

The current known site is [`https://trading-d5a0e.web.app/`](https://trading-d5a0e.web.app/). Hosting was not redeployed during the screenshot-cleanup Functions change, so the live site should not be assumed to contain every latest GitHub change.

### Most useful configuration

```json
{
  "hosting": {
    "public": ".",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**", "functions/**"],
    "rewrites": [{ "source": "**", "destination": "/index.html" }]
  }
}
```

The rewrite supports the single-page app shell. The `functions/**` ignore is a packaging boundary, not a permission boundary.

### Caveats

- Always test Firebase features over HTTP(S); a local `file://` page is rejected by the cloud-only app.
- Hosting deployment and GitHub push are separate actions. Pushing source to GitHub does not publish a new Firebase Hosting revision.
- With `public: "."`, deliberate ignore rules matter. Inspect the Hosting artifact before a production release.
- The current Functions deployment was separate from Hosting; deploy both only when the release boundary explicitly includes both.

## 5. Cloud Functions

### What it does here

Cloud Functions perform trusted backend cleanup that should not depend on a browser remaining open. The current backend has no callable PNV exchange, broker integration or scheduled trading logic.

### Where to read the code

- [`functions/index.js`](../trademaster-web-v9-winner-fixes/functions/index.js): Admin SDK initialization, default bucket access, current-reference guard and exported triggers.
- [`functions/image-cleanup.js`](../trademaster-web-v9-winner-fixes/functions/image-cleanup.js): path ownership validation, decision logic, idempotent delete and logging.
- [`functions/package.json`](../trademaster-web-v9-winner-fixes/functions/package.json): Node runtime and `firebase-admin` / `firebase-functions` dependencies.
- [`functions/package-lock.json`](../trademaster-web-v9-winner-fixes/functions/package-lock.json): reproducible dependency resolution.
- [`firebase.json`](../trademaster-web-v9-winner-fixes/firebase.json): points Firebase CLI at `functions/`.
- [`tests/functions.test.mjs`](../trademaster-web-v9-winner-fixes/tests/functions.test.mjs): local trigger and cleanup contracts.

### Configuration and deployment steps

1. Add the `functions/` source, package metadata and lockfile.
2. Keep the runtime aligned with the declared engine (`node: "20"` at the time of this implementation).
3. Install backend dependencies:

   ```bash
   npm install --prefix functions
   ```

4. Deploy only the backend when that is the approved boundary:

   ```bash
   firebase deploy --only functions
   ```

   If the Firebase CLI is not installed globally, the equivalent used for the verified deployment was:

   ```bash
   npx --yes firebase-tools@latest deploy --only functions --project trading-d5a0e
   ```

5. Verify with `firebase functions:list` that both trigger names are active.

The deployment created these Gen 2 functions in project `trading-d5a0e`:

- `cleanupWinnerImageOnDelete` — Firestore document delete trigger.
- `cleanupWinnerImageOnUpdate` — Firestore document update trigger.

Both watch `users/{userId}/winners/{winnerId}` and use a `nam5` Eventarc trigger region with a `us-central1` function runtime region.

### Most useful code

```js
export const cleanupWinnerImageOnDelete = onDocumentDeleted(
  'users/{userId}/winners/{winnerId}',
  async (event) => cleanupObsoleteWinnerImage({
    before: event.data?.data(),
    after: null,
    userId: event.params.userId,
    winnerId: event.params.winnerId,
    bucket: getDefaultBucket(),
    isCurrentlyReferenced: (path) => isWinnerImageCurrentlyReferenced(
      event.params.userId,
      event.params.winnerId,
      path,
    ),
  }),
);
```

The update trigger uses the same cleanup helper with `before` and `after` snapshots. The helper only deletes the previous `imageStoragePath` when it differs from the new reference, belongs to the exact user/Winner prefix, and is not currently referenced after a race.

The path safety check is intentionally narrow:

```js
const prefix = `users/${userId}/winner-images/${winnerId}/`;
return Boolean(
  normalized.startsWith(prefix)
  && normalized.length > prefix.length
  && !hasUnsafePathSegment(normalized),
);
```

### Understanding and caveats

- Firestore event delivery is background processing and should be treated as at-least-once and potentially out of order. Deletes are therefore idempotent.
- The current-reference read prevents a late cleanup event from deleting a path that was re-referenced, but it is not a cross-service transaction.
- A trigger cannot find an object that was uploaded and then never referenced by a successful Firestore write. Browser rollback and/or a separate reconciliation job remains necessary.
- The verified deploy returned a post-deploy warning because no Artifact Registry cleanup policy was configured. Functions were active, but the policy should be set before images accumulate.
- Node.js 20 is approaching decommissioning on 2026-10-30. Upgrade the runtime and dependencies before that deadline.
- Do not put secrets in Functions source. The Admin SDK uses the deployed Firebase service identity and default project bucket.

## 6. Firebase App Check (optional hardening)

### What it does here

App Check can attach a reCAPTCHA Enterprise attestation token to Firebase client requests. It complements Auth and rules; it does not identify the user, replace ownership rules, or guarantee rate limiting.

### Where to read the code

- [`js/config.example.js`](../trademaster-web-v9-winner-fixes/js/config.example.js): `appCheckSiteKey` placeholder.
- [`js/firebase-service.js`](../trademaster-web-v9-winner-fixes/js/firebase-service.js): conditional SDK import and `initializeAppCheck()` call.
- [`js/app.js`](../trademaster-web-v9-winner-fixes/js/app.js): surfaces service readiness but does not implement a separate App Check UI.

### Configuration steps

1. Create/register a web reCAPTCHA Enterprise key for the intended Firebase app and authorized domains.
2. Put the site key in local `js/config.js` as `appCheckSiteKey`.
3. Run in monitoring mode first and inspect valid-client metrics.
4. Only then consider enabling enforcement for the required Firebase products.
5. Keep debug tokens limited to development/emulator use.

### Most useful code

```js
if (firebaseAppCheck && config.appCheckSiteKey && !String(config.appCheckSiteKey).includes('YOUR_')) {
  appCheck = initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(config.appCheckSiteKey),
    isTokenAutoRefreshEnabled: true,
  });
}
```

The integration is conditional so a missing site key does not block the normal web app. The current configuration and showcase evidence do not establish that App Check is active or enforced.

### Do not confuse these checks

| Mechanism | Protects | Used when |
| --- | --- | --- |
| Phone reCAPTCHA | The SMS sign-in request from automated abuse | A user chooses Phone sign-in |
| App Check | Requests from an untrusted/unregistered app instance | An App Check provider/site key is configured and enforcement is enabled |
| Auth | User identity and UID | A user signs in |
| Firestore/Storage rules | Whether that UID may access a path | Every client data request |

## Services intentionally outside the current Firebase web baseline

### Emulator Suite

The Emulator Suite is development/test tooling rather than an application data service. It is not configured here. Add Auth, Firestore and Storage emulators before claiming executable cross-account rules tests, trigger rehearsal or failure-path parity.

### Firebase Phone Number Verification (PNV)

PNV is not the same as web Phone SMS OTP. The current app uses Firebase's standard web `signInWithPhoneNumber()` flow. PNV is an Android/carrier-oriented proof flow that would require a separate backend to validate proof and issue/link a Firebase custom token. Do not describe the current web SMS path as SIM-less PNV.

## End-to-end setup checklist

For a fresh Firebase project, use this order:

1. Register the web app and copy the browser config into local `js/config.js`.
2. Enable Google and Phone Auth; set SMS regions/test numbers; add authorized HTTPS domains.
3. Create Firestore and deploy `firestore.rules`.
4. Create Storage on the required billing plan, copy the exact bucket name and deploy `storage.rules`.
5. Install and deploy Functions:

   ```bash
   npm install --prefix functions
   firebase deploy --only functions
   ```

6. Deploy Hosting only when the release includes the static site:

   ```bash
   firebase deploy --only hosting
   ```

7. Configure App Check only if the site key and enforcement rollout are deliberately in scope.
8. Start an HTTP server for UI work. The app still connects only to Firebase; use test accounts or the Firebase Emulator Suite for non-production rehearsal:

   ```bash
   python3 -m http.server 4173 --bind 127.0.0.1 --directory trademaster-web-v9-winner-fixes
   ```

9. Run the repository checks:

   ```bash
   cd trademaster-web-v9-winner-fixes
   npm test
   ```

10. Record separately whether the check was emulator-backed or live Firebase. Passing repository tests do not prove Console configuration, deployed rules, IAM, provider consent, App Check enforcement or event delivery.

For the manually maintained Console sequence, see [`docs/FIREBASE-CONSOLE-SETUP.md`](./FIREBASE-CONSOLE-SETUP.md). For the recorded boundaries, see [`docs/SHOWCASE-VERIFICATION.md`](./SHOWCASE-VERIFICATION.md).
