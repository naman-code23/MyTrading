# TradeMaster Pro Cloud

This version keeps the spirit of your original `TradeMasterPro.html` — calculator, MBI, sell check, and journal — but upgrades the journal into a multi-leg web app with Google sign-in and Firestore sync. The original single-file app centered those trading tools in one interface, and this project keeps that direction while moving storage out of `localStorage` into a real cloud setup when Firebase is configured. 

## What is in this folder

- `index.html` — app shell
- `styles.css` — dark UI styling
- `js/app.js` — main UI/controller logic
- `js/utils.js` — shared helpers
- `js/trade-engine.js` — multi-leg journal math, FIFO/average P&L, analytics helpers
- `js/calc.js` — calculator engine
- `js/mbi.js` — MBI and sell-check logic
- `js/charts.js` — chart rendering wrappers
- `js/storage.js` — demo/local mode vs cloud storage layer
- `js/firebase-service.js` — Firebase Auth / Firestore / Drive integration
- `js/config.js` — Firebase config placeholder
- `js/config.example.js` — config template
- `firestore.rules` — Firestore security rules
- `firebase.json` — optional Firebase Hosting config
- `vercel.json` — Vercel config for zero-build static deploy

## Best deployment choice for you

For the easiest workflow, use **GitHub + Vercel**:

- put this folder in a GitHub repository
- import that repo into Vercel
- every push to `main` redeploys automatically
- every other branch can get a preview deploy

Because this is a plain HTML/CSS/client-side JavaScript app, Vercel does not need a build step for it.

## Important Firebase auth caveat on Vercel

Google sign-in with Firebase Auth only works from domains allowed in Firebase Authentication.

That means:

- add your stable production domain like `your-project.vercel.app` to Firebase Auth **Authorized domains**
- if you later attach a custom domain, add that too
- preview deploy URLs on free Vercel are separate domains, so Google sign-in can fail on preview links unless that preview domain is also authorized

For day-to-day use, this is easy: use the production Vercel URL for the real app, and treat preview links mainly as UI previews.

## Quick deploy on Vercel

### 1. Create a GitHub repo

Inside the project folder:

```bash
git init
git add .
git commit -m "Initial TradeMaster deploy"
```

Create an empty repo on GitHub, then:

```bash
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/trademaster-web.git
git push -u origin main
```

### 2. Import into Vercel

In Vercel:

1. Click **New Project**
2. Select the GitHub repo
3. Framework preset: **Other**
4. Build command: **leave blank**
5. Output directory: **leave blank** (root)
6. Deploy

That is enough for the static site to go live.

### 3. Set up Firebase

In Firebase:

1. Create or open your Firebase project
2. Add a **Web app**
3. Enable **Authentication > Google**
4. Create **Cloud Firestore**
5. Copy your Firebase web config into `js/config.js`
6. Add your Vercel production domain to **Authentication > Settings > Authorized domains**

Example `js/config.js`:

```js
window.TRADEMASTER_CONFIG = {
  firebase: {
    apiKey: 'YOUR_API_KEY',
    authDomain: 'YOUR_PROJECT.firebaseapp.com',
    projectId: 'YOUR_PROJECT_ID',
    storageBucket: 'YOUR_PROJECT.firebasestorage.app',
    messagingSenderId: 'YOUR_MESSAGING_SENDER_ID',
    appId: 'YOUR_APP_ID'
  }
};
```

If you want the auth domain itself to match your live site later, you can switch to a custom auth domain setup in Firebase after connecting a custom domain.

## Future code changes

After the first deploy, you do **not** upload the whole folder manually anymore.

You just change files locally and push:

```bash
git add -A
git commit -m "Improve journal filters"
git push
```

Vercel will redeploy automatically.

You can also edit files directly in the GitHub web UI and commit there; Vercel will still redeploy automatically.

## Local demo mode

If `js/config.js` still has placeholder values, the app falls back to demo mode using `localStorage`.

To run locally:

```bash
python3 -m http.server 4173
```

Then open:

```text
http://localhost:4173
```

## Google Drive backup

Drive backup is optional and only meant for backup/export.
Firestore remains the main database.

If you want Drive backup:

- enable the Google Drive API in your Google Cloud project
- keep using Google sign-in
- the app asks for `drive.appdata` only when backup/restore is used

## Notes on Firebase config in Git

The Firebase **web** config is normally okay to keep in client-side code. Security comes from Firestore Security Rules and Auth, not from hiding the web config itself.

Still, keep your rules strict and review API restrictions in Firebase/Google Cloud if needed.
