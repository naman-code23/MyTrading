export const WINNER_DOCUMENT_PATH = 'users/{userId}/winners/{winnerId}';

function normalizeStoragePath(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function hasUnsafePathSegment(storagePath) {
  return storagePath.split('/').some((segment) => (
    !segment
    || segment === '.'
    || segment === '..'
    || /[\u0000-\u001f\u007f]/.test(segment)
  ));
}

export function isOwnedWinnerImagePath(storagePath, userId, winnerId) {
  const normalized = normalizeStoragePath(storagePath);
  const prefix = `users/${userId}/winner-images/${winnerId}/`;
  return Boolean(
    normalized
    && normalized.startsWith(prefix)
    && normalized.length > prefix.length
    && !hasUnsafePathSegment(normalized),
  );
}

export function getObsoleteWinnerImageDecision({ before, after, userId, winnerId }) {
  const previousPath = normalizeStoragePath(before?.imageStoragePath);
  const nextPath = normalizeStoragePath(after?.imageStoragePath);

  if (!previousPath) return { path: '', reason: 'no-previous-reference' };
  if (after != null && previousPath === nextPath) return { path: '', reason: 'reference-unchanged' };
  if (!isOwnedWinnerImagePath(previousPath, userId, winnerId)) return { path: '', reason: 'unsafe-path' };

  return {
    path: previousPath,
    reason: after == null ? 'winner-deleted' : 'reference-changed',
  };
}

function isMissingStorageObject(error) {
  return error?.code === 404
    || error?.code === '404'
    || error?.code === 'storage/object-not-found';
}

/**
 * Deletes only the Storage object that was previously referenced by a Winner.
 * Storage deletion is intentionally idempotent because Firestore triggers retry.
 */
export async function cleanupObsoleteWinnerImage({
  before,
  after,
  userId,
  winnerId,
  bucket,
  logger = console,
  isCurrentlyReferenced,
}) {
  const decision = getObsoleteWinnerImageDecision({ before, after, userId, winnerId });
  if (!decision.path) {
    if (decision.reason === 'unsafe-path') {
      logger?.warn?.('Skipped Winner screenshot cleanup for an invalid owner path.', { userId, winnerId });
    }
    return { ...decision, deleted: false };
  }
  if (!bucket || typeof bucket.file !== 'function') {
    throw new Error('Cloud Storage bucket is required for Winner screenshot cleanup.');
  }
  if (typeof isCurrentlyReferenced === 'function' && await isCurrentlyReferenced(decision.path)) {
    return { ...decision, deleted: false, reason: 'reference-still-current' };
  }

  try {
    await bucket.file(decision.path).delete({ ignoreNotFound: true });
    return { ...decision, deleted: true, alreadyMissing: false };
  } catch (error) {
    if (isMissingStorageObject(error)) {
      return { ...decision, deleted: true, alreadyMissing: true };
    }
    logger?.error?.('Winner screenshot cleanup failed.', { userId, winnerId, reason: decision.reason });
    throw error;
  }
}
