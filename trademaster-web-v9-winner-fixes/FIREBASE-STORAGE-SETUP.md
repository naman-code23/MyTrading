# Winner Screenshot Upload Setup

## 1) Pricing reality in 2026

Cloud Storage for Firebase now requires the **Blaze** plan to use Storage at all.

To keep usage effectively free for a personal app:
- use the exact `storageBucket` value from Firebase Console
- if this is a **new** bucket, choose a Google Cloud **Always Free** Storage region (`us-central1`, `us-east1`, or `us-west1`) when creating Storage
- keep screenshots compressed

## 2) Enable Storage

Firebase Console:
- Build -> Storage
- Get started
- choose a bucket location
- copy the exact bucket name shown in Console

## 3) Put the real bucket in `js/config.js`

```js
window.TRADEMASTER_CONFIG = {
  firebase: {
    apiKey: '...',
    authDomain: 'your-project.firebaseapp.com',
    projectId: 'your-project-id',
    storageBucket: 'your-bucket-from-firebase-console',
    messagingSenderId: '...',
    appId: '...'
  }
};
```

## 4) Deploy Storage rules

```bash
firebase deploy --only storage:rules
```

## 5) What the app does now

- Upload screenshot directly from Winner DB modal
- Resize and compress in browser before upload
- Save the Storage URL into the winner record
- Delete old screenshot when you replace or delete the winner entry

## 6) What counts toward usage

- stored image bytes
- upload operations
- downloads / page views of those images

## 7) Practical rule of thumb

If your compressed screenshots average around `200 KB` to `500 KB`, then `5000` images are usually around `1 GB` to `2.5 GB`, which is much easier to keep inside the common free storage allowance.
