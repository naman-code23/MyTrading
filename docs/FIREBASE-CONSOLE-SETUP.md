# Firebase console setup checklist

The v9 web app is ready for the following manual Firebase setup. Use a dedicated test project and controlled test accounts/data.

1. **Register the web app** in Project settings and copy its config into `trademaster-web-v9-winner-fixes/js/config.js`.
2. **Authentication → Sign-in method:** enable Google and Phone. Then open **Authentication → Settings → SMS region policy** and allow the countries you will test (for example, India). New projects may start with no SMS regions allowed. Phone auth is Firebase's standard SMS flow and requires an authorized hosted domain plus reCAPTCHA; it is not SIM-less or carrier-backed PNV.
   - For rehearsal without sending SMS, expand **Phone numbers for testing** under the Phone provider and add a fictional number plus a six-digit code. Use it only in the test project; Firebase recommends fictional numbers for development and allows up to 10 per project.
3. **Firestore Database:** create the database, then deploy `firestore.rules` from the v9 folder.
4. **Storage:** create the default bucket, then deploy `storage.rules`. Winner screenshots are written below the signed-in user's own path.
5. **Cloud Functions:** from `trademaster-web-v9-winner-fixes`, run `npm install --prefix functions` and deploy with `firebase deploy --only functions`. The deployed triggers clean obsolete Winner screenshot objects after a Winner delete or `imageStoragePath` replacement. This is at-least-once background processing; a missing object is treated as success.
6. **Hosting:** from `trademaster-web-v9-winner-fixes`, run `firebase use --add` and `firebase deploy --only hosting,firestore,storage,functions`. Add the resulting Hosting domain to Firebase Authentication → Settings → Authorized domains.
7. **Optional App Check:** create a reCAPTCHA Enterprise web key, put it in `appCheckSiteKey` in `js/config.js`, test in monitoring mode, and only then consider enforcement. App Check complements Auth and Firestore/Storage rules; it does not replace them.
The v9 app is cloud-only: complete the browser configuration and Firebase setup before opening the product. Do not enable production PNV or build its Android/Functions branch until a real supported device, carrier and project configuration have been confirmed with the PNV team.
