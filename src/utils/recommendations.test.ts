import test from 'node:test';
import assert from 'node:assert/strict';
import { generateDeterministicRecommendations } from './recommendations';
import type { HouseholdMember } from '../types/env';

const sensitiveFamily: HouseholdMember[] = [
  { id: 'm1', name: 'Aarav', ageGroup: 'child', conditions: ['asthma'], activityLevel: 'active' },
  {
    id: 'm2',
    name: 'Dadi',
    ageGroup: 'elderly',
    conditions: ['heart_disease'],
    activityLevel: 'sedentary',
  },
];

test('Good AQI produces safe outdoor guidance', () => {
  const rec = generateDeterministicRecommendations({
    currentAQI: 38,
    members: [
      { id: 'm1', name: 'Riya', ageGroup: 'adult', conditions: [], activityLevel: 'active' },
    ],
    timeOfDay: 'morning',
    plannedActivity: 'outdoor_exercise',
  });
  assert.equal(rec.outdoorGuidance, 'safe');
  assert.equal(rec.severityLevel, 'good');
});

test('Sensitive household at AQI 145 triggers avoid guidance and asthma/elderly advice', () => {
  const rec = generateDeterministicRecommendations({
    currentAQI: 145,
    members: sensitiveFamily,
    timeOfDay: 'morning',
    plannedActivity: 'school_drop',
  });
  assert.equal(rec.outdoorGuidance, 'avoid');
  assert.ok(rec.vulnerable.some((v) => v.includes('Asthma/COPD')));
  assert.ok(rec.vulnerable.some((v) => v.includes('Elderly')));
  assert.ok(rec.medication.some((m) => m.includes('inhaler')));
});

test('Hazardous AQI > 300 or nearby fire triggers strict sealing and N95/N99 mask rules', () => {
  const rec = generateDeterministicRecommendations({
    currentAQI: 340,
    members: sensitiveFamily,
    timeOfDay: 'evening',
    plannedActivity: 'commute',
    nearbyFireCount: 2,
  });
  assert.equal(rec.outdoorGuidance, 'avoid');
  assert.ok(rec.mask.includes('N95') || rec.mask.includes('N99'));
  assert.ok(rec.ventilation.toLowerCase().includes('sealed'));
});
