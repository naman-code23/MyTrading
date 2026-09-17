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
  if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
    return {
      ready: false,
      reason: 'Firebase needs an HTTP(S) URL; file:// pages cannot run phone auth.',
    };
  }
  if (!hasUsableFirebaseConfig(config)) {
    return { ready: false, reason: 'Missing Firebase config.' };
  }

  const [
    firebaseApp,
    firebaseAuth,
    firebaseFirestore,
    firebaseStorage,
    firebaseAppCheck,
  ] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js'),
    import('https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js'),
    config.appCheckSiteKey && !String(config.appCheckSiteKey).includes('YOUR_')
      ? import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-check.js')
      : Promise.resolve(null),
  ]);

  const { initializeApp } = firebaseApp;
  const {
    getStorage,
    ref: storageRef,
    uploadBytes,
    getDownloadURL,
    deleteObject,
  } = firebaseStorage;
  const {
    getAuth,
    GoogleAuthProvider,
    browserLocalPersistence,
    setPersistence,
    onAuthStateChanged,
    signInWithPopup,
    signInWithPhoneNumber,
    linkWithPhoneNumber,
    RecaptchaVerifier,
    signOut,
  } = firebaseAuth;
  const { initializeAppCheck, ReCaptchaEnterpriseProvider } = firebaseAppCheck || {};
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
    writeBatch,
    runTransaction,
  } = firebaseFirestore;

  const app = initializeApp(config);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const bucketValue = String(config.storageBucket || '').trim();
  const storageReady = Boolean(bucketValue && !bucketValue.includes('YOUR_'));
  const storage = storageReady
    ? getStorage(app, bucketValue.startsWith('gs://') ? bucketValue : `gs://${bucketValue}`)
    : null;
  let appCheck = null;
  if (firebaseAppCheck && config.appCheckSiteKey && !String(config.appCheckSiteKey).includes('YOUR_')) {
    try {
      appCheck = initializeAppCheck(app, {
        provider: new ReCaptchaEnterpriseProvider(config.appCheckSiteKey),
        isTokenAutoRefreshEnabled: true,
      });
    } catch (error) {
      console.warn('Firebase App Check could not be initialized.', error);
    }
  }
  await setPersistence(auth, browserLocalPersistence);
  let phoneConfirmation = null;
  let phoneRecaptcha = null;
  function resetPhoneRecaptcha() {
    phoneRecaptcha?.clear?.();
    phoneRecaptcha = null;
  }

  function getPhoneRecaptcha(containerId) {
    resetPhoneRecaptcha();
    phoneRecaptcha = new RecaptchaVerifier(auth, containerId, {
      size: 'normal',
      'expired-callback': () => { phoneConfirmation = null; },
    });
    return phoneRecaptcha;
  }

  function tradeCollection(userId) {
    return collection(db, 'users', userId, 'trades');
  }

  function winnerCollection(userId) {
    return collection(db, 'users', userId, 'winners');
  }

  function settingsDoc(userId) {
    return doc(db, 'users', userId, 'meta', 'settings');
  }

  function profileDoc(userId) {
    return doc(db, 'users', userId);
  }

  async function upsertProfile(user) {
    const existing = await getDoc(profileDoc(user.uid));
    await setDoc(
      profileDoc(user.uid),
      {
        displayName: user.displayName || '',
        email: user.email || '',
        photoURL: user.photoURL || '',
        updatedAt: serverTimestamp(),
        createdAt: existing.exists() ? existing.data().createdAt || serverTimestamp() : serverTimestamp(),
      },
      { merge: true },
    );
  }

  async function saveDocs(userId, collectionName, items = []) {
    const chunkSize = 400;
    for (let start = 0; start < items.length; start += chunkSize) {
      const batch = writeBatch(db);
      const chunk = items.slice(start, start + chunkSize);
      for (const item of chunk) {
        const id = item.id || uid(collectionName === 'trades' ? 'trade' : 'winner');
        const reference = doc(db, 'users', userId, collectionName, id);
        batch.set(
          reference,
          {
            ...item,
            id,
            createdAt: item.createdAt || serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
      }
      await batch.commit();
    }
    return items.map((item) => item.id);
  }

  function sanitizeFilename(name = 'winner-image.webp') {
    return String(name)
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      || 'winner-image.webp';
  }

  function buildWinnerImagePath(userId, winnerId, fileName) {
    return `users/${userId}/winner-images/${winnerId}/${Date.now()}-${sanitizeFilename(fileName)}`;
  }

  function subscribeCollection(collectionRef, callback, onError) {
    const q = query(collectionRef, orderBy('createdAt', 'desc'));
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
  }

  function deserializeDocument(snapshot) {
    const data = snapshot.data();
    return {
      id: snapshot.id,
      ...data,
      createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt || null,
      updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt || null,
    };
  }

  return {
    ready: true,
    storageReady,
    appCheckReady: Boolean(appCheck),
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
    async requestPhoneCode(phoneNumber, recaptchaContainerId = 'phoneRecaptcha') {
      const normalized = String(phoneNumber || '').trim();
      if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
        throw new Error('Enter a valid phone number with country code, for example +919876543210.');
      }
      const verifier = getPhoneRecaptcha(recaptchaContainerId);
      phoneConfirmation = auth.currentUser
        ? await linkWithPhoneNumber(auth.currentUser, normalized, verifier)
        : await signInWithPhoneNumber(auth, normalized, verifier);
      return { linking: Boolean(auth.currentUser) };
    },
    async confirmPhoneCode(code) {
      if (!phoneConfirmation) throw new Error('Request a verification code first.');
      const normalized = String(code || '').trim();
      if (!/^\d{6}$/.test(normalized)) throw new Error('Enter the 6-digit verification code.');
      const result = await phoneConfirmation.confirm(normalized);
      phoneConfirmation = null;
      resetPhoneRecaptcha();
      await upsertProfile(result.user);
      return result.user;
    },
    cancelPhoneAuth() {
      phoneConfirmation = null;
      resetPhoneRecaptcha();
    },
    async ensureDefaultSettings(userId) {
      const reference = settingsDoc(userId);
      const snapshot = await getDoc(reference);
      if (!snapshot.exists()) {
        await setDoc(reference, {
          pnlMethod: 'AVERAGE',
          baseCurrency: 'INR',
          timezone: 'Asia/Kolkata',
          capital: 2800000,
          riskPercent: 0.4,
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
      return subscribeCollection(tradeCollection(userId), callback, onError);
    },
    subscribeWinners(userId, callback, onError) {
      return subscribeCollection(winnerCollection(userId), callback, onError);
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
    async saveTrades(userId, trades) {
      return saveDocs(userId, 'trades', trades || []);
    },
    async deleteTrade(userId, tradeId) {
      await deleteDoc(doc(db, 'users', userId, 'trades', tradeId));
    },
    async saveWinner(userId, entry) {
      const id = entry.id || uid('winner');
      const reference = doc(db, 'users', userId, 'winners', id);
      const existing = await getDoc(reference);
      await setDoc(
        reference,
        {
          ...entry,
          id,
          createdAt: existing.exists() ? existing.data().createdAt || serverTimestamp() : serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      return id;
    },
    async createWinnerIfAbsent(userId, entry) {
      const id = entry.id || uid('winner');
      const reference = doc(db, 'users', userId, 'winners', id);
      return runTransaction(db, async (transaction) => {
        const existing = await transaction.get(reference);
        if (existing.exists()) return { created: false, entry: deserializeDocument(existing) };
        transaction.set(reference, {
          ...entry,
          id,
          createdAt: entry.createdAt || serverTimestamp(),
          updatedAt: serverTimestamp(),
        }, { merge: false });
        return { created: true, entry: { ...entry, id } };
      });
    },
    async getWinner(userId, entryId) {
      if (!entryId) return null;
      const snapshot = await getDoc(doc(db, 'users', userId, 'winners', entryId));
      return snapshot.exists() ? deserializeDocument(snapshot) : null;
    },
    async saveWinners(userId, entries) {
      return saveDocs(userId, 'winners', entries || []);
    },
    async deleteWinner(userId, entryId) {
      await deleteDoc(doc(db, 'users', userId, 'winners', entryId));
    },
    async uploadWinnerImage(userId, winnerId, fileBlob, options = {}) {
      if (!storageReady || !storage) {
        throw new Error('Firebase Storage is not configured. Add the exact storageBucket from Firebase Console, then enable Storage on a Blaze project.');
      }
      const storagePath = buildWinnerImagePath(userId, winnerId, options.fileName || fileBlob?.name || 'winner-image.webp');
      const reference = storageRef(storage, storagePath);
      const metadata = {
        contentType: options.contentType || fileBlob?.type || 'image/webp',
        cacheControl: 'public,max-age=31536000,immutable',
      };
      await uploadBytes(reference, fileBlob, metadata);
      const downloadUrl = await getDownloadURL(reference);
      return {
        storagePath,
        downloadUrl,
        sizeBytes: Number(fileBlob?.size || 0),
        contentType: metadata.contentType,
      };
    },
    async deleteWinnerImage(storagePath) {
      if (!storageReady || !storage || !storagePath) return;
      try {
        await deleteObject(storageRef(storage, storagePath));
      } catch (error) {
        if (error?.code !== 'storage/object-not-found') throw error;
      }
    },
  };
}
