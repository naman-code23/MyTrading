import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  WINNER_DOCUMENT_PATH,
  cleanupObsoleteWinnerImage,
  isOwnedWinnerImagePath,
} from '../functions/image-cleanup.js';

const userId = 'user-123';
const winnerId = 'winner-456';
const oldPath = `users/${userId}/winner-images/${winnerId}/old.webp`;
const newPath = `users/${userId}/winner-images/${winnerId}/new.webp`;

function fakeBucket({ deleteError } = {}) {
  const deleted = [];
  return {
    deleted,
    file(storagePath) {
      return {
        async delete(options) {
          deleted.push({ storagePath, options });
          if (deleteError) throw deleteError;
        },
      };
    },
  };
}

test('the trigger path is scoped to per-user Winner documents', () => {
  assert.equal(WINNER_DOCUMENT_PATH, 'users/{userId}/winners/{winnerId}');
});

test('a deleted Winner removes its previously referenced Storage object', async () => {
  const bucket = fakeBucket();

  const result = await cleanupObsoleteWinnerImage({
    before: { imageStoragePath: oldPath },
    after: null,
    userId,
    winnerId,
    bucket,
  });

  assert.equal(result.reason, 'winner-deleted');
  assert.equal(result.deleted, true);
  assert.deepEqual(bucket.deleted, [{ storagePath: oldPath, options: { ignoreNotFound: true } }]);
});

test('a changed or removed reference removes only the old object', async () => {
  const bucket = fakeBucket();

  const changed = await cleanupObsoleteWinnerImage({
    before: { imageStoragePath: oldPath },
    after: { imageStoragePath: newPath },
    userId,
    winnerId,
    bucket,
  });
  const removed = await cleanupObsoleteWinnerImage({
    before: { imageStoragePath: newPath },
    after: { imageStoragePath: '' },
    userId,
    winnerId,
    bucket,
  });

  assert.equal(changed.reason, 'reference-changed');
  assert.equal(removed.reason, 'reference-changed');
  assert.deepEqual(bucket.deleted.map((entry) => entry.storagePath), [oldPath, newPath]);
});

test('unchanged references do not delete a live screenshot', async () => {
  const bucket = fakeBucket();

  const result = await cleanupObsoleteWinnerImage({
    before: { imageStoragePath: oldPath },
    after: { imageStoragePath: oldPath, imageUrl: 'https://example.test/same.webp' },
    userId,
    winnerId,
    bucket,
  });

  assert.equal(result.reason, 'reference-unchanged');
  assert.equal(result.deleted, false);
  assert.deepEqual(bucket.deleted, []);
});

test('paths outside the Winner owner prefix are skipped', async () => {
  const bucket = fakeBucket();

  assert.equal(isOwnedWinnerImagePath(oldPath, userId, winnerId), true);
  assert.equal(isOwnedWinnerImagePath(`users/another-user/winner-images/${winnerId}/x.webp`, userId, winnerId), false);
  assert.equal(isOwnedWinnerImagePath(`users/${userId}/winner-images/${winnerId}/../other/x.webp`, userId, winnerId), false);

  const result = await cleanupObsoleteWinnerImage({
    before: { imageStoragePath: `users/another-user/winner-images/${winnerId}/x.webp` },
    after: null,
    userId,
    winnerId,
    bucket,
  });

  assert.equal(result.reason, 'unsafe-path');
  assert.equal(result.deleted, false);
  assert.deepEqual(bucket.deleted, []);
});

test('missing Storage objects are treated as an idempotent success', async () => {
  const bucket = fakeBucket({ deleteError: Object.assign(new Error('missing'), { code: 404 }) });

  const result = await cleanupObsoleteWinnerImage({
    before: { imageStoragePath: oldPath },
    after: null,
    userId,
    winnerId,
    bucket,
  });

  assert.equal(result.deleted, true);
  assert.equal(result.alreadyMissing, true);
});

test('a screenshot that was re-referenced before trigger processing is retained', async () => {
  const bucket = fakeBucket();

  const result = await cleanupObsoleteWinnerImage({
    before: { imageStoragePath: oldPath },
    after: { imageStoragePath: newPath },
    userId,
    winnerId,
    bucket,
    isCurrentlyReferenced: async () => true,
  });

  assert.equal(result.reason, 'reference-still-current');
  assert.equal(result.deleted, false);
  assert.deepEqual(bucket.deleted, []);
});

test('Functions deployment metadata is present and excludes backend source from Hosting', () => {
  const functionsPackage = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'functions/package.json'), 'utf8'));
  const firebaseConfig = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'firebase.json'), 'utf8'));
  const appSource = fs.readFileSync(path.join(process.cwd(), 'js/app.js'), 'utf8');

  assert.equal(functionsPackage.main, 'index.js');
  assert.equal(functionsPackage.engines.node, '20');
  assert.equal(firebaseConfig.functions.source, 'functions');
  assert.ok(firebaseConfig.hosting.ignore.includes('functions/**'));
  assert.doesNotMatch(appSource, /pathToDelete|Old screenshot cleanup|Deleted winner image cleanup/);
  assert.match(appSource, /Firestore-triggered cleanup removes/);
});
