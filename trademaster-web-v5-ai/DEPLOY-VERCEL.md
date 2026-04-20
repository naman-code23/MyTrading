# Vercel deploy checklist

## First deploy

1. Put the folder in a GitHub repo.
2. Import that repo into Vercel.
3. Keep framework preset as **Other**.
4. Leave the build command blank.
5. Deploy.
6. In Firebase Auth, add your production Vercel domain to **Authorized domains**.
7. Paste your Firebase web config into `js/config.js`.
8. Push once more if you edited the config locally.

## Every future change

```bash
git add -A
git commit -m "Your change"
git push
```

Vercel redeploys automatically.

## Preview deploy note

Preview links are different domains. On free Vercel, Google sign-in may fail on those preview links unless that exact preview domain is authorized in Firebase.

Use the main production Vercel URL for normal app usage.
