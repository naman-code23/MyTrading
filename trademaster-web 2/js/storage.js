import { createFirebaseService } from './firebase-service.js';

export const defaultSettings = {
  pnlMethod: 'AVERAGE',
  baseCurrency: 'INR',
  timezone: 'Asia/Kolkata',
};

const SETTINGS_KEY = 'tmpro_cloud_settings';
const TRADES_KEY = 'tmpro_cloud_trades';

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function createDemoStorage() {
  const listeners = new Set();

  function getSettings() {
    return { ...defaultSettings, ...(readJson(SETTINGS_KEY, {}) || {}) };
  }

  function getTrades() {
    return readJson(TRADES_KEY, []) || [];
  }

  function emit() {
    const trades = getTrades();
    listeners.forEach((listener) => listener(trades));
  }

  return {
    mode: 'demo',
    async init() {
      return { user: null, settings: getSettings(), trades: getTrades() };
    },
    onAuthChanged() {
      return () => {};
    },
    async signIn() {
      throw new Error('Add Firebase config in js/config.js to enable Google sign-in and Firestore sync.');
    },
    async signOut() {
      return null;
    },
    async loadSettings() {
      return getSettings();
    },
    async saveSettings(settings) {
      const merged = { ...getSettings(), ...settings, timezone: 'Asia/Kolkata' };
      writeJson(SETTINGS_KEY, merged);
      return merged;
    },
    subscribeTrades(callback) {
      listeners.add(callback);
      callback(getTrades());
      const onStorage = (event) => {
        if ([TRADES_KEY, SETTINGS_KEY].includes(event.key)) callback(getTrades());
      };
      window.addEventListener('storage', onStorage);
      return () => {
        listeners.delete(callback);
        window.removeEventListener('storage', onStorage);
      };
    },
    async saveTrade(trade) {
      const trades = getTrades();
      const index = trades.findIndex((item) => item.id === trade.id);
      if (index >= 0) trades[index] = trade;
      else trades.unshift(trade);
      writeJson(TRADES_KEY, trades);
      emit();
      return trade.id;
    },
    async deleteTrade(tradeId) {
      const next = getTrades().filter((item) => item.id !== tradeId);
      writeJson(TRADES_KEY, next);
      emit();
    },
    async replaceAllData(payload) {
      if (payload.settings) writeJson(SETTINGS_KEY, { ...defaultSettings, ...payload.settings, timezone: 'Asia/Kolkata' });
      writeJson(TRADES_KEY, payload.trades || []);
      emit();
      return { settings: getSettings(), trades: getTrades() };
    },
    async backupToDrive() {
      throw new Error('Google Drive backup works after Firebase + Google auth are configured.');
    },
    async restoreFromDrive() {
      throw new Error('Google Drive restore works after Firebase + Google auth are configured.');
    },
  };
}

export async function createStorageLayer(firebaseConfig = {}) {
  const firebase = await createFirebaseService(firebaseConfig);
  if (!firebase.ready) return createDemoStorage();

  let currentUser = firebase.auth.currentUser || null;

  async function ensureSettings() {
    if (!currentUser) return { ...defaultSettings };
    const fromCloud = await firebase.ensureDefaultSettings(currentUser.uid);
    return { ...defaultSettings, ...(fromCloud || {}) };
  }

  async function getCurrentTradesOnce() {
    if (!currentUser) return [];
    return await new Promise((resolve, reject) => {
      let unsubscribe = () => {};
      unsubscribe = firebase.subscribeTrades(
        currentUser.uid,
        (items) => {
          unsubscribe();
          resolve(items);
        },
        (error) => {
          unsubscribe();
          reject(error);
        },
      );
    });
  }

  return {
    mode: 'cloud',
    async init() {
      const settings = await ensureSettings();
      return { user: currentUser, settings, trades: [] };
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
    async saveTrade(trade) {
      if (!currentUser) throw new Error('Sign in first to save trades to Firestore.');
      return firebase.saveTrade(currentUser.uid, trade);
    },
    async deleteTrade(tradeId) {
      if (!currentUser) throw new Error('Sign in first to delete trades.');
      await firebase.deleteTrade(currentUser.uid, tradeId);
    },
    async replaceAllData(payload) {
      if (!currentUser) throw new Error('Sign in first to restore data from backup.');
      const existing = await getCurrentTradesOnce();
      await Promise.all(existing.map((trade) => firebase.deleteTrade(currentUser.uid, trade.id)));
      if (payload.settings) {
        await firebase.saveSettings(currentUser.uid, { ...defaultSettings, ...payload.settings, timezone: 'Asia/Kolkata' });
      }
      for (const trade of payload.trades || []) {
        await firebase.saveTrade(currentUser.uid, trade);
      }
      return { settings: await ensureSettings(), trades: await getCurrentTradesOnce() };
    },
    async backupToDrive(payload) {
      if (!currentUser) throw new Error('Sign in first to use Drive backup.');
      return firebase.backupToDrive(currentUser, payload);
    },
    async restoreFromDrive() {
      if (!currentUser) throw new Error('Sign in first to restore from Drive.');
      return firebase.restoreFromDrive();
    },
  };
}
