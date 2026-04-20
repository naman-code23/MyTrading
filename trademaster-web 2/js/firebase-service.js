import { uid } from './utils.js';

function hasUsableFirebaseConfig(config) {
  return Boolean(
    config
      && config.apiKey
      && !String(config.apiKey).includes('YOUR_')
      && config.authDomain
      && config.projectId,
  );
}

export async function createFirebaseService(config) {
  if (!hasUsableFirebaseConfig(config)) {
    return { ready: false, reason: 'Missing Firebase config.' };
  }

  const [
    firebaseApp,
    firebaseAuth,
    firebaseFirestore,
  ] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js'),
  ]);

  const { initializeApp } = firebaseApp;
  const {
    getAuth,
    GoogleAuthProvider,
    browserLocalPersistence,
    setPersistence,
    onAuthStateChanged,
    signInWithPopup,
    signOut,
  } = firebaseAuth;
  const {
    getFirestore,
    collection,
    doc,
    getDoc,
    setDoc,
    deleteDoc,
    query,
    orderBy,
    onSnapshot,
    serverTimestamp,
  } = firebaseFirestore;

  const app = initializeApp(config);
  const auth = getAuth(app);
  const db = getFirestore(app);
  await setPersistence(auth, browserLocalPersistence);

  function tradeCollection(uid) {
    return collection(db, 'users', uid, 'trades');
  }

  function settingsDoc(uid) {
    return doc(db, 'users', uid, 'meta', 'settings');
  }

  function profileDoc(uid) {
    return doc(db, 'users', uid);
  }

  async function upsertProfile(user) {
    await setDoc(
      profileDoc(user.uid),
      {
        displayName: user.displayName || '',
        email: user.email || '',
        photoURL: user.photoURL || '',
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      },
      { merge: true },
    );
  }

  return {
    ready: true,
    auth,
    db,
    onAuthStateChanged(callback) {
      return onAuthStateChanged(auth, callback);
    },
    async signIn() {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await signInWithPopup(auth, provider);
      await upsertProfile(result.user);
      return result.user;
    },
    async signOut() {
      await signOut(auth);
    },
    async ensureDefaultSettings(userId) {
      const reference = settingsDoc(userId);
      const snapshot = await getDoc(reference);
      if (!snapshot.exists()) {
        await setDoc(reference, {
          pnlMethod: 'AVERAGE',
          baseCurrency: 'INR',
          timezone: 'Asia/Kolkata',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      const latest = await getDoc(reference);
      return latest.exists() ? latest.data() : null;
    },
    async saveSettings(userId, settings) {
      await setDoc(
        settingsDoc(userId),
        {
          ...settings,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    },
    async loadSettings(userId) {
      const snapshot = await getDoc(settingsDoc(userId));
      return snapshot.exists() ? snapshot.data() : null;
    },
    subscribeTrades(userId, callback, onError) {
      const q = query(tradeCollection(userId), orderBy('createdAt', 'desc'));
      return onSnapshot(
        q,
        (snapshot) => {
          const items = snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
            createdAt: item.data().createdAt?.toDate?.()?.toISOString() || item.data().createdAt || null,
            updatedAt: item.data().updatedAt?.toDate?.()?.toISOString() || item.data().updatedAt || null,
          }));
          callback(items);
        },
        (error) => {
          console.error(error);
          onError?.(error);
        },
      );
    },
    async saveTrade(userId, trade) {
      const id = trade.id || uid('trade');
      const reference = doc(db, 'users', userId, 'trades', id);
      const existing = await getDoc(reference);
      await setDoc(
        reference,
        {
          ...trade,
          id,
          createdAt: existing.exists() ? existing.data().createdAt || serverTimestamp() : serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      return id;
    },
    async deleteTrade(userId, tradeId) {
      await deleteDoc(doc(db, 'users', userId, 'trades', tradeId));
    },
    async backupToDrive(user, payload) {
      const provider = new GoogleAuthProvider();
      provider.addScope('https://www.googleapis.com/auth/drive.appdata');
      provider.setCustomParameters({ prompt: 'consent' });
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const accessToken = credential?.accessToken;
      if (!accessToken) throw new Error('Could not get Google Drive access token.');

      const filename = 'trademasterpro-backup.json';
      const metadata = {
        name: filename,
        parents: ['appDataFolder'],
        mimeType: 'application/json',
      };
      const listUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`name='${filename}' and 'appDataFolder' in parents and trashed=false`)}&spaces=appDataFolder&fields=files(id,name,modifiedTime)`;
      const listResponse = await fetch(listUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!listResponse.ok) throw new Error('Failed to inspect Google Drive backup files.');
      const listData = await listResponse.json();
      const existing = listData.files?.[0];

      if (existing?.id) {
        const updateResponse = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=media`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload, null, 2),
        });
        if (!updateResponse.ok) throw new Error('Failed to update Google Drive backup.');
        return { fileId: existing.id, updated: true };
      }

      const boundary = 'tradeMasterBoundary';
      const multipartBody =
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(payload, null, 2)}\r\n` +
        `--${boundary}--`;

      const createResponse = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: multipartBody,
      });
      if (!createResponse.ok) throw new Error('Failed to create Google Drive backup.');
      const createData = await createResponse.json();
      return { fileId: createData.id, updated: false };
    },
    async restoreFromDrive() {
      const provider = new GoogleAuthProvider();
      provider.addScope('https://www.googleapis.com/auth/drive.appdata');
      provider.setCustomParameters({ prompt: 'consent' });
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const accessToken = credential?.accessToken;
      if (!accessToken) throw new Error('Could not get Google Drive access token.');
      const filename = 'trademasterpro-backup.json';
      const listUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`name='${filename}' and 'appDataFolder' in parents and trashed=false`)}&spaces=appDataFolder&fields=files(id,name,modifiedTime)`;
      const listResponse = await fetch(listUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!listResponse.ok) throw new Error('Failed to inspect Google Drive backup files.');
      const listData = await listResponse.json();
      const existing = listData.files?.[0];
      if (!existing?.id) throw new Error('No backup file found in Google Drive appDataFolder.');
      const dataResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${existing.id}?alt=media`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!dataResponse.ok) throw new Error('Failed to download backup file from Google Drive.');
      return await dataResponse.json();
    },
  };
}
