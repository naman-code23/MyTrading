import { createFirebaseService } from './firebase-service.js';

export const defaultSettings = {
  pnlMethod: 'AVERAGE',
  baseCurrency: 'INR',
  timezone: 'Asia/Kolkata',
  capital: 2800000,
  riskPercent: 0.4,
};

export async function createStorageLayer(firebaseConfig = {}) {
  const firebase = await createFirebaseService(firebaseConfig);
  if (!firebase.ready) {
    throw new Error(firebase.reason || 'Firebase could not be initialized.');
  }

  let currentUser = firebase.auth.currentUser || null;

  async function ensureSettings() {
    if (!currentUser) return { ...defaultSettings };
    const fromCloud = await firebase.ensureDefaultSettings(currentUser.uid);
    return { ...defaultSettings, ...(fromCloud || {}) };
  }

  return {
    storageAvailable: Boolean(firebase.storageReady),
    async init() {
      const settings = await ensureSettings();
      return { user: currentUser, settings, trades: [], winners: [] };
    },
    onAuthChanged(callback) {
      return firebase.onAuthStateChanged(async (user) => {
        currentUser = user;
        if (currentUser) await firebase.ensureDefaultSettings(currentUser.uid);
        callback(user);
      });
    },
    async signIn() {
      currentUser = await firebase.signIn();
      return currentUser;
    },
    async requestPhoneCode(phoneNumber, recaptchaContainerId) {
      return firebase.requestPhoneCode(phoneNumber, recaptchaContainerId);
    },
    async confirmPhoneCode(code) {
      currentUser = await firebase.confirmPhoneCode(code);
      return currentUser;
    },
    cancelPhoneAuth() {
      firebase.cancelPhoneAuth();
    },
    async signOut() {
      await firebase.signOut();
      currentUser = null;
      return null;
    },
    async loadSettings() {
      return ensureSettings();
    },
    async saveSettings(settings) {
      if (!currentUser) throw new Error('Sign in first to save settings in Firestore.');
      const merged = { ...(await ensureSettings()), ...settings, timezone: 'Asia/Kolkata' };
      await firebase.saveSettings(currentUser.uid, merged);
      return merged;
    },
    subscribeTrades(callback, onError) {
      if (!currentUser) {
        callback([]);
        return () => {};
      }
      return firebase.subscribeTrades(currentUser.uid, callback, onError);
    },
    subscribeWinners(callback, onError) {
      if (!currentUser) {
        callback([]);
        return () => {};
      }
      return firebase.subscribeWinners(currentUser.uid, callback, onError);
    },
    async saveTrade(trade) {
      if (!currentUser) throw new Error('Sign in first to save trades to Firestore.');
      return firebase.saveTrade(currentUser.uid, trade);
    },
    async saveTrades(trades) {
      if (!currentUser) throw new Error('Sign in first to import trades.');
      return firebase.saveTrades(currentUser.uid, trades || []);
    },
    async deleteTrade(tradeId) {
      if (!currentUser) throw new Error('Sign in first to delete trades.');
      await firebase.deleteTrade(currentUser.uid, tradeId);
    },
    async saveWinner(entry) {
      if (!currentUser) throw new Error('Sign in first to save winner database entries.');
      return firebase.saveWinner(currentUser.uid, entry);
    },
    async createWinnerIfAbsent(entry) {
      if (!currentUser) throw new Error('Sign in first to save winner database entries.');
      return firebase.createWinnerIfAbsent(currentUser.uid, entry);
    },
    async getWinner(entryId) {
      if (!currentUser) return null;
      return firebase.getWinner(currentUser.uid, entryId);
    },
    async saveWinners(entries) {
      if (!currentUser) throw new Error('Sign in first to import winner database entries.');
      return firebase.saveWinners(currentUser.uid, entries || []);
    },
    async deleteWinner(entryId) {
      if (!currentUser) throw new Error('Sign in first to delete winner database entries.');
      await firebase.deleteWinner(currentUser.uid, entryId);
    },
    async uploadWinnerImage({ winnerId, blob, fileName, contentType }) {
      if (!currentUser) throw new Error('Sign in first to upload winner screenshots.');
      return firebase.uploadWinnerImage(currentUser.uid, winnerId, blob, { fileName, contentType });
    },
    async deleteWinnerImage(storagePath) {
      if (!currentUser || !storagePath) return null;
      return firebase.deleteWinnerImage(storagePath);
    },
  };
}
