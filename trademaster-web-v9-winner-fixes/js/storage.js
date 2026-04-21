import { createFirebaseService } from './firebase-service.js';

export const defaultSettings = {
  pnlMethod: 'AVERAGE',
  baseCurrency: 'INR',
  timezone: 'Asia/Kolkata',
};

const SETTINGS_KEY = 'tmpro_cloud_settings';
const TRADES_KEY = 'tmpro_cloud_trades';
const WINNERS_KEY = 'tmpro_cloud_winners';

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
  const tradeListeners = new Set();
  const winnerListeners = new Set();

  function getSettings() {
    return { ...defaultSettings, ...(readJson(SETTINGS_KEY, {}) || {}) };
  }

  function getTrades() {
    return readJson(TRADES_KEY, []) || [];
  }

  function getWinners() {
    return readJson(WINNERS_KEY, []) || [];
  }

  function emitTrades() {
    const trades = getTrades();
    tradeListeners.forEach((listener) => listener(trades));
  }

  function emitWinners() {
    const winners = getWinners();
    winnerListeners.forEach((listener) => listener(winners));
  }

  return {
    mode: 'demo',
    storageAvailable: false,
    async init() {
      return { user: null, settings: getSettings(), trades: getTrades(), winners: getWinners() };
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
      tradeListeners.add(callback);
      callback(getTrades());
      const onStorage = (event) => {
        if ([TRADES_KEY, SETTINGS_KEY].includes(event.key)) callback(getTrades());
      };
      window.addEventListener('storage', onStorage);
      return () => {
        tradeListeners.delete(callback);
        window.removeEventListener('storage', onStorage);
      };
    },
    subscribeWinners(callback) {
      winnerListeners.add(callback);
      callback(getWinners());
      const onStorage = (event) => {
        if ([WINNERS_KEY, SETTINGS_KEY].includes(event.key)) callback(getWinners());
      };
      window.addEventListener('storage', onStorage);
      return () => {
        winnerListeners.delete(callback);
        window.removeEventListener('storage', onStorage);
      };
    },
    async saveTrade(trade) {
      const trades = getTrades();
      const index = trades.findIndex((item) => item.id === trade.id);
      if (index >= 0) trades[index] = trade;
      else trades.unshift(trade);
      writeJson(TRADES_KEY, trades);
      emitTrades();
      return trade.id;
    },
    async saveTrades(items) {
      const existing = getTrades();
      const map = new Map(existing.map((item) => [item.id, item]));
      for (const trade of items || []) {
        map.set(trade.id, trade);
      }
      const next = [...map.values()].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      writeJson(TRADES_KEY, next);
      emitTrades();
      return next.map((item) => item.id);
    },
    async deleteTrade(tradeId) {
      const next = getTrades().filter((item) => item.id !== tradeId);
      writeJson(TRADES_KEY, next);
      emitTrades();
    },
    async saveWinner(entry) {
      const winners = getWinners();
      const index = winners.findIndex((item) => item.id === entry.id);
      if (index >= 0) winners[index] = entry;
      else winners.unshift(entry);
      writeJson(WINNERS_KEY, winners);
      emitWinners();
      return entry.id;
    },
    async saveWinners(items) {
      const existing = getWinners();
      const map = new Map(existing.map((item) => [item.id, item]));
      for (const entry of items || []) {
        map.set(entry.id, entry);
      }
      const next = [...map.values()].sort((a, b) => new Date(b.breakoutDate || b.createdAt || 0).getTime() - new Date(a.breakoutDate || a.createdAt || 0).getTime());
      writeJson(WINNERS_KEY, next);
      emitWinners();
      return next.map((item) => item.id);
    },
    async deleteWinner(entryId) {
      const next = getWinners().filter((item) => item.id !== entryId);
      writeJson(WINNERS_KEY, next);
      emitWinners();
    },
    async replaceAllData(payload) {
      if (payload.settings) writeJson(SETTINGS_KEY, { ...defaultSettings, ...payload.settings, timezone: 'Asia/Kolkata' });
      writeJson(TRADES_KEY, payload.trades || []);
      writeJson(WINNERS_KEY, payload.winners || []);
      emitTrades();
      emitWinners();
      return { settings: getSettings(), trades: getTrades(), winners: getWinners() };
    },
    async uploadWinnerImage() {
      throw new Error('Winner screenshot uploads need Firebase Storage in cloud mode.');
    },
    async deleteWinnerImage() {
      return null;
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

  async function getCurrentWinnersOnce() {
    if (!currentUser) return [];
    return await new Promise((resolve, reject) => {
      let unsubscribe = () => {};
      unsubscribe = firebase.subscribeWinners(
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
    async saveWinners(entries) {
      if (!currentUser) throw new Error('Sign in first to import winner database entries.');
      return firebase.saveWinners(currentUser.uid, entries || []);
    },
    async deleteWinner(entryId) {
      if (!currentUser) throw new Error('Sign in first to delete winner database entries.');
      await firebase.deleteWinner(currentUser.uid, entryId);
    },
    async replaceAllData(payload) {
      if (!currentUser) throw new Error('Sign in first to restore data from backup.');
      const [existingTrades, existingWinners] = await Promise.all([getCurrentTradesOnce(), getCurrentWinnersOnce()]);
      await Promise.all(existingTrades.map((trade) => firebase.deleteTrade(currentUser.uid, trade.id)));
      await Promise.all(existingWinners.map((entry) => firebase.deleteWinner(currentUser.uid, entry.id)));
      if (payload.settings) {
        await firebase.saveSettings(currentUser.uid, { ...defaultSettings, ...payload.settings, timezone: 'Asia/Kolkata' });
      }
      await firebase.saveTrades(currentUser.uid, payload.trades || []);
      await firebase.saveWinners(currentUser.uid, payload.winners || []);
      return { settings: await ensureSettings(), trades: await getCurrentTradesOnce(), winners: await getCurrentWinnersOnce() };
    },
    async uploadWinnerImage({ winnerId, blob, fileName, contentType }) {
      if (!currentUser) throw new Error('Sign in first to upload winner screenshots.');
      return firebase.uploadWinnerImage(currentUser.uid, winnerId, blob, { fileName, contentType });
    },
    async deleteWinnerImage(storagePath) {
      if (!currentUser || !storagePath) return null;
      return firebase.deleteWinnerImage(storagePath);
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
