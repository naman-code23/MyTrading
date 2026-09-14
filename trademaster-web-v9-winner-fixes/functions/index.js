import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import logger from 'firebase-functions/logger';
import { onDocumentDeleted, onDocumentUpdated } from 'firebase-functions/v2/firestore';

import { cleanupObsoleteWinnerImage, WINNER_DOCUMENT_PATH } from './image-cleanup.js';

initializeApp();
let defaultBucket;

function getDefaultBucket() {
  defaultBucket ||= getStorage().bucket();
  return defaultBucket;
}

async function isWinnerImageCurrentlyReferenced(userId, winnerId, storagePath) {
  const snapshot = await getFirestore().doc(`users/${userId}/winners/${winnerId}`).get();
  return snapshot.exists && String(snapshot.data()?.imageStoragePath || '').trim() === storagePath;
}

export const cleanupWinnerImageOnDelete = onDocumentDeleted(
  WINNER_DOCUMENT_PATH,
  async (event) => {
    const before = event.data?.data();
    if (!before) return { deleted: false, reason: 'missing-before' };
    return cleanupObsoleteWinnerImage({
      before,
      after: null,
      userId: event.params.userId,
      winnerId: event.params.winnerId,
      bucket: getDefaultBucket(),
      logger,
      isCurrentlyReferenced: (storagePath) => isWinnerImageCurrentlyReferenced(
        event.params.userId,
        event.params.winnerId,
        storagePath,
      ),
    });
  },
);

export const cleanupWinnerImageOnUpdate = onDocumentUpdated(
  WINNER_DOCUMENT_PATH,
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return { deleted: false, reason: 'missing-snapshot' };
    return cleanupObsoleteWinnerImage({
      before,
      after,
      userId: event.params.userId,
      winnerId: event.params.winnerId,
      bucket: getDefaultBucket(),
      logger,
      isCurrentlyReferenced: (storagePath) => isWinnerImageCurrentlyReferenced(
        event.params.userId,
        event.params.winnerId,
        storagePath,
      ),
    });
  },
);
