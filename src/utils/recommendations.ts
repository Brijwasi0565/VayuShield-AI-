import type {
  HouseholdMember,
  PlannedActivity,
  RecommendationResult,
  TimeOfDay,
} from '../types/env';
import { getAQICategoryInfo } from './aqi';

/**
 * Deterministic rule-based environmental health recommendation engine.
 * Grounded in verified clinical & regulatory guidelines:
 * 1. WHO Global Air Quality Guidelines (2021)
 * 2. CPCB India National Air Quality Index (NAQI) Health Advisories
 * 3. US EPA AQI Guide for Particle Pollution & Sensitive Groups
 * 4. ICMR Respiratory & Maternal PM2.5 Protection Guidance
 */
export function generateDeterministicRecommendations(params: {
  currentAQI: number;
  members: HouseholdMember[];
  timeOfDay: TimeOfDay;
  plannedActivity: PlannedActivity;
  nearbyFireCount?: number;
}): RecommendationResult {
  const { currentAQI, members, timeOfDay, plannedActivity, nearbyFireCount = 0 } = params;
  const aqiInfo = getAQICategoryInfo(currentAQI);

  const hasInfants = members.some((m) => m.ageGroup === 'infant');
  const hasChildren = members.some((m) => m.ageGroup === 'child');
  const hasElderly = members.some((m) => m.ageGroup === 'elderly');
  const hasAsthma = members.some((m) => m.conditions.includes('asthma'));
  const hasCOPD = members.some((m) => m.conditions.includes('copd'));
  const hasAllergies = members.some((m) => m.conditions.includes('allergies'));
  const hasHeartDisease = members.some((m) => m.conditions.includes('heart_disease'));
  const hasPregnancy = members.some((m) => m.conditions.includes('pregnancy'));
  const hasActiveMembers = members.some((m) => m.activityLevel === 'active');

  const isVulnerableHousehold =
    hasInfants ||
    hasChildren ||
    hasElderly ||
    hasAsthma ||
    hasCOPD ||
    hasHeartDisease ||
    hasPregnancy;

  const vulnerable: string[] = [];
  const indoor: string[] = [];
  const medication: string[] = [];
  const routineTips: string[] = [];
  const guidelinesCited: string[] = [
    'CPCB India NAQI Health Advisory',
    'WHO 2021 Global Air Quality Guidelines',
  ];

  // Rule 1-4: Overall outdoor guidance & severity band
  let overall = 'Normal outdoor activities are safe for all household members.';
  let outdoorGuidance: 'safe' | 'caution' | 'avoid' = 'safe';
  let mask = 'No respiratory mask required under normal ambient conditions.';
  let ventilation = 'Open windows for 20-30 minutes for natural fresh-air exchange.';
  let exercise = 'Outdoor cardio, walking, and sports are safe.';

  if (currentAQI > 300 || nearbyFireCount > 0) {
    outdoorGuidance = 'avoid';
    overall =
      nearbyFireCount > 0 && currentAQI <= 300
        ? 'Smoke plume alert nearby — stay indoors and seal exterior air gaps.'
        : 'Severe/Hazardous air emergency — avoid all outdoor exposure.';
    mask =
      'Certified N95 or N99 respirator with tight nose-bridge seal required for any unavoidable exit.';
    ventilation =
      'Keep all windows and balcony doors tightly sealed; place damp cloths under door gaps.';
    exercise =
      'Suspend outdoor workouts; switch to low-impact indoor stretching or breathing exercises.';
    indoor.push('Run HEPA-13 air purifiers on High/Turbo continuously in occupied bedrooms.');
    indoor.push(
      'Avoid burning incense (agarbatti), mosquito coils, candles, or frying without an exhaust chimney.',
    );
    guidelinesCited.push('ICMR Severe Pollution Emergency Advisory');
  } else if (currentAQI > 200) {
    outdoorGuidance = 'avoid';
    overall = 'Unhealthy air — cancel non-essential outdoor activities and protect indoor air.';
    mask = 'N95 respirator strongly recommended for commutes and errands over 15 minutes.';
    ventilation =
      'Keep windows closed during morning and evening traffic peaks; ventilate only if afternoon AQI dips.';
    exercise = 'Move jogging, cycling, and yoga indoors away from roadside dust.';
    indoor.push('Run air purifier on Medium-High; wet-mop floors daily instead of dry sweeping.');
    indoor.push('Use kitchen exhaust fan while cooking to prevent indoor PM2.5 spikes.');
  } else if (currentAQI > 100) {
    outdoorGuidance = isVulnerableHousehold ? 'avoid' : 'caution';
    overall = isVulnerableHousehold
      ? 'Air is unhealthy for sensitive household members — limit outdoor time.'
      : 'Moderate-to-poor air — reduce prolonged high-exertion outdoor activities.';
    mask = isVulnerableHousehold
      ? 'N95 mask advised for sensitive members and roadside commuters.'
      : 'Consider an N95 mask along high-traffic corridors or construction zones.';
    ventilation =
      'Keep roadside windows shut; cross-ventilate briefly during mid-afternoon (14:00–16:00).';
    exercise =
      plannedActivity === 'outdoor_exercise' || hasActiveMembers
        ? 'Shorten outdoor runs by 40% and avoid arterial roads; prefer tree-lined parks or indoor training.'
        : 'Light walking is acceptable for healthy adults; avoid strenuous sprints.';
    indoor.push('Run air purifier on Auto/Medium mode and wipe window sills with a damp cloth.');
  } else if (currentAQI > 50) {
    outdoorGuidance = isVulnerableHousehold ? 'caution' : 'safe';
    overall = isVulnerableHousehold
      ? 'Moderate air — sensitive members should pace prolonged outdoor exertion.'
      : 'Moderate air quality — most routine activities can proceed normally.';
    mask =
      hasAsthma || hasCOPD
        ? 'Keep a fitted N95 mask handy near heavy traffic.'
        : 'Mask optional except near visible dust or smoke.';
    ventilation = 'Natural ventilation is fine away from peak rush-hour traffic.';
    exercise =
      'Outdoor exercise is generally safe; watch for throat irritation if training > 60 minutes.';
    indoor.push('Keep indoor air circulating cleanly; vacuum rugs and curtains weekly.');
  } else {
    indoor.push(
      'Enjoy natural cross-ventilation; clean purifier pre-filters while ambient load is low.',
    );
  }

  // Rule 5-9: Vulnerable member deterministic rules
  if (hasInfants) {
    vulnerable.push(
      currentAQI > 100
        ? 'Infants: Keep completely indoors; developing lungs absorb more PM2.5 per kg body weight.'
        : 'Infants: Stroller walks safe in shaded parks away from vehicle exhaust.',
    );
  }
  if (hasChildren) {
    vulnerable.push(
      currentAQI > 150
        ? 'Children: Skip outdoor recess/sports; arrange indoor play and ensure hydration.'
        : currentAQI > 100
          ? 'Children: Limit vigorous outdoor sports to under 30 minutes.'
          : 'Children: Outdoor school play is safe today.',
    );
  }
  if (hasElderly) {
    vulnerable.push(
      currentAQI > 100
        ? 'Elderly: Postpone early-morning walks until midday warmth lifts ground-level inversion.'
        : 'Elderly: Gentle morning or evening walks are safe.',
    );
  }
  if (hasAsthma || hasCOPD) {
    vulnerable.push(
      currentAQI > 100
        ? 'Asthma/COPD: Avoid exertion outdoors; cold/polluted air triggers bronchospasm.'
        : 'Asthma/COPD: Carry rescue inhaler when stepping outside.',
    );
    medication.push(
      currentAQI > 150
        ? 'Keep reliever inhaler (salbutamol) within reach and verify preventer controller dose timing.'
        : 'Maintain regular controller inhaler schedule and log peak-flow if symptomatic.',
    );
    guidelinesCited.push('GINA / GOLD Respiratory Air Quality Protocol');
  }
  if (hasHeartDisease) {
    vulnerable.push(
      currentAQI > 100
        ? 'Cardiovascular care: Fine PM2.5 elevates blood pressure — avoid strenuous outdoor climbing or rushing.'
        : 'Cardiovascular care: Pace outdoor walks steadily and avoid roadside exhaust.',
    );
    medication.push(
      'Take prescribed cardiac/blood-pressure medications on schedule; report chest tightness immediately.',
    );
  }
  if (hasPregnancy) {
    vulnerable.push(
      currentAQI > 100
        ? 'Pregnancy protection: Stay in filtered indoor spaces; PM2.5 exposure correlates with low birth weight.'
        : 'Pregnancy: Light outdoor walks in green spaces are safe.',
    );
  }
  if (hasAllergies && currentAQI > 75) {
    vulnerable.push(
      'Allergies: Rinse face and nasal passages (saline wash) after returning indoors.',
    );
    medication.push(
      'Review prescribed antihistamine or nasal spray schedule before high-dust errands.',
    );
  }

  // Rule 10-13: Time of day & thermal inversion rules (India-specific urban meteorology)
  if (timeOfDay === 'morning') {
    if (currentAQI > 120) {
      routineTips.push(
        'Morning thermal inversion traps PM2.5 near street level (06:00–09:30); delay outdoor walks until after 11:30.',
      );
    } else {
      routineTips.push('Morning air is clear enough for brisk walking or school commutes.');
    }
  } else if (timeOfDay === 'afternoon') {
    routineTips.push(
      currentAQI <= 150
        ? 'Afternoon boundary-layer mixing generally yields the day’s lowest particulate density.'
        : 'Even with afternoon mixing, elevated AQI persists — keep errands brief.',
    );
  } else if (timeOfDay === 'evening') {
    routineTips.push(
      currentAQI > 120
        ? 'Evening traffic and cooling air raise PM2.5 rapidly after 18:30; complete outdoor errands earlier.'
        : 'Evening temperatures are comfortable; avoid major traffic intersections.',
    );
  } else {
    routineTips.push(
      currentAQI > 150
        ? 'Nighttime inversion worsens overnight AQI — run bedroom purifier on Silent/Sleep mode all night.'
        : 'Keep bedroom windows slightly cracked only if outdoor AQI remains below 80.',
    );
  }

  // Rule 14-16: Planned activity specific guidance
  if (plannedActivity === 'school_drop') {
    routineTips.push(
      currentAQI > 150
        ? 'School commute: Use vehicle cabin recirculation mode (AC on internal cycle) and fit child-sized N95 masks.'
        : 'School commute: Prefer shaded routes away from idling buses.',
    );
  } else if (plannedActivity === 'commute') {
    routineTips.push(
      currentAQI > 150
        ? 'Work commute: Keep car windows closed with recirculated AC, or wear a sealed N95 on two-wheelers/metro walks.'
        : 'Work commute: Low-pollution transit windows are open.',
    );
  } else if (plannedActivity === 'outdoor_exercise') {
    routineTips.push(
      currentAQI > 120
        ? 'Exercise rule: Minute ventilation rises 5–10x during running, multiplying inhaled PM2.5 — shift workout indoors.'
        : 'Exercise rule: Hydrate well and monitor breathing comfort.',
    );
  } else if (plannedActivity === 'errands') {
    routineTips.push(
      currentAQI > 150
        ? 'Errands: Batch trips into one midday window and wear a snug respirator.'
        : 'Errands: Safe to walk or cycle locally.',
    );
  }

  if (medication.length === 0) {
    medication.push(
      'Stay well hydrated (warm water/herbal fluids) to support airway mucociliary clearance.',
    );
  }

  return {
    overall,
    severityLevel: aqiInfo.severity,
    outdoorGuidance,
    vulnerable:
      vulnerable.length > 0
        ? vulnerable
        : ['No elevated individual risk flags in active household profile.'],
    indoor,
    mask,
    ventilation,
    exercise,
    medication,
    routineTips,
    guidelinesCited,
  };
}
