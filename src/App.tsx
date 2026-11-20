import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import { Globe, LogOut, ShieldAlert, ShieldCheck } from 'lucide-react';
import { EmergencyModal } from './components/EmergencyModal';
import { OverviewDashboard } from './components/OverviewDashboard';
import { OfflineIndicator, PWAInstallButton } from './components/PWABar';

// Heavy screens load on demand so the first page opens faster (3D, map and AI code are split out).
const AIAssistantStudio = lazy(() =>
  import('./components/AIAssistantStudio').then((m) => ({
    default: m.AIAssistantStudio,
  })),
);
const CommunityMapView = lazy(() =>
  import('./components/CommunityMapView').then((m) => ({
    default: m.CommunityMapView,
  })),
);
const HouseholdHealthHub = lazy(() =>
  import('./components/HouseholdHealthHub').then((m) => ({
    default: m.HouseholdHealthHub,
  })),
);
const ThreeAirLab = lazy(() =>
  import('./components/ThreeAirLab').then((m) => ({ default: m.ThreeAirLab })),
);

function ScreenLoader() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-center py-24 text-slate-500"
    >
      <span className="sr-only">Loading screen…</span>
      <div
        aria-hidden="true"
        className="h-8 w-8 animate-spin rounded-full border-4 border-teal-600 border-t-transparent"
      />
    </div>
  );
}
import {
  createFirestoreReport,
  createGoogleCalendarEvent,
  deleteHouseholdFromFirestore,
  fetchUserHouseholds,
  googleSignIn,
  googleSignOut,
  listUpcomingHealthCalendarEvents,
  subscribeAuth,
  subscribeCommunityReports,
  syncHouseholdToFirestore,
  syncSymptomToFirestore,
} from './services/firebase';
import {
  DEFAULT_HOUSEHOLD,
  ensureSeedOfflineData,
  getEnvSnapshotFromIndexedDB,
  offlineDb,
  saveEnvSnapshotToIndexedDB,
} from './services/offlineDb';
import type {
  AQIResponse,
  ChallengeItem,
  CityPreset,
  CommunityReport,
  FiresResponse,
  HouseholdProfile,
  LanguageCode,
  ReportType,
  SymptomLog,
  WeatherResponse,
} from './types/env';
import { INDIAN_CITIES } from './utils/aqi';
import { SUPPORTED_LANGUAGES, t } from './utils/i18n';

type AppTab = 'overview' | '3d' | 'map' | 'health' | 'ai';

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('overview');
  const [selectedCity, setSelectedCity] = useState<CityPreset>(INDIAN_CITIES[0]);
  const [language, setLanguage] = useState<LanguageCode>('en');

  // Environmental telemetry state
  const [aqi, setAqi] = useState<AQIResponse | null>(null);
  const [weather, setWeather] = useState<WeatherResponse | null>(null);
  const [fires, setFires] = useState<FiresResponse | null>(null);
  const [loadingEnv, setLoadingEnv] = useState(true);
  const [envError, setEnvError] = useState<string | null>(null);

  // Offline-first household, symptoms, challenges, and community reports
  const [households, setHouseholds] = useState<HouseholdProfile[]>([DEFAULT_HOUSEHOLD]);
  const [activeHouseholdId, setActiveHouseholdId] = useState<string>(DEFAULT_HOUSEHOLD.id);
  const [symptoms, setSymptoms] = useState<SymptomLog[]>([]);
  const [challenges, setChallenges] = useState<ChallengeItem[]>([]);
  const [reports, setReports] = useState<CommunityReport[]>([]);

  // Auth & Google Calendar state
  const [user, setUser] = useState<User | null>(null);
  const [hasCalendarAuth, setHasCalendarAuth] = useState(false);
  const [calendarEvents, setCalendarEvents] = useState<
    Array<{ id: string; summary: string; start: string; htmlLink?: string }>
  >([]);
  const [authLoading, setAuthLoading] = useState(false);

  // Emergency & AI routing state
  const [emergencyOpen, setEmergencyOpen] = useState(false);
  const [aiInitialPrompt, setAiInitialPrompt] = useState<string | null>(null);
  const [aiInitialMode, setAiInitialMode] = useState<
    'standard' | 'fast' | 'thinking' | 'search' | 'maps'
  >('standard');

  const dict = t(language);

  const activeHousehold = useMemo(
    () => households.find((h) => h.id === activeHouseholdId) || households[0] || DEFAULT_HOUSEHOLD,
    [households, activeHouseholdId],
  );

  // Update document dir & lang attribute
  useEffect(() => {
    const langMeta = SUPPORTED_LANGUAGES.find((l) => l.code === language);
    document.documentElement.lang = language;
    document.documentElement.dir = langMeta?.dir || 'ltr';
  }, [language]);

  // Seed IndexedDB offline data on mount
  useEffect(() => {
    let active = true;
    ensureSeedOfflineData()
      .then((seeded) => {
        if (!active) return;
        setHouseholds(seeded.households);
        if (seeded.households[0]) setActiveHouseholdId(seeded.households[0].id);
        setSymptoms(seeded.symptoms);
        setChallenges(seeded.challenges);
      })
      .catch((err) => {
        console.error('Offline IndexedDB initialization error:', err);
      });
    return () => {
      active = false;
    };
  }, []);

  // Auth subscription & Firestore cloud sync
  useEffect(() => {
    const unsub = subscribeAuth(async (nextUser, hasCal) => {
      setUser(nextUser);
      setHasCalendarAuth(hasCal);
      if (nextUser) {
        try {
          const cloudHouseholds = await fetchUserHouseholds(nextUser.uid);
          if (cloudHouseholds.length > 0) {
            await offlineDb.households.bulkPut(cloudHouseholds);
            setHouseholds(cloudHouseholds);
            setActiveHouseholdId(cloudHouseholds[0].id);
          } else {
            const localHH = await offlineDb.households.toArray();
            for (const hh of localHH) {
              await syncHouseholdToFirestore(nextUser.uid, hh);
            }
          }
        } catch (err) {
          console.error('Household cloud sync skipped:', err);
        }

        if (hasCal) {
          try {
            const evs = await listUpcomingHealthCalendarEvents();
            setCalendarEvents(evs);
          } catch {
            // Token may not have been granted or expired
          }
        }
      } else {
        setCalendarEvents([]);
      }
    });
    return unsub;
  }, []);

  // Load community reports from server REST + Firestore real-time stream
  const refreshReports = useCallback(async () => {
    try {
      const res = await fetch('/api/reports');
      if (res.ok) {
        const json = (await res.json()) as { reports?: CommunityReport[] };
        if (Array.isArray(json.reports)) {
          setReports((prev) => {
            const map = new Map<string, CommunityReport>();
            for (const r of json.reports!) map.set(r.id, r);
            for (const r of prev) {
              if (!map.has(r.id)) map.set(r.id, r);
            }
            return Array.from(map.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
          });
        }
      }
    } catch {
      // Offline mode keeps already-loaded reports
    }
  }, []);

  useEffect(() => {
    void refreshReports();
  }, [refreshReports]);

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeCommunityReports(
      (cloudReports) => {
        setReports((prev) => {
          const map = new Map<string, CommunityReport>();
          for (const r of prev) map.set(r.id, r);
          for (const r of cloudReports) map.set(r.id, r);
          return Array.from(map.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        });
      },
      (err) => {
        console.warn('Firestore community reports listener:', err);
      },
    );
    return unsub;
  }, [user]);

  // Fetch real environmental telemetry with IndexedDB 24h offline fallback
  const fetchTelemetry = useCallback(async (city: CityPreset) => {
    setLoadingEnv(true);
    setEnvError(null);
    const cityKey = `${city.name.toLowerCase()}:${city.latitude.toFixed(2)}:${city.longitude.toFixed(2)}`;
    const qs = `lat=${encodeURIComponent(city.latitude)}&lon=${encodeURIComponent(city.longitude)}&city=${encodeURIComponent(city.name)}`;

    let gotAny = false;

    const aqiPromise = fetch(`/api/aqi?${qs}`)
      .then(async (res) => {
        if (!res.ok) return null;
        const data = (await res.json()) as AQIResponse;
        gotAny = true;
        setAqi(data);
        await saveEnvSnapshotToIndexedDB(cityKey, { aqi: data });
        return data;
      })
      .catch(() => null);

    const weatherPromise = fetch(`/api/weather?${qs}`)
      .then(async (res) => {
        if (!res.ok) return null;
        const data = (await res.json()) as WeatherResponse;
        gotAny = true;
        setWeather(data);
        await saveEnvSnapshotToIndexedDB(cityKey, { weather: data });
        return data;
      })
      .catch(() => null);

    const firesPromise = fetch(`/api/fires?${qs}`)
      .then(async (res) => {
        if (!res.ok) return null;
        const data = (await res.json()) as FiresResponse;
        setFires(data);
        await saveEnvSnapshotToIndexedDB(cityKey, { fires: data });
        return data;
      })
      .catch(() => null);

    await Promise.allSettled([aqiPromise, weatherPromise, firesPromise]);

    if (!gotAny) {
      const cached = await getEnvSnapshotFromIndexedDB(cityKey);
      if (cached && (cached.aqi || cached.weather)) {
        if (cached.aqi) setAqi(cached.aqi);
        if (cached.weather) setWeather(cached.weather);
        if (cached.fires) setFires(cached.fires);
        setEnvError(
          `Offline or upstream timeout — showing cached snapshot from ${new Date(cached.cachedAt).toLocaleString()}.`,
        );
      } else {
        setEnvError(
          'Unable to reach live telemetry feeds right now. Check your connection and click Refresh.',
        );
      }
    }

    setLoadingEnv(false);
  }, []);

  useEffect(() => {
    void fetchTelemetry(selectedCity);
  }, [selectedCity, fetchTelemetry]);

  const handleDetectGPS = () => {
    if (!navigator.geolocation) {
      setEnvError('Geolocation is not supported in this browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(4));
        const lon = Number(pos.coords.longitude.toFixed(4));
        setSelectedCity({
          name: 'Current GPS Location',
          state: 'India',
          region: 'central',
          latitude: lat,
          longitude: lon,
        });
      },
      () => {
        setEnvError('Location permission denied. Select any Indian city from the dropdown.');
      },
      { enableHighAccuracy: false, timeout: 8000 },
    );
  };

  const handleGoogleSignIn = async () => {
    setAuthLoading(true);
    try {
      const res = await googleSignIn();
      setHasCalendarAuth(Boolean(res.accessToken));
      if (res.accessToken) {
        const evs = await listUpcomingHealthCalendarEvents().catch(() => []);
        setCalendarEvents(evs);
      }
    } catch (err) {
      console.error('Google Sign-In failed:', err);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSaveHousehold = async (hh: HouseholdProfile) => {
    await offlineDb.households.put(hh);
    setHouseholds((prev) => {
      const exists = prev.some((item) => item.id === hh.id);
      return exists ? prev.map((item) => (item.id === hh.id ? hh : item)) : [...prev, hh];
    });
    if (user) {
      await syncHouseholdToFirestore(user.uid, hh).catch((e) => console.error(e));
    }
  };

  const handleDeleteHousehold = async (id: string) => {
    await offlineDb.households.delete(id);
    setHouseholds((prev) => {
      const next = prev.filter((h) => h.id !== id);
      if (activeHouseholdId === id && next[0]) {
        setActiveHouseholdId(next[0].id);
      }
      return next;
    });
    if (user) {
      await deleteHouseholdFromFirestore(user.uid, id).catch((e) => console.error(e));
    }
  };

  const handleAddSymptom = async (logInput: Omit<SymptomLog, 'id' | 'createdAt'>) => {
    const newLog: SymptomLog = {
      ...logInput,
      id: `sym_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      userId: user?.uid,
      createdAt: new Date().toISOString(),
    };
    await offlineDb.symptoms.put(newLog);
    setSymptoms((prev) => [newLog, ...prev]);
    if (user) {
      await syncSymptomToFirestore(user.uid, newLog).catch((e) => console.error(e));
    }
  };

  const handleIncrementChallenge = async (id: string) => {
    const target = challenges.find((c) => c.id === id);
    if (!target || target.completed) return;
    const nextProgress = Math.min(target.target, target.progress + 1);
    const updated: ChallengeItem = {
      ...target,
      progress: nextProgress,
      completed: nextProgress >= target.target,
    };
    await offlineDb.challenges.put(updated);
    setChallenges((prev) => prev.map((c) => (c.id === id ? updated : c)));
  };

  const handleSubmitReport = async (payload: {
    type: ReportType;
    description: string;
    city: string;
    latitude: number;
    longitude: number;
    photoDataUrl?: string;
  }) => {
    const res = await fetch('/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        authorId: user?.uid || 'anonymous-resident',
        authorAlias: user?.displayName || 'Local Resident',
      }),
    });
    if (!res.ok) {
      const errJson = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      throw new Error(errJson.error || 'Failed to publish report.');
    }
    const data = (await res.json()) as { report: CommunityReport };
    setReports((prev) => [data.report, ...prev]);

    if (user) {
      void createFirestoreReport(user, {
        type: payload.type,
        description: payload.description,
        city: payload.city,
        latitude: payload.latitude,
        longitude: payload.longitude,
      }).catch((e) => console.warn('Firestore report mirror skipped:', e));
    }
  };

  const handleVoteReport = async (id: string, vote: 'up' | 'down') => {
    const res = await fetch(`/api/reports/${encodeURIComponent(id)}/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vote }),
    });
    if (res.ok) {
      const data = (await res.json()) as { report: CommunityReport };
      setReports((prev) => prev.map((r) => (r.id === id ? data.report : r)));
    }
  };

  const handleScheduleCalendarEvent = async (
    summary: string,
    description: string,
    startIso: string,
  ) => {
    if (!hasCalendarAuth) {
      const res = await googleSignIn();
      setHasCalendarAuth(Boolean(res.accessToken));
      if (!res.accessToken) {
        throw new Error('Calendar permission is required to save health reminders.');
      }
    }
    await createGoogleCalendarEvent({
      summary,
      description,
      startIso,
      durationMinutes: 30,
    });
    const evs = await listUpcomingHealthCalendarEvents().catch(() => []);
    setCalendarEvents(evs);
  };

  const handleFindShelters = () => {
    setAiInitialMode('maps');
    setAiInitialPrompt(
      `Locate nearby public hospitals, emergency respiratory clinics, and air-conditioned clean-air shelters around ${selectedCity.name}.`,
    );
    setActiveTab('ai');
  };

  const isEmergencyActive = (aqi?.aqi ?? 0) > 300 || (fires?.nearbyCount ?? 0) > 0;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-teal-700 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Skip to main content
      </a>
      {/* Strictly 3-zone single-row header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-16 flex items-center justify-between gap-2 md:gap-8">
          {/* Zone 1: Brand Wordmark */}
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className="flex items-center gap-2 text-left shrink-0 focus:outline-none"
          >
            <ShieldCheck className="w-6 h-6 text-teal-600 shrink-0" aria-hidden="true" />
            <span className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap font-display">
              VayuShield
            </span>
          </button>

          {/* Zone 2: Primary Navigation Links */}
          <nav
            aria-label="Primary sections"
            className="flex items-center gap-1 overflow-x-auto no-scrollbar min-w-0"
          >
            {[
              { id: 'overview', label: dict.navOverview },
              { id: '3d', label: dict.nav3D },
              { id: 'map', label: dict.navMap },
              { id: 'health', label: dict.navHealth },
              { id: 'ai', label: dict.navAI },
            ].map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id as AppTab)}
                  aria-current={active ? 'page' : undefined}
                  className={`px-3 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Single Primary Account Action */}
          <div className="shrink-0">
            {user ? (
              <button
                type="button"
                onClick={() => void googleSignOut()}
                aria-label="Sign out of Google account"
                className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg whitespace-nowrap"
              >
                <span className="max-w-[110px] truncate hidden sm:inline">
                  {user.displayName || user.email || 'Signed In'}
                </span>
                <LogOut className="w-3.5 h-3.5 text-slate-600" aria-hidden="true" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleGoogleSignIn()}
                disabled={authLoading}
                className="gsi-material-button"
              >
                <span className="gsi-material-button-content-wrapper">
                  <svg className="gsi-material-button-icon" viewBox="0 0 48 48" aria-hidden="true">
                    <path
                      fill="#EA4335"
                      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                    />
                    <path
                      fill="#4285F4"
                      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                    />
                    <path
                      fill="#34A853"
                      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                    />
                  </svg>
                  <span className="hidden sm:inline">
                    {authLoading ? 'Signing in...' : 'Sign in with Google'}
                  </span>
                  <span className="sm:hidden">{authLoading ? '...' : 'Sign in'}</span>
                </span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Secondary Workspace Utility Bar (Language, PWA Install, Emergency Trigger) */}
      <div className="bg-slate-100/80 border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-3 text-slate-600">
            <span className="font-medium text-slate-800">
              {selectedCity.name}, {selectedCity.state}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">
              Live AQI: <strong className="text-slate-900">{aqi?.aqi ?? '—'}</strong>
            </span>
            <span className="hidden md:inline text-slate-500">
              · Active Profile: {activeHousehold.name}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="language-switcher" className="sr-only">
              Select interface language
            </label>
            <div className="inline-flex items-center gap-1.5 bg-white border border-slate-300 rounded-lg px-2.5 py-1">
              <Globe className="w-3.5 h-3.5 text-teal-700 shrink-0" aria-hidden="true" />
              <select
                id="language-switcher"
                value={language}
                onChange={(e) => setLanguage(e.target.value as LanguageCode)}
                className="text-xs font-medium text-slate-800 bg-transparent focus:outline-none"
              >
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.nativeName} ({lang.englishName})
                  </option>
                ))}
              </select>
            </div>

            <PWAInstallButton />

            <button
              type="button"
              onClick={() => setEmergencyOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-800 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors whitespace-nowrap"
            >
              <ShieldAlert className="w-3.5 h-3.5" aria-hidden="true" />
              Emergency Mode
            </button>
          </div>
        </div>
      </div>

      {/* Automatic Emergency Alert Banner when AQI > 300 or Nearby Satellite Fires > 0 */}
      {isEmergencyActive && (
        <div role="alert" className="bg-red-700 text-white border-b border-red-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold">
              <ShieldAlert className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>
                {dict.emergencyBanner} ({selectedCity.name} · AQI {aqi?.aqi ?? '—'} ·{' '}
                {fires?.nearbyCount ?? 0} nearby fires)
              </span>
            </div>
            <button
              type="button"
              onClick={() => setEmergencyOpen(true)}
              className="px-3 py-1.5 text-xs font-bold bg-white text-red-800 rounded-lg hover:bg-red-50 whitespace-nowrap"
            >
              {dict.emergencyAction}
            </button>
          </div>
        </div>
      )}

      {/* Main Content Workspace */}
      <main
        id="main-content"
        tabIndex={-1}
        className="flex-1 focus:outline-none max-w-7xl w-full mx-auto px-4 sm:px-6 py-6"
      >
        {activeTab === 'overview' && (
          <OverviewDashboard
            aqi={aqi}
            weather={weather}
            fires={fires}
            loading={loadingEnv}
            error={envError}
            selectedCity={selectedCity}
            onSelectCity={setSelectedCity}
            onDetectGPS={handleDetectGPS}
            onRefresh={() => void fetchTelemetry(selectedCity)}
            activeHousehold={activeHousehold}
            language={language}
            hasCalendarAuth={hasCalendarAuth}
            onScheduleRoutineEvent={handleScheduleCalendarEvent}
            onOpenEmergency={() => setEmergencyOpen(true)}
          />
        )}

        <Suspense fallback={<ScreenLoader />}>
          {activeTab === '3d' && (
            <ThreeAirLab
              liveAqi={aqi?.aqi ?? 140}
              cityName={selectedCity.name}
              windSpeedKmh={weather?.windSpeed ?? 8}
            />
          )}

          {activeTab === 'map' && (
            <CommunityMapView
              selectedCity={selectedCity}
              aqi={aqi}
              fires={fires}
              reports={reports}
              user={user}
              onSubmitReport={handleSubmitReport}
              onVoteReport={handleVoteReport}
            />
          )}

          {activeTab === 'health' && (
            <HouseholdHealthHub
              households={households}
              activeHouseholdId={activeHousehold.id}
              onSelectHousehold={setActiveHouseholdId}
              onSaveHousehold={handleSaveHousehold}
              onDeleteHousehold={handleDeleteHousehold}
              symptoms={symptoms}
              onAddSymptom={handleAddSymptom}
              challenges={challenges}
              onIncrementChallenge={handleIncrementChallenge}
              aqi={aqi}
              windSpeedKmh={weather?.windSpeed ?? 8}
              language={language}
              hasCalendarAuth={hasCalendarAuth}
              calendarEvents={calendarEvents}
              onScheduleDoctorVisit={handleScheduleCalendarEvent}
            />
          )}

          {activeTab === 'ai' && (
            <AIAssistantStudio
              selectedCity={selectedCity}
              aqi={aqi}
              activeHousehold={activeHousehold}
              initialPrompt={aiInitialPrompt}
              initialMode={aiInitialMode}
            />
          )}
        </Suspense>
      </main>

      <OfflineIndicator />

      <EmergencyModal
        open={emergencyOpen}
        onClose={() => setEmergencyOpen(false)}
        aqi={aqi?.aqi ?? 0}
        city={selectedCity.name}
        fires={fires}
        onFindShelters={handleFindShelters}
      />
    </div>
  );
}
