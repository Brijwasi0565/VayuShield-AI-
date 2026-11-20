import React, { useMemo, useState } from 'react';
import {
  Activity,
  Award,
  Calendar,
  Download,
  Home,
  Leaf,
  Plus,
  Printer,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type {
  ActivityLevel,
  AgeGroup,
  AQIResponse,
  ChallengeItem,
  HealthCondition,
  HouseholdMember,
  HouseholdProfile,
  LanguageCode,
  SymptomLog,
  SymptomType,
} from '../types/env';
import {
  calculateDailyExposure,
  calculateIAQEffectiveness,
  getVentilationWindowAdvice,
} from '../utils/aqi';
import { t } from '../utils/i18n';

interface HouseholdHealthHubProps {
  households: HouseholdProfile[];
  activeHouseholdId: string;
  onSelectHousehold: (id: string) => void;
  onSaveHousehold: (hh: HouseholdProfile) => Promise<void>;
  onDeleteHousehold: (id: string) => Promise<void>;
  symptoms: SymptomLog[];
  onAddSymptom: (log: Omit<SymptomLog, 'id' | 'createdAt'>) => Promise<void>;
  challenges: ChallengeItem[];
  onIncrementChallenge: (id: string) => Promise<void>;
  aqi: AQIResponse | null;
  windSpeedKmh: number;
  language: LanguageCode;
  hasCalendarAuth: boolean;
  calendarEvents: Array<{ id: string; summary: string; start: string; htmlLink?: string }>;
  onScheduleDoctorVisit: (summary: string, description: string, startIso: string) => Promise<void>;
}

const HEALTH_CONDITIONS: Array<{ id: HealthCondition; label: string }> = [
  { id: 'asthma', label: 'Asthma' },
  { id: 'copd', label: 'COPD' },
  { id: 'allergies', label: 'Allergies' },
  { id: 'heart_disease', label: 'Heart Disease' },
  { id: 'pregnancy', label: 'Pregnancy' },
];

const INDOOR_PLANTS = [
  {
    name: 'Snake Plant (Sansevieria)',
    benefit: 'Releases O₂ at night; low-water bedroom resilience.',
    placement: '1–2 pots per 100 sq ft bedroom',
  },
  {
    name: 'Areca Palm (Dypsis lutescens)',
    benefit: 'High transpiration natural humidifier; traps coarse dust on fronds.',
    placement: 'Living room sunny window',
  },
  {
    name: 'Peace Lily (Spathiphyllum)',
    benefit: 'Absorbs airborne VOCs (benzene, formaldehyde) in shaded rooms.',
    placement: 'Study / shaded hallway (keep away from pets)',
  },
  {
    name: 'Money Plant (Epipremnum aureum)',
    benefit: 'Hardy Indian indoor climber supporting VOC & indoor particulate capture.',
    placement: 'Balcony entrance / kitchen shelf',
  },
];

export const HouseholdHealthHub: React.FC<HouseholdHealthHubProps> = ({
  households,
  activeHouseholdId,
  onSelectHousehold,
  onSaveHousehold,
  onDeleteHousehold,
  symptoms,
  onAddSymptom,
  challenges,
  onIncrementChallenge,
  aqi,
  windSpeedKmh,
  language,
  hasCalendarAuth,
  calendarEvents,
  onScheduleDoctorVisit,
}) => {
  const dict = t(language);
  const [subTab, setSubTab] = useState<'household' | 'symptoms' | 'iaq' | 'challenges'>(
    'household',
  );
  const activeHousehold = households.find((h) => h.id === activeHouseholdId) || households[0];

  // New Household form state
  const [newHHName, setNewHHName] = useState('');
  const [newHHCity, setNewHHCity] = useState(activeHousehold?.location || 'New Delhi');

  // New Member form state
  const [memberName, setMemberName] = useState('');
  const [memberAge, setMemberAge] = useState<AgeGroup>('adult');
  const [memberActivity, setMemberActivity] = useState<ActivityLevel>('moderate');
  const [memberConditions, setMemberConditions] = useState<HealthCondition[]>([]);

  // Symptom & Exposure form state
  const [symptomType, setSymptomType] = useState<SymptomType>('cough');
  const [severity, setSeverity] = useState<1 | 2 | 3 | 4 | 5>(2);
  const [outdoorMinutes, setOutdoorMinutes] = useState(45);
  const [medicationTaken, setMedicationTaken] = useState('');
  const [symptomNotes, setSymptomNotes] = useState('');

  // Doctor Visit Calendar state
  const [doctorTitle, setDoctorTitle] = useState('Pulmonologist / Respiratory Checkup');
  const [doctorDate, setDoctorDate] = useState(() => {
    const d = new Date(Date.now() + 86400_000 * 2);
    return d.toISOString().slice(0, 16);
  });
  const [calendarFeedback, setCalendarFeedback] = useState<string | null>(null);

  // IAQ Calculator state
  const [roomSqFt, setRoomSqFt] = useState(160);
  const [ceilingFt, setCeilingFt] = useState(9);
  const [cadrM3h, setCadrM3h] = useState(320);

  const currentAqi = aqi?.aqi ?? 140;
  const exposure = useMemo(
    () => calculateDailyExposure(outdoorMinutes, currentAqi),
    [outdoorMinutes, currentAqi],
  );
  const iaqResult = useMemo(
    () => calculateIAQEffectiveness(roomSqFt, ceilingFt, cadrM3h, currentAqi),
    [roomSqFt, ceilingFt, cadrM3h, currentAqi],
  );
  const ventilationAdvice = useMemo(
    () => getVentilationWindowAdvice(aqi?.hourly ?? [], windSpeedKmh),
    [aqi?.hourly, windSpeedKmh],
  );

  const totalPoints = useMemo(
    () =>
      challenges.reduce(
        (sum, c) =>
          sum + (c.completed ? c.points : Math.round((c.progress / c.target) * c.points * 0.5)),
        0,
      ),
    [challenges],
  );

  const handleCreateHousehold = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHHName.trim()) return;
    const now = new Date().toISOString();
    const created: HouseholdProfile = {
      id: `hh_${Date.now()}`,
      name: newHHName.trim(),
      location: newHHCity.trim() || 'New Delhi',
      latitude: activeHousehold?.latitude ?? 28.6139,
      longitude: activeHousehold?.longitude ?? 77.209,
      members: [],
      createdAt: now,
      updatedAt: now,
    };
    await onSaveHousehold(created);
    onSelectHousehold(created.id);
    setNewHHName('');
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeHousehold || !memberName.trim()) return;
    const newMem: HouseholdMember = {
      id: `mem_${Date.now()}`,
      name: memberName.trim(),
      ageGroup: memberAge,
      conditions: memberConditions,
      activityLevel: memberActivity,
    };
    await onSaveHousehold({
      ...activeHousehold,
      members: [...activeHousehold.members, newMem],
      updatedAt: new Date().toISOString(),
    });
    setMemberName('');
    setMemberConditions([]);
  };

  const handleRemoveMember = async (memId: string) => {
    if (!activeHousehold) return;
    await onSaveHousehold({
      ...activeHousehold,
      members: activeHousehold.members.filter((m) => m.id !== memId),
      updatedAt: new Date().toISOString(),
    });
  };

  const handleLogSymptom = async (e: React.FormEvent) => {
    e.preventDefault();
    await onAddSymptom({
      type: symptomType,
      severity,
      aqiAtTime: currentAqi,
      outdoorMinutes,
      medicationTaken: medicationTaken.trim() || undefined,
      notes: symptomNotes.trim() || undefined,
    });
    setMedicationTaken('');
    setSymptomNotes('');
  };

  const handleExportCSV = () => {
    const header = 'Date,Symptom,Severity(1-5),AQI,OutdoorMinutes,Medication,Notes\n';
    const rows = symptoms
      .map(
        (s) =>
          `"${s.createdAt}","${s.type}",${s.severity},${s.aqiAtTime},${s.outdoorMinutes},"${(s.medicationTaken || '').replace(/"/g, '""')}","${(s.notes || '').replace(/"/g, '""')}"`,
      )
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vayushield-health-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleScheduleDoctor = async (e: React.FormEvent) => {
    e.preventDefault();
    setCalendarFeedback(null);
    try {
      await onScheduleDoctorVisit(
        doctorTitle,
        `VayuShield AI health consultation. Household: ${activeHousehold?.name || 'Primary'}. Recent AQI: ${currentAqi}.`,
        new Date(doctorDate).toISOString(),
      );
      setCalendarFeedback('Doctor visit scheduled in your Google Calendar.');
    } catch (err) {
      setCalendarFeedback(
        err instanceof Error ? err.message : 'Unable to schedule calendar event.',
      );
    }
  };

  const chartData = useMemo(
    () =>
      [...symptoms]
        .slice(0, 14)
        .reverse()
        .map((s) => ({
          date: s.createdAt.slice(5, 10),
          severity: s.severity,
          exposure: Math.round((s.outdoorMinutes / 60) * s.aqiAtTime),
        })),
    [symptoms],
  );

  return (
    <div className="space-y-6">
      {/* Sub-navigation */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white border border-slate-200 rounded-xl p-3">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
          {[
            { id: 'household', label: dict.householdProfiler, icon: Home },
            { id: 'symptoms', label: dict.symptomTracker, icon: Activity },
            { id: 'iaq', label: dict.iaqTools, icon: Leaf },
            { id: 'challenges', label: dict.challenges, icon: Award },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSubTab(item.id as typeof subTab)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  subTab === item.id
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                {item.label}
              </button>
            );
          })}
        </div>
        <span className="text-xs font-mono text-slate-600 px-2">
          Offline IndexedDB + Cloud Sync Ready
        </span>
      </div>

      {/* TAB 1: Household Profiles */}
      {subTab === 'household' && activeHousehold && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <h2 className="text-base font-bold text-slate-900">Your Household Profiles</h2>
            <div className="space-y-2">
              {households.map((hh) => (
                <div
                  key={hh.id}
                  className={`flex items-center justify-between p-3 rounded-lg border ${
                    hh.id === activeHousehold.id
                      ? 'border-teal-600 bg-teal-50/50'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectHousehold(hh.id)}
                    className="text-left flex-1"
                  >
                    <p className="text-sm font-bold text-slate-900">{hh.name}</p>
                    <p className="text-xs text-slate-500">
                      {hh.location} · {hh.members.length} members
                    </p>
                  </button>
                  {households.length > 1 && (
                    <button
                      type="button"
                      aria-label={`Delete household ${hh.name}`}
                      onClick={() => onDeleteHousehold(hh.id)}
                      className="p-1.5 text-slate-400 hover:text-red-600 rounded-md"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <form
              onSubmit={handleCreateHousehold}
              className="pt-4 border-t border-slate-200 space-y-3"
            >
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Create Additional Household
              </h3>
              <input
                type="text"
                value={newHHName}
                onChange={(e) => setNewHHName(e.target.value)}
                placeholder="e.g., Parents Home (Lucknow)"
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg"
              />
              <input
                type="text"
                value={newHHCity}
                onChange={(e) => setNewHHCity(e.target.value)}
                placeholder="City"
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg"
              />
              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-4 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                Add Household Profile
              </button>
            </form>
          </div>

          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Members in {activeHousehold.name}
                </h2>
                <p className="text-xs text-slate-500">
                  Deterministic recommendations adapt instantaneously when you add or edit members.
                </p>
              </div>
              <span className="text-xs font-mono text-slate-600">
                {activeHousehold.members.length}/15
              </span>
            </div>

            <div className="divide-y divide-slate-200">
              {activeHousehold.members.map((m) => (
                <div key={m.id} className="py-3 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold text-slate-900">
                      {m.name}{' '}
                      <span className="text-xs font-normal text-slate-500 capitalize">
                        · {m.ageGroup} · {m.activityLevel}
                      </span>
                    </p>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Conditions:{' '}
                      {m.conditions.length > 0
                        ? m.conditions.join(', ').replace(/_/g, ' ')
                        : 'None reported'}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Remove member ${m.name}`}
                    onClick={() => handleRemoveMember(m.id)}
                    className="p-1.5 text-slate-400 hover:text-red-600 rounded-md"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {activeHousehold.members.length === 0 && (
                <p className="py-4 text-sm text-slate-500">
                  No members added yet. Add a family member below to personalize vulnerability
                  rules.
                </p>
              )}
            </div>

            <form onSubmit={handleAddMember} className="pt-4 border-t border-slate-200 space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <UserPlus className="w-3.5 h-3.5" aria-hidden="true" />
                Add Family Member
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  type="text"
                  value={memberName}
                  onChange={(e) => setMemberName(e.target.value)}
                  placeholder="Member name"
                  required
                  className="px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg"
                />
                <select
                  aria-label="Age group"
                  value={memberAge}
                  onChange={(e) => setMemberAge(e.target.value as AgeGroup)}
                  className="px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg"
                >
                  <option value="infant">Infant (0–2 yrs)</option>
                  <option value="child">Child (3–17 yrs)</option>
                  <option value="adult">Adult (18–59 yrs)</option>
                  <option value="elderly">Elderly (60+ yrs)</option>
                </select>
                <select
                  aria-label="Activity level"
                  value={memberActivity}
                  onChange={(e) => setMemberActivity(e.target.value as ActivityLevel)}
                  className="px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg"
                >
                  <option value="sedentary">Sedentary</option>
                  <option value="moderate">Moderate</option>
                  <option value="active">Active / Athlete</option>
                </select>
              </div>

              <div className="flex flex-wrap gap-3">
                {HEALTH_CONDITIONS.map((cond) => {
                  const checked = memberConditions.includes(cond.id);
                  return (
                    <label
                      key={cond.id}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setMemberConditions((prev) =>
                            checked ? prev.filter((c) => c !== cond.id) : [...prev, cond.id],
                          )
                        }
                        className="rounded border-slate-300 text-teal-600 focus:ring-teal-600"
                      />
                      {cond.label}
                    </label>
                  );
                })}
              </div>

              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700"
              >
                Save Member to Profile
              </button>
            </form>
          </div>
        </div>
      )}

      {/* TAB 2: Symptoms, Exposure, CSV/Print Export & Google Calendar */}
      {subTab === 'symptoms' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <h2 className="text-base font-bold text-slate-900">
                Daily Exposure &amp; Symptom Logger
              </h2>
              <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1">
                <p className="font-bold text-slate-900">
                  Live Exposure Estimate:{' '}
                  <span className="font-mono">{exposure.exposureUnits} AQI-hrs</span> (
                  {exposure.riskLevel})
                </p>
                <p className="text-slate-600">
                  Estimated PM2.5 inhaled dose ≈{' '}
                  <span className="font-mono font-semibold">{exposure.cigaretteEquivalent}</span>{' '}
                  cigarette-equivalents at AQI {currentAqi}.
                </p>
              </div>

              <form onSubmit={handleLogSymptom} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="symptom-type"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Symptom
                    </label>
                    <select
                      id="symptom-type"
                      value={symptomType}
                      onChange={(e) => setSymptomType(e.target.value as SymptomType)}
                      className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg"
                    >
                      <option value="cough">Cough</option>
                      <option value="breathlessness">Breathlessness</option>
                      <option value="eye_irritation">Eye Irritation</option>
                      <option value="headache">Headache</option>
                      <option value="wheezing">Wheezing</option>
                      <option value="fatigue">Fatigue</option>
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor="symptom-sev"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Severity (1–5)
                    </label>
                    <select
                      id="symptom-sev"
                      value={severity}
                      onChange={(e) => setSeverity(Number(e.target.value) as 1 | 2 | 3 | 4 | 5)}
                      className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg"
                    >
                      {[1, 2, 3, 4, 5].map((n) => (
                        <option key={n} value={n}>
                          {n} — {n <= 2 ? 'Mild' : n === 3 ? 'Moderate' : 'Severe'}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="outdoor-mins"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Outdoor Minutes Today ({outdoorMinutes} min)
                  </label>
                  <input
                    id="outdoor-mins"
                    type="range"
                    min={0}
                    max={480}
                    step={15}
                    value={outdoorMinutes}
                    onChange={(e) => setOutdoorMinutes(Number(e.target.value))}
                    className="w-full accent-teal-600"
                  />
                </div>

                <input
                  type="text"
                  value={medicationTaken}
                  onChange={(e) => setMedicationTaken(e.target.value)}
                  placeholder="Medication / Inhaler taken (optional)"
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg"
                />

                <input
                  type="text"
                  value={symptomNotes}
                  onChange={(e) => setSymptomNotes(e.target.value)}
                  placeholder="Notes (e.g. after morning metro walk)"
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg"
                />

                <button
                  type="submit"
                  className="w-full py-2.5 text-sm font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700"
                >
                  Log Health Entry
                </button>
              </form>
            </div>

            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-base font-bold text-slate-900">
                  Exposure &amp; Symptom Trends ({symptoms.length} records)
                </h2>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleExportCSV}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                  >
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                    Export CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                  >
                    <Printer className="w-3.5 h-3.5" aria-hidden="true" />
                    Print PDF
                  </button>
                </div>
              </div>

              <div className="h-52 w-full">
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748B' }} />
                      <YAxis tick={{ fontSize: 11, fill: '#64748B' }} />
                      <Tooltip />
                      <Bar
                        dataKey="exposure"
                        name="Exposure (AQI-hrs)"
                        fill="#0D9488"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-sm text-slate-500 border border-dashed border-slate-200 rounded-lg">
                    Log your first symptom or daily exposure entry to render trend analytics.
                  </div>
                )}
              </div>

              {/* Doctor Visit Google Calendar Scheduler */}
              <div className="pt-4 border-t border-slate-200 space-y-3">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-teal-600" aria-hidden="true" />
                  Doctor Consultation Scheduler (Google Calendar)
                </h3>
                <form
                  onSubmit={handleScheduleDoctor}
                  className="grid grid-cols-1 sm:grid-cols-3 gap-2"
                >
                  <input
                    type="text"
                    value={doctorTitle}
                    onChange={(e) => setDoctorTitle(e.target.value)}
                    className="px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg"
                    required
                  />
                  <input
                    type="datetime-local"
                    value={doctorDate}
                    onChange={(e) => setDoctorDate(e.target.value)}
                    className="px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg"
                    required
                  />
                  <button
                    type="submit"
                    className="px-3 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800"
                  >
                    {hasCalendarAuth ? 'Add to Google Calendar' : 'Sign in to Sync'}
                  </button>
                </form>
                {calendarFeedback && <p className="text-xs text-teal-800">{calendarFeedback}</p>}
                {calendarEvents.length > 0 && (
                  <div className="text-xs text-slate-600 space-y-1">
                    <p className="font-semibold text-slate-800">Upcoming Google Calendar Events:</p>
                    {calendarEvents.slice(0, 3).map((ev) => (
                      <div key={ev.id} className="flex justify-between">
                        <span className="truncate">{ev.summary}</span>
                        <span className="font-mono text-slate-500 shrink-0 ml-2">
                          {ev.start ? new Date(ev.start).toLocaleDateString() : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: IAQ Tools */}
      {subTab === 'iaq' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <h2 className="text-base font-bold text-slate-900">
              Air Purifier CADR &amp; Cost-Benefit Calculator
            </h2>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label
                  htmlFor="room-sqft"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Room Area (sq ft)
                </label>
                <input
                  id="room-sqft"
                  type="number"
                  min={40}
                  max={2000}
                  value={roomSqFt}
                  onChange={(e) => setRoomSqFt(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono bg-slate-50 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label
                  htmlFor="room-ceil"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Ceiling (ft)
                </label>
                <input
                  id="room-ceil"
                  type="number"
                  min={7}
                  max={18}
                  value={ceilingFt}
                  onChange={(e) => setCeilingFt(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono bg-slate-50 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label
                  htmlFor="purifier-cadr"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  CADR (m³/h)
                </label>
                <input
                  id="purifier-cadr"
                  type="number"
                  min={50}
                  max={1200}
                  value={cadrM3h}
                  onChange={(e) => setCadrM3h(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono bg-slate-50 border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-lg bg-slate-50 border border-slate-200">
              <div>
                <span className="text-xs text-slate-500">ACH Rate</span>
                <p className="text-xl font-bold font-mono text-slate-900">{iaqResult.ach}x</p>
              </div>
              <div>
                <span className="text-xs text-slate-500">Indoor AQI</span>
                <p className="text-xl font-bold font-mono text-teal-700">
                  {iaqResult.estimatedIndoorAqi}
                </p>
              </div>
              <div>
                <span className="text-xs text-slate-500">Filter / Year</span>
                <p className="text-xl font-bold font-mono text-slate-900">
                  ₹{iaqResult.annualFilterCostInr}
                </p>
              </div>
              <div>
                <span className="text-xs text-slate-500">Power / Mo</span>
                <p className="text-xl font-bold font-mono text-slate-900">
                  ₹{iaqResult.monthlyPowerCostInr}
                </p>
              </div>
            </div>
            <p className="text-xs text-slate-700">
              <strong>Verdict:</strong> {iaqResult.verdict} · Recommended CADR for{' '}
              {iaqResult.roomVolumeM3} m³ room:{' '}
              <span className="font-mono font-bold">{iaqResult.recommendedCadrM3h} m³/h</span> (
              {iaqResult.pm25ReductionPercent}% PM2.5 reduction).
            </p>

            <div className="pt-4 border-t border-slate-200 space-y-2">
              <h3 className="text-sm font-bold text-slate-900">
                Room Ventilation Window Optimizer
              </h3>
              <p className="text-xs text-slate-700">{ventilationAdvice.reason}</p>
            </div>
          </div>

          <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <h2 className="text-base font-bold text-slate-900">
              Natural Air-Purifying Plants &amp; Low-Cost DIY IAQ
            </h2>
            <div className="divide-y divide-slate-200">
              {INDOOR_PLANTS.map((p) => (
                <div key={p.name} className="py-3">
                  <p className="text-sm font-bold text-slate-900">{p.name}</p>
                  <p className="text-xs text-slate-600 mt-0.5">{p.benefit}</p>
                  <p className="text-[11px] font-mono text-teal-700 mt-0.5">{p.placement}</p>
                </div>
              ))}
            </div>
            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-1.5">
              <p className="font-bold text-slate-900">
                Zero-Cost / Low-Cost Indian Household IAQ Tips
              </p>
              <p>
                • Tape a HEPA-13 replacement filter (~₹1,500) behind a standard box/table fan for
                DIY Corsi-Rosenthal filtration.
              </p>
              <p>
                • Switch from dry broom sweeping (jhadu) to wet-mopping to prevent resuspending
                settled PM10 road dust.
              </p>
              <p>
                • Seal AC exhaust vents &amp; wooden window gaps with ₹120 foam weatherstrip tape
                during severe winter smog.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: Clean Air Challenges & Gamification */}
      {subTab === 'challenges' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Clean Air Challenges &amp; Badges
              </h2>
              <p className="text-xs text-slate-500">
                Build protective household habits during high-pollution weeks. Progress is saved
                locally and synced to your account.
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs text-slate-500 uppercase tracking-wider">
                Household Score
              </span>
              <p className="text-2xl font-bold font-mono text-teal-700">{totalPoints} pts</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {challenges.map((c) => {
              const pct = Math.min(100, Math.round((c.progress / c.target) * 100));
              return (
                <div
                  key={c.id}
                  className="border border-slate-200 rounded-xl p-5 flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono font-bold text-teal-700">+{c.points} pts</span>
                      <span className="text-slate-500">
                        {c.completed ? `Unlocked: ${c.badgeName}` : c.badgeName}
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-slate-900">{c.title}</h3>
                    <p className="text-xs text-slate-600">{c.description}</p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-xs font-mono text-slate-600">
                      <span>Progress</span>
                      <span>
                        {c.progress}/{c.target} ({pct}%)
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-teal-600 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <button
                      type="button"
                      disabled={c.completed}
                      onClick={() => onIncrementChallenge(c.id)}
                      className={`w-full py-2 text-xs font-semibold rounded-lg transition-colors ${
                        c.completed
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 cursor-default'
                          : 'bg-slate-900 text-white hover:bg-slate-800'
                      }`}
                    >
                      {c.completed ? 'Challenge Completed' : 'Log Today’s Action (+1)'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
