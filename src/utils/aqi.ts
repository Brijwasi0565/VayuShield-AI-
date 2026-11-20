import type { AQIHourlyPoint, CityPreset, PollutantReadings } from '../types/env';

export const INDIAN_CITIES: CityPreset[] = [
  { name: 'New Delhi', state: 'Delhi NCR', region: 'north', latitude: 28.6139, longitude: 77.209 },
  { name: 'Mumbai', state: 'Maharashtra', region: 'west', latitude: 19.076, longitude: 72.8777 },
  { name: 'Bengaluru', state: 'Karnataka', region: 'south', latitude: 12.9716, longitude: 77.5946 },
  { name: 'Kolkata', state: 'West Bengal', region: 'east', latitude: 22.5726, longitude: 88.3639 },
  { name: 'Chennai', state: 'Tamil Nadu', region: 'south', latitude: 13.0827, longitude: 80.2707 },
  { name: 'Hyderabad', state: 'Telangana', region: 'south', latitude: 17.385, longitude: 78.4867 },
  { name: 'Ahmedabad', state: 'Gujarat', region: 'west', latitude: 23.0225, longitude: 72.5714 },
  { name: 'Pune', state: 'Maharashtra', region: 'west', latitude: 18.5204, longitude: 73.8567 },
  {
    name: 'Lucknow',
    state: 'Uttar Pradesh',
    region: 'north',
    latitude: 26.8467,
    longitude: 80.9462,
  },
  { name: 'Jaipur', state: 'Rajasthan', region: 'north', latitude: 26.9124, longitude: 75.7873 },
  { name: 'Patna', state: 'Bihar', region: 'east', latitude: 25.5941, longitude: 85.1376 },
  { name: 'Gurugram', state: 'Haryana', region: 'north', latitude: 28.4595, longitude: 77.0266 },
];

// Official CPCB National Air Quality Index (NAQI) linear sub-index breakpoints
const PM25_BREAKPOINTS = [
  [0, 30, 0, 50],
  [30.01, 60, 51, 100],
  [60.01, 90, 101, 200],
  [90.01, 120, 201, 300],
  [120.01, 250, 301, 400],
  [250.01, 500, 401, 500],
] as const;

const PM10_BREAKPOINTS = [
  [0, 50, 0, 50],
  [50.01, 100, 51, 100],
  [100.01, 250, 101, 200],
  [250.01, 350, 201, 300],
  [350.01, 430, 301, 400],
  [430.01, 800, 401, 500],
] as const;

const NO2_BREAKPOINTS = [
  [0, 40, 0, 50],
  [40.01, 80, 51, 100],
  [80.01, 180, 101, 200],
  [180.01, 280, 201, 300],
  [280.01, 400, 301, 400],
  [400.01, 800, 401, 500],
] as const;

const O3_BREAKPOINTS = [
  [0, 50, 0, 50],
  [50.01, 100, 51, 100],
  [100.01, 168, 101, 200],
  [168.01, 208, 201, 300],
  [208.01, 748, 301, 400],
  [748.01, 1000, 401, 500],
] as const;

function computeSubIndex(
  value: number | null | undefined,
  breakpoints: readonly (readonly [number, number, number, number])[],
): number {
  if (value === null || value === undefined || Number.isNaN(value) || value < 0) {
    return 0;
  }
  for (const [bpLow, bpHigh, iLow, iHigh] of breakpoints) {
    if (value <= bpHigh) {
      const ratio = (value - bpLow) / Math.max(0.01, bpHigh - bpLow);
      return Math.round(iLow + ratio * (iHigh - iLow));
    }
  }
  return 500;
}

export function calculateIndianAQI(pollutants: PollutantReadings): number {
  const subs = [
    computeSubIndex(pollutants.pm25, PM25_BREAKPOINTS),
    computeSubIndex(pollutants.pm10, PM10_BREAKPOINTS),
    computeSubIndex(pollutants.no2, NO2_BREAKPOINTS),
    computeSubIndex(pollutants.o3, O3_BREAKPOINTS),
  ];
  return Math.max(...subs, 0);
}

export interface AQICategoryStyle {
  category: string;
  severity: 'good' | 'moderate' | 'sensitive' | 'unhealthy' | 'very_unhealthy' | 'hazardous';
  hex: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
  emergency: boolean;
  description: string;
}

export function getAQICategoryInfo(aqi: number): AQICategoryStyle {
  if (aqi <= 50) {
    return {
      category: 'Good',
      severity: 'good',
      hex: '#16A34A',
      bgClass: 'bg-emerald-50',
      textClass: 'text-emerald-800',
      borderClass: 'border-emerald-200',
      emergency: false,
      description:
        'Minimal respiratory impact. Ideal for outdoor exercise and natural ventilation.',
    };
  }
  if (aqi <= 100) {
    return {
      category: 'Moderate',
      severity: 'moderate',
      hex: '#CA8A04',
      bgClass: 'bg-amber-50',
      textClass: 'text-amber-800',
      borderClass: 'border-amber-200',
      emergency: false,
      description:
        'Acceptable air quality; unusually sensitive individuals should monitor symptoms.',
    };
  }
  if (aqi <= 200) {
    return {
      category: 'Unhealthy for Sensitive Groups',
      severity: 'sensitive',
      hex: '#EA580C',
      bgClass: 'bg-orange-50',
      textClass: 'text-orange-900',
      borderClass: 'border-orange-200',
      emergency: false,
      description:
        'Children, elderly, and asthma/COPD patients may experience breathing discomfort.',
    };
  }
  if (aqi <= 300) {
    return {
      category: 'Unhealthy',
      severity: 'unhealthy',
      hex: '#DC2626',
      bgClass: 'bg-red-50',
      textClass: 'text-red-900',
      borderClass: 'border-red-200',
      emergency: false,
      description: 'Prolonged outdoor exposure increases cardiopulmonary strain across all groups.',
    };
  }
  if (aqi <= 400) {
    return {
      category: 'Very Unhealthy',
      severity: 'very_unhealthy',
      hex: '#9333EA',
      bgClass: 'bg-purple-50',
      textClass: 'text-purple-900',
      borderClass: 'border-purple-200',
      emergency: true,
      description:
        'Respiratory emergency risk. Seal indoor rooms, run HEPA purification, wear N95/N99 outdoors.',
    };
  }
  return {
    category: 'Hazardous',
    severity: 'hazardous',
    hex: '#881337',
    bgClass: 'bg-rose-950/10',
    textClass: 'text-rose-950',
    borderClass: 'border-rose-300',
    emergency: true,
    description:
      'Severe public health hazard. Stay indoors with air filtration and follow emergency protocol.',
  };
}

export function calculateDailyExposure(
  outdoorMinutes: number,
  aqi: number,
): {
  exposureUnits: number;
  cigaretteEquivalent: number;
  riskLevel: 'Low' | 'Moderate' | 'High' | 'Critical';
  summary: string;
} {
  const safeMinutes = Math.max(0, Math.min(1440, outdoorMinutes));
  const safeAqi = Math.max(0, aqi);
  const hours = safeMinutes / 60;
  const exposureUnits = Math.round(hours * safeAqi);
  // Approximate PM2.5 proxy (~22 ug/m3 per 1 cigarette over 24h; scaled to active outdoor dose)
  const pm25Approx = safeAqi * 0.55;
  const cigaretteEquivalent = Number(((pm25Approx / 22) * (hours / 24)).toFixed(2));

  let riskLevel: 'Low' | 'Moderate' | 'High' | 'Critical' = 'Low';
  if (exposureUnits >= 600) riskLevel = 'Critical';
  else if (exposureUnits >= 300) riskLevel = 'High';
  else if (exposureUnits >= 120) riskLevel = 'Moderate';

  return {
    exposureUnits,
    cigaretteEquivalent,
    riskLevel,
    summary: `${safeMinutes} min at AQI ${safeAqi} = ${exposureUnits} AQI-hrs (${riskLevel} dose)`,
  };
}

export function calculateIAQEffectiveness(
  roomSqFt: number,
  ceilingFt: number,
  purifierCadrM3h: number,
  outdoorAqi: number,
): {
  roomVolumeM3: number;
  ach: number;
  estimatedIndoorAqi: number;
  pm25ReductionPercent: number;
  recommendedCadrM3h: number;
  annualFilterCostInr: number;
  monthlyPowerCostInr: number;
  verdict: string;
} {
  const safeSqFt = Math.max(40, roomSqFt);
  const safeCeiling = Math.max(7, ceilingFt);
  const roomVolumeM3 = Number((safeSqFt * safeCeiling * 0.0283168).toFixed(1));
  const ach = Number((purifierCadrM3h / Math.max(1, roomVolumeM3)).toFixed(2));

  // Single-zone steady-state indoor/outdoor filtration model (ach vs infiltration ~0.6/hr)
  const infiltrationRate = 0.6;
  const reductionFraction = purifierCadrM3h > 0 ? ach / (ach + infiltrationRate + 0.25) : 0;
  const pm25ReductionPercent = Math.min(94, Math.round(reductionFraction * 100));
  const estimatedIndoorAqi = Math.max(
    12,
    Math.round(outdoorAqi * (1 - pm25ReductionPercent / 100)),
  );
  const recommendedCadrM3h = Math.round(roomVolumeM3 * 4.8);

  // Typical Indian HEPA-13 replacement filter ₹2,400–₹4,200/yr + ~40W power @ ₹8/kWh 12h/day
  const annualFilterCostInr = purifierCadrM3h > 350 ? 3800 : 2500;
  const monthlyPowerCostInr = Math.round(0.045 * 12 * 30 * 8 * (purifierCadrM3h > 350 ? 1.25 : 1));

  let verdict = 'Adequate for baseline filtration';
  if (ach >= 4.8) verdict = 'Hospital-grade protection (≥ 4.8 ACH)';
  else if (ach >= 3.0) verdict = 'Strong residential protection (3.0–4.7 ACH)';
  else if (ach < 2.0) verdict = 'Under-sized for room volume — add seal or second unit';

  return {
    roomVolumeM3,
    ach,
    estimatedIndoorAqi,
    pm25ReductionPercent,
    recommendedCadrM3h,
    annualFilterCostInr,
    monthlyPowerCostInr,
    verdict,
  };
}

export function getVentilationWindowAdvice(
  hourly: AQIHourlyPoint[],
  windSpeedKmh: number,
): {
  bestWindowLabel: string;
  bestWindowAqi: number;
  shouldOpenWindowsNow: boolean;
  reason: string;
} {
  if (!hourly || hourly.length === 0) {
    return {
      bestWindowLabel: '14:00 – 16:00',
      bestWindowAqi: 100,
      shouldOpenWindowsNow: false,
      reason: 'Afternoon thermal mixing typically disperses ground-level particulates.',
    };
  }
  const next24 = hourly.slice(0, 24);
  let bestIdx = 0;
  let bestAvg = Infinity;
  for (let i = 0; i < next24.length - 1; i++) {
    const avg = (next24[i].aqi + next24[i + 1].aqi) / 2;
    if (avg < bestAvg) {
      bestAvg = avg;
      bestIdx = i;
    }
  }
  const startLabel = next24[bestIdx].time.slice(11, 16) || '14:00';
  const endLabel = next24[Math.min(bestIdx + 2, next24.length - 1)].time.slice(11, 16) || '16:00';
  const currentAqi = next24[0]?.aqi ?? 120;
  const shouldOpenWindowsNow = currentAqi <= 85 && windSpeedKmh >= 6;

  return {
    bestWindowLabel: `${startLabel} – ${endLabel}`,
    bestWindowAqi: Math.round(bestAvg),
    shouldOpenWindowsNow,
    reason: shouldOpenWindowsNow
      ? `Current AQI (${currentAqi}) and breeze (${windSpeedKmh} km/h) support brief cross-ventilation.`
      : `Keep windows sealed now; best dispersion window is ${startLabel}–${endLabel} (est. AQI ${Math.round(bestAvg)}).`,
  };
}

export function haversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Number((R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(1));
}
