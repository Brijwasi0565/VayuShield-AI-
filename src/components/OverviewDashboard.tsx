import React, { useMemo, useState } from 'react';
import {
  CalendarPlus,
  Compass,
  Flame,
  LocateFixed,
  RefreshCw,
  Search,
  ShieldCheck,
  Sun,
  Wind,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  AQIResponse,
  CityPreset,
  FiresResponse,
  HouseholdProfile,
  LanguageCode,
  PlannedActivity,
  TimeOfDay,
  WeatherResponse,
} from '../types/env';
import { INDIAN_CITIES, getAQICategoryInfo, getVentilationWindowAdvice } from '../utils/aqi';
import { getRegionalHealthTip, t } from '../utils/i18n';
import { generateDeterministicRecommendations } from '../utils/recommendations';

interface OverviewDashboardProps {
  aqi: AQIResponse | null;
  weather: WeatherResponse | null;
  fires: FiresResponse | null;
  loading: boolean;
  error: string | null;
  selectedCity: CityPreset;
  onSelectCity: (city: CityPreset) => void;
  onDetectGPS: () => void;
  onRefresh: () => void;
  activeHousehold: HouseholdProfile;
  language: LanguageCode;
  hasCalendarAuth: boolean;
  onScheduleRoutineEvent: (summary: string, description: string, startIso: string) => Promise<void>;
  onOpenEmergency: () => void;
}

export const OverviewDashboard: React.FC<OverviewDashboardProps> = ({
  aqi,
  weather,
  fires,
  loading,
  error,
  selectedCity,
  onSelectCity,
  onDetectGPS,
  onRefresh,
  activeHousehold,
  language,
  hasCalendarAuth,
  onScheduleRoutineEvent,
  onOpenEmergency,
}) => {
  const dict = t(language);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CityPreset[]>([]);
  const [searching, setSearching] = useState(false);

  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>(() => {
    const h = new Date().getHours();
    if (h < 12) return 'morning';
    if (h < 17) return 'afternoon';
    if (h < 21) return 'evening';
    return 'night';
  });
  const [plannedActivity, setPlannedActivity] = useState<PlannedActivity>('commute');
  const [calendarMsg, setCalendarMsg] = useState<string | null>(null);

  const currentAqiVal = aqi?.aqi ?? 0;
  const aqiStyle = getAQICategoryInfo(currentAqiVal);

  const recommendations = useMemo(
    () =>
      generateDeterministicRecommendations({
        currentAQI: currentAqiVal,
        members: activeHousehold.members,
        timeOfDay,
        plannedActivity,
        nearbyFireCount: fires?.nearbyCount ?? 0,
      }),
    [currentAqiVal, activeHousehold.members, timeOfDay, plannedActivity, fires?.nearbyCount],
  );

  const ventilationAdvice = useMemo(
    () => getVentilationWindowAdvice(aqi?.hourly ?? [], weather?.windSpeed ?? 8),
    [aqi?.hourly, weather?.windSpeed],
  );

  const handleCitySearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(searchQuery.trim())}`);
      if (res.ok) {
        const json = (await res.json()) as { results?: CityPreset[] };
        setSearchResults(json.results || []);
      }
    } finally {
      setSearching(false);
    }
  };

  const handleScheduleWindow = async (title: string, desc: string, hourOffset: number) => {
    const target = new Date();
    target.setHours(target.getHours() + hourOffset, 0, 0, 0);
    try {
      await onScheduleRoutineEvent(title, desc, target.toISOString());
      setCalendarMsg(`Added "${title}" to Google Calendar.`);
    } catch (err) {
      setCalendarMsg(err instanceof Error ? err.message : 'Sign in with Google to sync calendar.');
    }
  };

  return (
    <div className="space-y-8">
      {/* Location & City Search Strip */}
      <section
        aria-label="Location selector"
        className="bg-white border border-slate-200 rounded-xl p-5"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="city-preset-select" className="text-xs font-semibold text-slate-600">
              Monitoring City:
            </label>
            <select
              id="city-preset-select"
              value={selectedCity.name}
              onChange={(e) => {
                const found = INDIAN_CITIES.find((c) => c.name === e.target.value);
                if (found) onSelectCity(found);
              }}
              className="px-3 py-2 text-sm font-medium bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
            >
              {INDIAN_CITIES.map((city) => (
                <option key={city.name} value={city.name}>
                  {city.name}, {city.state}
                </option>
              ))}
              {!INDIAN_CITIES.some((c) => c.name === selectedCity.name) && (
                <option value={selectedCity.name}>{selectedCity.name}</option>
              )}
            </select>

            <button
              type="button"
              onClick={onDetectGPS}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
            >
              <LocateFixed className="w-3.5 h-3.5 text-teal-600" aria-hidden="true" />
              Use GPS
            </button>

            <button
              type="button"
              onClick={onRefresh}
              aria-label="Refresh environmental telemetry"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              Refresh
            </button>
          </div>

          <form onSubmit={handleCitySearch} className="flex items-center gap-2 w-full lg:w-auto">
            <label htmlFor="nominatim-search" className="sr-only">
              Search any Indian locality or pin code
            </label>
            <input
              id="nominatim-search"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Indian locality or city..."
              className="w-full lg:w-64 px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
            <button
              type="submit"
              disabled={searching}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              <Search className="w-3.5 h-3.5" aria-hidden="true" />
              {searching ? 'Finding...' : 'Find'}
            </button>
          </form>
        </div>

        {searchResults.length > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-200 flex flex-wrap gap-2">
            {searchResults.map((res, idx) => (
              <button
                key={`${res.name}-${idx}`}
                type="button"
                onClick={() => {
                  onSelectCity({
                    name: res.name,
                    state: res.state || 'India',
                    region: 'central',
                    latitude: res.latitude,
                    longitude: res.longitude,
                  });
                  setSearchResults([]);
                  setSearchQuery('');
                }}
                className="px-3 py-1.5 text-xs font-medium bg-slate-100 hover:bg-teal-50 text-slate-800 border border-slate-200 rounded-lg transition-colors"
              >
                {res.name} · {res.state}
              </button>
            ))}
          </div>
        )}
      </section>

      {error && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-900"
        >
          {error}
        </div>
      )}

      {/* Primary Telemetry Grid */}
      <section
        aria-label="Live environmental readings"
        className="grid grid-cols-1 lg:grid-cols-12 gap-6"
      >
        {/* AQI Primary Anchor Card */}
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                {dict.aqiLabel}
              </p>
              <h2 className="text-xl font-bold text-slate-900 mt-1">
                {selectedCity.name}, {selectedCity.state}
              </h2>
            </div>
            <button
              type="button"
              onClick={onOpenEmergency}
              className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-red-50 hover:text-red-800 border border-slate-200 rounded-lg transition-colors whitespace-nowrap"
            >
              Emergency Guide
            </button>
          </div>

          <div className="flex flex-wrap items-baseline gap-4">
            <span
              data-testid="live-aqi-value"
              className="text-5xl font-bold font-mono tabular-nums tracking-tight"
              style={{ color: aqiStyle.hex }}
            >
              {aqi ? aqi.aqi : '—'}
            </span>
            <div>
              <p className="text-base font-bold" style={{ color: aqiStyle.hex }}>
                {aqi ? aqiStyle.category : 'Loading telemetry...'}
              </p>
              <p className="text-xs text-slate-600 mt-0.5 max-w-md">
                {aqi
                  ? aqiStyle.description
                  : 'Connecting to Open-Meteo Copernicus air quality telemetry...'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-slate-200">
            <div>
              <p className="text-xs text-slate-500">PM2.5</p>
              <p className="text-lg font-semibold font-mono tabular-nums text-slate-900 mt-0.5">
                {aqi?.pollutants.pm25 ?? '—'}
                <span className="text-xs font-normal text-slate-500 ml-1">µg/m³</span>
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">PM10</p>
              <p className="text-lg font-semibold font-mono tabular-nums text-slate-900 mt-0.5">
                {aqi?.pollutants.pm10 ?? '—'}
                <span className="text-xs font-normal text-slate-500 ml-1">µg/m³</span>
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">NO₂</p>
              <p className="text-lg font-semibold font-mono tabular-nums text-slate-900 mt-0.5">
                {aqi?.pollutants.no2 ?? '—'}
                <span className="text-xs font-normal text-slate-500 ml-1">µg/m³</span>
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">O₃</p>
              <p className="text-lg font-semibold font-mono tabular-nums text-slate-900 mt-0.5">
                {aqi?.pollutants.o3 ?? '—'}
                <span className="text-xs font-normal text-slate-500 ml-1">µg/m³</span>
              </p>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span>
              Source:{' '}
              <strong className="text-slate-700">{aqi?.source || 'Open-Meteo Air Quality'}</strong>
            </span>
            <span className="font-mono tabular-nums">
              {aqi?.timestamp
                ? `Updated ${new Date(aqi.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                : ''}
            </span>
          </div>
        </div>

        {/* Weather + NASA Fire + Pollen Column */}
        <div className="lg:col-span-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* Weather Card */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                {dict.weatherLabel}
              </p>
              <Sun className="w-4 h-4 text-amber-600" aria-hidden="true" />
            </div>
            <div>
              <p className="text-3xl font-bold font-mono tabular-nums text-slate-900">
                {weather ? `${weather.temperature}°C` : '—'}
              </p>
              <p className="text-sm font-medium text-slate-700 mt-0.5">
                {weather?.conditionLabel || 'Fetching weather...'}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-200 text-xs">
              <div>
                <span className="text-slate-500">Humidity</span>
                <p className="font-mono font-semibold text-slate-900 tabular-nums mt-0.5">
                  {weather ? `${weather.humidity}%` : '—'}
                </p>
              </div>
              <div>
                <span className="text-slate-500">Wind</span>
                <p className="font-mono font-semibold text-slate-900 tabular-nums mt-0.5">
                  {weather ? `${weather.windSpeed} km/h` : '—'}
                </p>
              </div>
              <div>
                <span className="text-slate-500">UV Index</span>
                <p className="font-mono font-semibold text-slate-900 tabular-nums mt-0.5">
                  {weather ? weather.uvIndex : '—'}
                </p>
              </div>
              <div>
                <span className="text-slate-500">Coords</span>
                <p className="font-mono text-slate-700 tabular-nums mt-0.5">
                  {selectedCity.latitude.toFixed(2)}, {selectedCity.longitude.toFixed(2)}
                </p>
              </div>
            </div>
            <p className="text-[11px] text-slate-500 pt-2 border-t border-slate-100">
              Source: {weather?.source || 'Open-Meteo Weather'}
            </p>
          </div>

          {/* Fire & Pollen Card */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  {dict.fireAlertsLabel}
                </p>
                <Flame className="w-4 h-4 text-orange-600" aria-hidden="true" />
              </div>
              <p className="text-3xl font-bold font-mono tabular-nums text-slate-900 mt-3">
                {fires ? fires.nearbyCount : '—'}{' '}
                <span className="text-xs font-sans font-normal text-slate-500 ml-1">
                  within 150 km
                </span>
              </p>
              <div className="mt-3 space-y-1.5">
                {fires?.alerts
                  .filter((a) => a.distanceKm <= 1500)
                  .slice(0, 2)
                  .map((alert) => (
                    <p key={alert.id} className="text-xs text-slate-700 truncate">
                      {alert.title} · <span className="font-mono">{alert.distanceKm} km</span>
                    </p>
                  ))}
                {(!fires || fires.alerts.filter((a) => a.distanceKm <= 1500).length === 0) && (
                  <p className="text-xs text-slate-500">
                    No active wildfire plumes detected within 1,500 km (South Asia).
                  </p>
                )}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200 space-y-1">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                {dict.pollenLabel}
              </p>
              <p className="text-xs text-slate-700">{dict.pollenComingSoon}</p>
            </div>

            <p className="text-[11px] text-slate-500 pt-2 border-t border-slate-100">
              Source: {fires?.source || 'NASA EONET / FIRMS'}
            </p>
          </div>
        </div>
      </section>

      {/* Personalized Deterministic Health Guidance */}
      <section
        aria-label="Personalized health recommendations"
        className="bg-white border border-slate-200 rounded-xl p-6 space-y-6"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-teal-600" aria-hidden="true" />
              {dict.personalizedAdvice}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Active Household: <strong className="text-slate-700">{activeHousehold.name}</strong> (
              {activeHousehold.members.length} members) · Deterministic WHO/CPCB Clinical Rules
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="time-of-day-select" className="sr-only">
              Time of day
            </label>
            <select
              id="time-of-day-select"
              value={timeOfDay}
              onChange={(e) => setTimeOfDay(e.target.value as TimeOfDay)}
              className="px-3 py-1.5 text-xs font-medium bg-slate-50 border border-slate-300 rounded-lg text-slate-800"
            >
              <option value="morning">Morning</option>
              <option value="afternoon">Afternoon</option>
              <option value="evening">Evening</option>
              <option value="night">Night</option>
            </select>

            <label htmlFor="activity-select" className="sr-only">
              Planned activity
            </label>
            <select
              id="activity-select"
              value={plannedActivity}
              onChange={(e) => setPlannedActivity(e.target.value as PlannedActivity)}
              className="px-3 py-1.5 text-xs font-medium bg-slate-50 border border-slate-300 rounded-lg text-slate-800"
            >
              <option value="commute">Work Commute</option>
              <option value="school_drop">School Drop-off</option>
              <option value="outdoor_exercise">Outdoor Exercise</option>
              <option value="errands">Local Errands</option>
              <option value="indoor_rest">Indoor Rest</option>
            </select>
          </div>
        </div>

        <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {aqi
                ? `Primary Action (${recommendations.outdoorGuidance.toUpperCase()})`
                : 'Primary Action (LOADING)'}
            </p>
            <p className="text-base font-bold text-slate-900 mt-0.5">
              {aqi
                ? recommendations.overall
                : 'Evaluating household vulnerability against live air quality...'}
            </p>
          </div>
          <span className="text-xs font-mono text-slate-600 shrink-0">
            {aqi ? `Mask: ${recommendations.mask.split('.')[0]}` : 'Checking telemetry...'}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-slate-900">Vulnerable Member Alerts</h3>
            <ul className="space-y-1.5 text-xs text-slate-700 leading-relaxed">
              {recommendations.vulnerable.map((item, idx) => (
                <li key={idx}>• {item}</li>
              ))}
            </ul>
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-slate-900">Indoor &amp; Ventilation</h3>
            <p className="text-xs text-slate-700 leading-relaxed">{recommendations.ventilation}</p>
            <ul className="space-y-1.5 text-xs text-slate-700 leading-relaxed">
              {recommendations.indoor.map((item, idx) => (
                <li key={idx}>• {item}</li>
              ))}
            </ul>
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-slate-900">Exercise &amp; Medication</h3>
            <p className="text-xs text-slate-700 leading-relaxed">{recommendations.exercise}</p>
            <ul className="space-y-1.5 text-xs text-slate-700 leading-relaxed">
              {recommendations.medication.map((item, idx) => (
                <li key={idx}>• {item}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-600">
          <div>
            <strong className="text-slate-800">{dict.regionalTipTitle}:</strong>{' '}
            {getRegionalHealthTip(selectedCity.name, language)}
          </div>
          <span className="font-mono text-[11px] text-slate-500 shrink-0">
            Cited: {recommendations.guidelinesCited.join(' · ')}
          </span>
        </div>
      </section>

      {/* 7-Day Forecast Chart + Daily Routine Optimizer */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">{dict.forecast7Day}</h2>
            <span className="text-xs text-slate-500 font-mono">Open-Meteo 7D Model</span>
          </div>
          <div className="h-64 w-full">
            {aqi && aqi.forecast.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={aqi.forecast}
                  margin={{ top: 10, right: 12, left: -12, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="aqiGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0D9488" stopOpacity={0.28} />
                      <stop offset="95%" stopColor="#0D9488" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    tickFormatter={(v: string) => v.slice(5)}
                  />
                  <YAxis tick={{ fontSize: 11, fill: '#64748B' }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#FFFFFF',
                      borderColor: '#E2E8F0',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="aqi"
                    name="Projected AQI"
                    stroke="#0D9488"
                    strokeWidth={2}
                    fill="url(#aqiGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-slate-500">
                7-day forecast unavailable while offline or using single-station fallback.
              </div>
            )}
          </div>
        </div>

        {/* Daily Routines & Commute Optimizer */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Compass className="w-4 h-4 text-teal-600" aria-hidden="true" />
              {dict.dailyRoutines}
            </h2>
            <Wind className="w-4 h-4 text-slate-400" aria-hidden="true" />
          </div>

          <div className="space-y-3 text-xs">
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900">
                  Best Ventilation &amp; Outdoor Window
                </span>
                <span className="font-mono font-semibold text-teal-700">
                  {ventilationAdvice.bestWindowLabel}
                </span>
              </div>
              <p className="text-slate-600">{ventilationAdvice.reason}</p>
            </div>

            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
              <span className="font-bold text-slate-900">School / Work Commute Advice</span>
              <p className="text-slate-600">{recommendations.routineTips[0]}</p>
            </div>

            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
              <span className="font-bold text-slate-900">Nighttime Sleep Protection</span>
              <p className="text-slate-600">
                {currentAqiVal > 120
                  ? 'Keep bedroom windows shut after 20:00 and run air purifier on Silent/Sleep speed.'
                  : 'Ambient air is mild; run ceiling fan circulation for restful sleep.'}
              </p>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={() =>
                handleScheduleWindow(
                  `Clean-Air Window (${selectedCity.name})`,
                  `Optimal ventilation/errand window (${ventilationAdvice.bestWindowLabel}, est. AQI ${ventilationAdvice.bestWindowAqi}).`,
                  2,
                )
              }
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors"
            >
              <CalendarPlus className="w-4 h-4" aria-hidden="true" />
              {hasCalendarAuth
                ? 'Schedule Clean-Air Reminder in Google Calendar'
                : 'Sign in with Google to Sync Calendar Reminder'}
            </button>
            {calendarMsg && (
              <p className="text-xs text-slate-600 mt-2 text-center">{calendarMsg}</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};
