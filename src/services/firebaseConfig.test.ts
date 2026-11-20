import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFirebaseConfig, isFirebaseConfigUsable } from './firebaseConfig';

test('buildFirebaseConfig reads VITE_FIREBASE_* values and defaults the database id', () => {
  const config = buildFirebaseConfig({
    VITE_FIREBASE_API_KEY: 'key-123',
    VITE_FIREBASE_PROJECT_ID: 'demo-project',
    VITE_FIREBASE_APP_ID: 'app-1',
  });
  assert.equal(config.apiKey, 'key-123');
  assert.equal(config.projectId, 'demo-project');
  assert.equal(config.firestoreDatabaseId, '(default)');
  assert.equal(config.authDomain, '');
});

test('an empty environment means cloud sync is off (offline-first mode)', () => {
  assert.equal(isFirebaseConfigUsable(buildFirebaseConfig({})), false);
});

test('placeholder values from the example file are not treated as real config', () => {
  assert.equal(
    isFirebaseConfigUsable(
      buildFirebaseConfig({ VITE_FIREBASE_API_KEY: 'YOUR_API_KEY', VITE_FIREBASE_PROJECT_ID: 'p' }),
    ),
    false,
  );
  assert.equal(
    isFirebaseConfigUsable(
      buildFirebaseConfig({ VITE_FIREBASE_API_KEY: 'MY_KEY', VITE_FIREBASE_PROJECT_ID: 'p' }),
    ),
    false,
  );
});

test('real-looking values enable cloud sync', () => {
  assert.equal(
    isFirebaseConfigUsable(
      buildFirebaseConfig({
        VITE_FIREBASE_API_KEY: 'abc',
        VITE_FIREBASE_PROJECT_ID: 'my-app-1234',
      }),
    ),
    true,
  );
});
