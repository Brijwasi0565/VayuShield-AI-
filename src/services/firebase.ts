import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  User,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type Auth,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Firestore,
} from 'firebase/firestore';
import { buildFirebaseConfig, isFirebaseConfigUsable } from './firebaseConfig';
import type { CommunityReport, HouseholdProfile, LanguageCode, SymptomLog } from '../types/env';

const firebaseConfig = buildFirebaseConfig(import.meta.env as Record<string, string | undefined>);

export const isFirebaseConfigured = isFirebaseConfigUsable(firebaseConfig);

let app: FirebaseApp | null = null;
export let db: Firestore | null = null;
export let auth: Auth | null = null;

if (isFirebaseConfigured) {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app, firebaseConfig.firestoreDatabaseId || '(default)');
  auth = getAuth(app);
}

const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/calendar.events');

// In-memory OAuth access token cache (never stored in localStorage/sessionStorage)
let cachedAccessToken: string | null = null;
let isSigningIn = false;

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid,
      email: auth?.currentUser?.email,
      emailVerified: auth?.currentUser?.emailVerified,
      isAnonymous: auth?.currentUser?.isAnonymous,
      tenantId: auth?.currentUser?.tenantId,
      providerInfo:
        auth?.currentUser?.providerData?.map((p) => ({
          providerId: p.providerId,
          email: p.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Mandatory startup connection probe
async function testConnection() {
  if (!db) return;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
void testConnection();

export function subscribeAuth(
  onUserChange: (user: User | null, hasCalendarToken: boolean) => void,
) {
  if (!auth) {
    onUserChange(null, false);
    return () => {};
  }
  return onAuthStateChanged(auth, (user) => {
    if (!user && !isSigningIn) {
      cachedAccessToken = null;
    }
    onUserChange(user, Boolean(cachedAccessToken));
  });
}

export async function googleSignIn(): Promise<{
  user: User;
  accessToken: string | null;
}> {
  if (!auth) {
    throw new Error(
      'Cloud sync is optional: set the VITE_FIREBASE_* values in your .env file to enable Google Sign-In.',
    );
  }
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    cachedAccessToken = credential?.accessToken ?? null;
    await ensureUserProfile(result.user);
    return { user: result.user, accessToken: cachedAccessToken };
  } finally {
    isSigningIn = false;
  }
}

export async function googleSignOut(): Promise<void> {
  cachedAccessToken = null;
  if (!auth) return;
  await signOut(auth);
}

export function getCalendarAccessToken(): string | null {
  return cachedAccessToken;
}

export async function ensureUserProfile(
  user: User,
  preferredLanguage: LanguageCode = 'en',
): Promise<void> {
  if (!db) return;
  const path = `users/${user.uid}`;
  try {
    const ref = doc(db, 'users', user.uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        uid: user.uid,
        email: (user.email || 'user@vayushield.local').slice(0, 254),
        displayName: (user.displayName || 'VayuShield Member').slice(0, 100),
        preferredLanguage,
        points: 50,
        badges: ['First Clean Air Check'],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function syncHouseholdToFirestore(
  userId: string,
  household: HouseholdProfile,
): Promise<void> {
  if (!db) return;
  const path = `users/${userId}/households/${household.id}`;
  try {
    const ref = doc(db, 'users', userId, 'households', household.id);
    const existingSnap = await getDoc(ref);
    const safePayload = {
      id: household.id.slice(0, 128),
      userId,
      name: household.name.trim().slice(0, 80) || 'My Household',
      location: household.location.trim().slice(0, 120) || 'New Delhi',
      latitude: household.latitude,
      longitude: household.longitude,
      members: household.members.slice(0, 15),
      updatedAt: serverTimestamp(),
    };
    if (!existingSnap.exists()) {
      await setDoc(ref, {
        ...safePayload,
        createdAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        name: safePayload.name,
        location: safePayload.location,
        latitude: safePayload.latitude,
        longitude: safePayload.longitude,
        members: safePayload.members,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteHouseholdFromFirestore(
  userId: string,
  householdId: string,
): Promise<void> {
  if (!db) return;
  const path = `users/${userId}/households/${householdId}`;
  try {
    await deleteDoc(doc(db, 'users', userId, 'households', householdId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function fetchUserHouseholds(userId: string): Promise<HouseholdProfile[]> {
  if (!db) return [];
  const path = `users/${userId}/households`;
  try {
    const q = query(collection(db, 'users', userId, 'households'), where('userId', '==', userId));
    const snaps = await getDocs(q);
    return snaps.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        userId: data.userId,
        name: data.name,
        location: data.location,
        latitude: data.latitude,
        longitude: data.longitude,
        members: Array.isArray(data.members) ? data.members : [],
        createdAt: data.createdAt?.toDate?.()?.toISOString?.() || new Date().toISOString(),
        updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() || new Date().toISOString(),
      };
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function syncSymptomToFirestore(userId: string, symptom: SymptomLog): Promise<void> {
  if (!db) return;
  const path = `users/${userId}/symptoms/${symptom.id}`;
  try {
    await setDoc(doc(db, 'users', userId, 'symptoms', symptom.id), {
      userId,
      type: symptom.type,
      severity: Math.max(1, Math.min(5, Math.round(symptom.severity))),
      aqiAtTime: Math.max(0, Math.min(1000, Math.round(symptom.aqiAtTime))),
      outdoorMinutes: Math.max(0, Math.min(1440, Math.round(symptom.outdoorMinutes))),
      ...(symptom.medicationTaken
        ? { medicationTaken: symptom.medicationTaken.slice(0, 120) }
        : {}),
      ...(symptom.notes ? { notes: symptom.notes.slice(0, 500) } : {}),
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export function subscribeCommunityReports(
  onData: (reports: CommunityReport[]) => void,
  onError?: (err: unknown) => void,
) {
  if (!db) return () => {};
  const path = 'reports';
  const q = query(collection(db, 'reports'), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => {
      const items: CommunityReport[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          authorId: data.authorId,
          authorAlias: data.authorAlias,
          type: data.type,
          description: data.description,
          city: data.city,
          latitude: data.latitude,
          longitude: data.longitude,
          upvotes: data.upvotes ?? 0,
          downvotes: data.downvotes ?? 0,
          verified: Boolean(data.verified),
          createdAt: data.createdAt?.toDate?.()?.toISOString?.() || new Date().toISOString(),
          updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() || new Date().toISOString(),
        };
      });
      onData(items);
    },
    (err) => {
      if (onError) onError(err);
      else handleFirestoreError(err, OperationType.LIST, path);
    },
  );
}

export async function createFirestoreReport(
  user: User,
  payload: Omit<
    CommunityReport,
    | 'id'
    | 'authorId'
    | 'authorAlias'
    | 'upvotes'
    | 'downvotes'
    | 'verified'
    | 'createdAt'
    | 'updatedAt'
  >,
): Promise<string> {
  if (!db) {
    throw new Error('Firebase is not configured for this local build.');
  }
  const id = `rep_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const path = `reports/${id}`;
  try {
    await setDoc(doc(db, 'reports', id), {
      authorId: user.uid,
      authorAlias: (user.displayName || 'Community Member').slice(0, 60),
      type: payload.type,
      description: payload.description.trim().slice(0, 500),
      city: payload.city.trim().slice(0, 80),
      latitude: payload.latitude,
      longitude: payload.longitude,
      upvotes: 0,
      downvotes: 0,
      verified: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

// Google Calendar API client-side calls using in-memory OAuth access token
export async function listUpcomingHealthCalendarEvents(): Promise<
  Array<{ id: string; summary: string; start: string; htmlLink?: string }>
> {
  const token = getCalendarAccessToken();
  if (!token) return [];
  const timeMin = new Date().toISOString();
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&maxResults=8&singleEvents=true&orderBy=startTime`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  if (!res.ok) {
    throw new Error('Unable to load Google Calendar events. Please sign in again.');
  }
  const json = (await res.json()) as {
    items?: Array<{
      id: string;
      summary?: string;
      htmlLink?: string;
      start?: { dateTime?: string; date?: string };
    }>;
  };
  return (json.items || []).map((ev) => ({
    id: ev.id,
    summary: ev.summary || 'Health Reminder',
    start: ev.start?.dateTime || ev.start?.date || '',
    htmlLink: ev.htmlLink,
  }));
}

export async function createGoogleCalendarEvent(params: {
  summary: string;
  description: string;
  startIso: string;
  durationMinutes?: number;
}): Promise<{ id: string; htmlLink?: string }> {
  const token = getCalendarAccessToken();
  if (!token) {
    throw new Error('Please sign in with Google to sync events to Google Calendar.');
  }
  const startDate = new Date(params.startIso);
  const endDate = new Date(startDate.getTime() + (params.durationMinutes ?? 30) * 60_000);
  const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      summary: params.summary,
      description: params.description,
      start: { dateTime: startDate.toISOString() },
      end: { dateTime: endDate.toISOString() },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Calendar event creation failed: ${text}`);
  }
  return (await res.json()) as { id: string; htmlLink?: string };
}
