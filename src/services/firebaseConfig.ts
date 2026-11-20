/**
 * Firebase web configuration, read only from environment variables (VITE_FIREBASE_*).
 *
 * The config is no longer loaded from a JSON file. A committed JSON file is how the
 * previous API key ended up in git history. Keep real values in `.env` (git-ignored).
 *
 * Note: Firebase web keys are not passwords, but they must still be restricted to your
 * domain in Google Cloud Console (see SECURITY.md).
 */
export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  firestoreDatabaseId: string;
}

type EnvLike = Record<string, string | undefined>;

export function buildFirebaseConfig(env: EnvLike): FirebaseWebConfig {
  return {
    apiKey: env.VITE_FIREBASE_API_KEY || '',
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || '',
    projectId: env.VITE_FIREBASE_PROJECT_ID || '',
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
    appId: env.VITE_FIREBASE_APP_ID || '',
    firestoreDatabaseId: env.VITE_FIREBASE_FIRESTORE_DATABASE_ID || '(default)',
  };
}

/** True only when real values are present (placeholders like YOUR_... or MY_... do not count). */
export function isFirebaseConfigUsable(config: FirebaseWebConfig): boolean {
  const looksLikePlaceholder = (value: string) => /^(YOUR_|MY_)/.test(value);
  return Boolean(
    config.apiKey &&
    config.projectId &&
    !looksLikePlaceholder(config.apiKey) &&
    !looksLikePlaceholder(config.projectId),
  );
}
