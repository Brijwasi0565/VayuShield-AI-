import Dexie, { type Table } from 'dexie';
import type {
  AQIResponse,
  ChallengeItem,
  FiresResponse,
  HouseholdProfile,
  SymptomLog,
  WeatherResponse,
} from '../types/env';

export interface CachedEnvSnapshot {
  key: string;
  aqi?: AQIResponse;
  weather?: WeatherResponse;
  fires?: FiresResponse;
  cachedAt: string;
}

class VayuShieldOfflineDB extends Dexie {
  households!: Table<HouseholdProfile, string>;
  symptoms!: Table<SymptomLog, string>;
  envCache!: Table<CachedEnvSnapshot, string>;
  challenges!: Table<ChallengeItem, string>;

  constructor() {
    super('VayuShieldOfflineDB');
    this.version(1).stores({
      households: 'id, location, updatedAt',
      symptoms: 'id, type, createdAt',
      envCache: 'key, cachedAt',
      challenges: 'id, challengeKey, completed',
    });
  }
}

export const offlineDb = new VayuShieldOfflineDB();

export const DEFAULT_HOUSEHOLD: HouseholdProfile = {
  id: 'hh_default_sharma',
  name: 'Sharma Family (Primary)',
  location: 'New Delhi',
  latitude: 28.6139,
  longitude: 77.209,
  members: [
    {
      id: 'mem_1',
      name: 'Aarav',
      ageGroup: 'child',
      conditions: ['asthma'],
      activityLevel: 'active',
    },
    {
      id: 'mem_2',
      name: 'Meena',
      ageGroup: 'adult',
      conditions: [],
      activityLevel: 'moderate',
    },
    {
      id: 'mem_3',
      name: 'Ramesh',
      ageGroup: 'elderly',
      conditions: ['heart_disease'],
      activityLevel: 'sedentary',
    },
  ],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export const DEFAULT_CHALLENGES: ChallengeItem[] = [
  {
    id: 'chl_indoor_streak',
    challengeKey: 'indoor_streak_7d',
    title: '7-Day Indoor Exercise Streak',
    description: 'Shift workouts indoors whenever city AQI exceeds 150 for 7 consecutive days.',
    points: 150,
    progress: 3,
    target: 7,
    completed: false,
    badgeName: 'Clean Lung Guardian',
  },
  {
    id: 'chl_exposure_cut',
    challengeKey: 'reduce_exposure_20',
    title: 'Reduce Outdoor Exposure by 20%',
    description: 'Batch errands into midday low-inversion windows and log 5 low-dose days.',
    points: 120,
    progress: 2,
    target: 5,
    completed: false,
    badgeName: 'Smog Navigator',
  },
  {
    id: 'chl_iaq_audit',
    challengeKey: 'household_iaq_audit',
    title: 'Complete Household IAQ Audit',
    description: 'Run the CADR purifier sizing check and seal bedroom door gaps.',
    points: 80,
    progress: 0,
    target: 1,
    completed: false,
    badgeName: 'Safe Home Architect',
  },
];

export async function ensureSeedOfflineData(): Promise<{
  households: HouseholdProfile[];
  symptoms: SymptomLog[];
  challenges: ChallengeItem[];
}> {
  const existingHH = await offlineDb.households.toArray();
  if (existingHH.length === 0) {
    await offlineDb.households.put(DEFAULT_HOUSEHOLD);
  }
  const existingChl = await offlineDb.challenges.toArray();
  if (existingChl.length === 0) {
    await offlineDb.challenges.bulkPut(DEFAULT_CHALLENGES);
  }
  const [households, symptoms, challenges] = await Promise.all([
    offlineDb.households.toArray(),
    offlineDb.symptoms.orderBy('createdAt').reverse().toArray(),
    offlineDb.challenges.toArray(),
  ]);
  return { households, symptoms, challenges };
}

export async function saveEnvSnapshotToIndexedDB(
  cityKey: string,
  patch: Partial<Omit<CachedEnvSnapshot, 'key' | 'cachedAt'>>,
): Promise<void> {
  const existing = await offlineDb.envCache.get(cityKey);
  await offlineDb.envCache.put({
    key: cityKey,
    aqi: patch.aqi ?? existing?.aqi,
    weather: patch.weather ?? existing?.weather,
    fires: patch.fires ?? existing?.fires,
    cachedAt: new Date().toISOString(),
  });
}

export async function getEnvSnapshotFromIndexedDB(
  cityKey: string,
): Promise<CachedEnvSnapshot | undefined> {
  return offlineDb.envCache.get(cityKey);
}
