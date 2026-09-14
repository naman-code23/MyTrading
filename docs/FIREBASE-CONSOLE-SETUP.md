# Firebase console setup checklist

The v9 web app is ready for the following manual Firebase setup. Use a dedicated demo project and synthetic journal data.

1. **Register the web app** in Project settings and copy its config into `trademaster-web-v9-winner-fixes/js/config.js`.
2. **Authentication → Sign-in method:** enable Google and Phone. Then open **Authentication → Settings → SMS region policy** and allow the countries you will test (for example, India). New projects may start with no SMS regions allowed. Phone auth is Firebase's standard SMS flow and requires an authorized hosted domain plus reCAPTCHA; it is not SIM-less or carrier-backed PNV.
   - For rehearsal without sending SMS, expand **Phone numbers for testing** under the Phone provider and add a fictional number plus a six-digit code. Use it only in the demo project; Firebase recommends fictional numbers for development and allows up to 10 per project.
3. **Optional X/Twitter:** enable the Twitter provider, create the provider's API key/secret, and register the Firebase OAuth callback shown by the console with the provider. Add the deployed Hosting domain to the provider's allowlist. Keep the secret in the console, never in this repository.
4. **Firestore Database:** create the database, then deploy `firestore.rules` from the v9 folder.
5. **Storage:** create the default bucket, then deploy `storage.rules`. Winner screenshots are written below the signed-in user's own path.
6. **Hosting:** from `trademaster-web-v9-winner-fixes`, run `firebase use --add` and `firebase deploy --only hosting,firestore,storage`. Add the resulting Hosting domain to Firebase Authentication → Settings → Authorized domains.
7. **Optional App Check:** create a reCAPTCHA Enterprise web key, put it in `appCheckSiteKey` in `js/config.js`, test in monitoring mode, and only then consider enforcement. App Check complements Auth and Firestore/Storage rules; it does not replace them.
8. **Drive backup (optional):** enable the Google Drive API and approve the requested Drive scope when using the backup buttons.

The app can stay in local demo mode until the config is complete. Do not enable production PNV or build its Android/Functions branch until a real supported device, carrier and project configuration have been confirmed with the PNV team.
